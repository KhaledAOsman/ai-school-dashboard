"""
Rate limiting - separate budgets per kind of request (fixed windows kept in
Redis so every worker / replica shares the same counters; falls back to a
per-process in-memory window if Redis is unavailable).

    kind        what                                         key            default
    ----------  -------------------------------------------  -------------  ----------
    login       POST /auth/login                             IP             10 / min
    login_acct  POST /auth/login (checked inside the route)  e-mail         20 / hour
    auth        MFA verify, refresh, password reset/change   IP             20 / min
    reset_acct  password reset request (inside the route)    e-mail          5 / hour
    upload      POST .../attachments                         user or IP     20 / min
    heavy       imports, KPI / reports / accounting reads    user or IP     60 / min
    api         everything else under /api                   user or IP    300 / min
    api_ip      everything under /api                        IP            600 / min

Limits come from settings (``RATE_LIMIT_<KIND>`` = "count/seconds"), so
they can be tuned per environment without a code change. A blocked request
gets 429 + Retry-After and a security-log entry is NOT written here (the
middleware has no DB session) - the structured log line carries it.

Client IP: the backend is only reachable from nginx on the internal docker
network; nginx overwrites X-Real-IP with the real client address (after
resolving Cloudflare's CF-Connecting-IP from trusted ranges only), so that
header is trustworthy here.
"""
from __future__ import annotations

import hashlib
import time
from collections import defaultdict

import structlog
import jwt
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.cache import get_redis, mark_down
from app.core.settings.config import get_settings

settings = get_settings()
logger = structlog.get_logger("app.ratelimit")


def _parse(spec: str) -> tuple[int, int]:
    count, _, window = spec.partition("/")
    return int(count), int(window or 60)


LIMITS: dict[str, tuple[int, int]] = {
    "login": _parse(settings.RATE_LIMIT_LOGIN),
    "login_acct": _parse(settings.RATE_LIMIT_LOGIN_ACCOUNT),
    "auth": _parse(settings.RATE_LIMIT_AUTH),
    "reset_acct": _parse(settings.RATE_LIMIT_RESET_ACCOUNT),
    "upload": _parse(settings.RATE_LIMIT_UPLOAD),
    "heavy": _parse(settings.RATE_LIMIT_HEAVY),
    "api": _parse(settings.RATE_LIMIT_API),
    "api_ip": _parse(settings.RATE_LIMIT_API_IP),
}

_AUTH_PATHS = ("/auth/mfa/verify", "/auth/refresh", "/auth/password/reset-request", "/auth/password/reset-confirm", "/auth/password/change", "/auth/mfa/confirm", "/auth/mfa/disable")
_HEAVY_PREFIXES = ("/fin-model/preview", "/fin-model/versions/", "/kpi-dashboard", "/finance/reports", "/finance/accounting", "/finance/revenue/summary", "/crm/dashboard", "/dashboards")

# in-memory fallback: {key: (window_start, count)}
_mem: dict[str, list[float]] = defaultdict(lambda: [0.0, 0])


def client_ip(request: Request) -> str:
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "unknown")


async def hit(kind: str, ident: str) -> int | None:
    """Count one request for ``kind``/``ident``; return Retry-After seconds when over the limit."""
    limit, window = LIMITS[kind]
    now = time.time()
    bucket = int(now // window)
    key = f"rl:{kind}:{hashlib.sha256(ident.lower().encode()).hexdigest()[:24]}:{bucket}"
    retry_after = int(window - (now % window)) + 1
    r = get_redis()
    if r is not None:
        try:
            pipe = r.pipeline()
            pipe.incr(key)
            pipe.expire(key, window + 5)
            count, _ = await pipe.execute()
            return retry_after if count > limit else None
        except Exception as err:
            mark_down(err)
    slot = _mem[key]
    if slot[0] != bucket:
        slot[0], slot[1] = bucket, 0
        if len(_mem) > 50_000:  # keep the fallback bounded
            _mem.clear()
            _mem[key] = slot = [bucket, 0]
    slot[1] += 1
    return retry_after if slot[1] > limit else None


def too_many(retry_after: int) -> JSONResponse:
    return JSONResponse(
        {"error": {"message": "طلبات كثيرة في وقت قصير — حاول بعد قليل", "status_code": 429}},
        status_code=429,
        headers={"Retry-After": str(retry_after)},
    )


def _user_key(request: Request) -> str | None:
    """User id from the bearer token (signature verified, expiry ignored: this
    only picks a counter - authentication itself happens in the route)."""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    try:
        payload = jwt.decode(auth[7:], settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM], options={"verify_exp": False})
        sub = payload.get("sub")
        return f"u:{sub}" if sub else None
    except Exception:
        return None


def _kind(method: str, path: str) -> str:
    if method == "POST" and path.endswith("/auth/login"):
        return "login"
    if any(path.endswith(p) for p in _AUTH_PATHS):
        return "auth"
    if method == "POST" and path.endswith("/attachments"):
        return "upload"
    if path.endswith("/bulk-import") or any(path.startswith(p) for p in _HEAVY_PREFIXES):
        return "heavy"
    return "api"


class RateLimitMiddleware:
    """Pure ASGI middleware (no BaseHTTPMiddleware overhead)."""

    def __init__(self, app: ASGIApp, prefix: str = "/api") -> None:
        self.app = app
        self.prefix = prefix

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not settings.RATE_LIMIT_ENABLED or not scope["path"].startswith(self.prefix):
            await self.app(scope, receive, send)
            return
        request = Request(scope)
        if request.method == "OPTIONS":
            await self.app(scope, receive, send)
            return
        ip = client_ip(request)
        path = scope["path"][len(self.prefix):]
        kind = _kind(request.method, path)
        checks = [("api_ip", ip)]
        if kind in ("login", "auth"):
            checks.append((kind, ip))
        else:
            checks.append((kind, _user_key(request) or f"ip:{ip}"))
            if kind != "api":  # heavy / upload calls also spend the general budget
                checks.append(("api", _user_key(request) or f"ip:{ip}"))
        for k, ident in checks:
            retry = await hit(k, ident)
            if retry is not None:
                logger.warning("rate_limited", kind=k, path=scope["path"], ip=ip)
                await too_many(retry)(scope, receive, send)
                return
        await self.app(scope, receive, send)
