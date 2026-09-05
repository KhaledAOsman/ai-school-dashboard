"""
Security headers, request correlation IDs, and structured request logging.

Applied to every response regardless of route, so no individual endpoint
can accidentally omit them (spec section 16: security headers, section 23:
structured logging with request correlation).
"""
from __future__ import annotations

import time
import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = structlog.get_logger("app.request")


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assigns a request ID, times the request, and logs a structured summary."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        request.state.request_id = request_id
        start = time.perf_counter()

        response: Response = await call_next(request)

        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        response.headers["X-Request-ID"] = request_id

        logger.info(
            "request_completed",
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
            user_id=getattr(request.state, "user_id", None),
        )
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Adds standard security headers to every response. CSP is deliberately
    conservative for an internal admin tool - tighten further if the
    frontend's asset/script sources are fully known and static.
    """

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return response
