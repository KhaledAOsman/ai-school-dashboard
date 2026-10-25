"""
Shared Redis connection + read-through cache for heavy, user-independent
read endpoints (KPI summary, finance reports, accounting statements).

Invalidation policy (simple on purpose, so it can never serve stale money):
  * every cache key embeds a global data version: ``cache:v<N>:<key>``;
  * ANY successful write request (POST / PUT / PATCH / DELETE under /api)
    bumps that version once (see ``CacheInvalidationMiddleware``), which
    orphans every cached entry at once - the orphans then expire on TTL;
  * every entry also has a short TTL (default 60 s) as a safety net for
    writes that bypass the API (SQL scripts, migrations, imports).

Redis is optional at runtime: if it is unset or unreachable every call
falls through to the producer (no cache) and the app keeps working.
Nothing user-specific may be cached here - permission checks run in the
route dependencies BEFORE ``cached()`` is reached, and the cached payload
must be identical for everyone allowed to see it.
"""
from __future__ import annotations

import json
import time
from collections.abc import Awaitable, Callable
from typing import Any

import structlog
from fastapi.encoders import jsonable_encoder

from app.core.settings.config import get_settings

logger = structlog.get_logger("app.cache")
settings = get_settings()

_VERSION_KEY = "cache:version"
_client = None
_down_until = 0.0  # after a failure, skip Redis for a few seconds instead of timing out on every request


def get_redis():
    """Lazily-created shared asyncio Redis client, or None when Redis is not configured / down."""
    global _client
    if not settings.REDIS_URL or time.monotonic() < _down_until:
        return None
    if _client is None:
        from redis import asyncio as aioredis

        _client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=0.5,
            socket_timeout=0.5,
            health_check_interval=30,
        )
    return _client


def mark_down(err: Exception) -> None:
    global _down_until
    _down_until = time.monotonic() + 10
    logger.warning("redis_unavailable", error=str(err))


async def _version(r) -> str:
    return str(await r.get(_VERSION_KEY) or 0)


async def cached(key: str, producer: Callable[[], Awaitable[Any]], ttl: int | None = None) -> Any:
    """Return the cached JSON for ``key`` or compute it with ``producer`` and store it."""
    r = get_redis()
    if r is None:
        return await producer()
    ttl = ttl or settings.CACHE_DEFAULT_TTL
    try:
        full_key = f"cache:v{await _version(r)}:{key}"
        hit = await r.get(full_key)
        if hit is not None:
            return json.loads(hit)
    except Exception as err:  # Redis hiccup: serve fresh data, never fail the request
        mark_down(err)
        return await producer()
    value = jsonable_encoder(await producer())
    try:
        await r.set(full_key, json.dumps(value, ensure_ascii=False, separators=(",", ":")), ex=ttl)
    except Exception as err:
        mark_down(err)
    return value


async def invalidate_all() -> None:
    """Orphan every cached entry (called once per successful write request)."""
    r = get_redis()
    if r is None:
        return
    try:
        await r.incr(_VERSION_KEY)
    except Exception as err:
        mark_down(err)


async def ping() -> bool | None:
    """True/False for the readiness probe; None when Redis is not configured."""
    if not settings.REDIS_URL:
        return None
    r = get_redis()
    if r is None:
        return False
    try:
        return bool(await r.ping())
    except Exception as err:
        mark_down(err)
        return False


class CacheInvalidationMiddleware:
    """Bumps the cache version after every successful write under /api."""

    WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
    # auth writes never change cached business data
    SKIP = ("/auth/", "/fin-model/preview")

    def __init__(self, app, prefix: str = "/api") -> None:
        self.app = app
        self.prefix = prefix

    async def __call__(self, scope, receive, send) -> None:
        path = scope.get("path", "")
        if (
            scope["type"] != "http"
            or scope.get("method") not in self.WRITE_METHODS
            or not path.startswith(self.prefix)
            or any(s in path for s in self.SKIP)
        ):
            await self.app(scope, receive, send)
            return
        status_holder: dict[str, int] = {}

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
                # invalidate BEFORE the client sees the response, so its
                # immediate re-fetch can never read the pre-write snapshot
                if message["status"] < 400:
                    await invalidate_all()
            await send(message)

        await self.app(scope, receive, send_wrapper)
