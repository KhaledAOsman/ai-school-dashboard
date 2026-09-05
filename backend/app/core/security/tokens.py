"""
JWT access token creation/verification, and opaque refresh token generation.

Design:
    - Access tokens: short-lived (default 15 min), JWT, carry user id + a
      session id claim. Used for API authorization. NOT stored server-side.
    - Refresh tokens: longer-lived (default 7 days), opaque random string.
      Only their HASH is stored server-side (in the `sessions` table), so a
      leaked database dump doesn't hand out usable refresh tokens.

Rationale for short access-token expiry: avoids long-lived bearer tokens
that remain valid after logout/lockout without extra server-side checks.
"""
from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt

from app.core.settings.config import get_settings

settings = get_settings()

TOKEN_TYPE_ACCESS = "access"


class TokenError(Exception):
    pass


def create_access_token(
    *, user_id: uuid.UUID, session_id: uuid.UUID, permissions: list[str]
) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "sid": str(session_id),
        "type": TOKEN_TYPE_ACCESS,
        "perms": permissions,
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as exc:
        raise TokenError("Invalid or expired token") from exc

    if payload.get("type") != TOKEN_TYPE_ACCESS:
        raise TokenError("Invalid token type")
    return payload


def generate_refresh_token() -> str:
    """Opaque, high-entropy refresh token. Only its hash is ever persisted."""
    return secrets.token_urlsafe(64)


def refresh_token_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
