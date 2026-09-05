"""
FastAPI dependencies for authentication: extract bearer token, validate it,
load the current user, and expose the request's permission set.

These are composed into `require_permission(...)` in
core/permissions/dependencies.py, which is what route handlers actually use.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth.models import Session as SessionModel
from app.core.security.tokens import TokenError, decode_access_token
from app.core.users.models import AccountStatus, User
from app.database.session import get_db

_bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class CurrentUser:
    id: uuid.UUID
    email: str
    full_name: str
    session_id: uuid.UUID
    permissions: frozenset[str]
    locale: str


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(credentials.credentials)
    except TokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = uuid.UUID(payload["sub"])
    session_id = uuid.UUID(payload["sid"])

    # Verify the session referenced by this token is still active (not
    # revoked by logout/logout-all). This is what makes server-side logout
    # actually work despite short-lived stateless access tokens.
    session_result = await db.execute(
        select(SessionModel).where(SessionModel.id == session_id)
    )
    session_row = session_result.scalar_one_or_none()
    if session_row is None or not session_row.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(
        select(User).options(selectinload(User.roles)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None or user.status != AccountStatus.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is not active",
        )

    request.state.user_id = str(user.id)

    return CurrentUser(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        session_id=session_id,
        permissions=frozenset(payload.get("perms", [])),
        locale=user.locale,
    )
