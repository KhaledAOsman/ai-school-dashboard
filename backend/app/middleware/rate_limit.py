"""
Rate limiting via slowapi (starlette-compatible wrapper around limits).

Two tiers:
    - A global default limit applied to all routes.
    - A stricter limit specifically on /auth/login and /auth/mfa/verify,
      to blunt credential-stuffing / brute-force attempts (spec section 16).

Keyed by client IP. Behind a reverse proxy, Nginx must forward the real
client IP via X-Forwarded-For for this to be meaningful - see nginx/nginx.conf.
"""
from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.settings.config import get_settings

settings = get_settings()

limiter = Limiter(key_func=get_remote_address, default_limits=[settings.GLOBAL_RATE_LIMIT])
