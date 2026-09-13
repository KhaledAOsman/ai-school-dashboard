from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import USERS_CREATE, USERS_DISABLE, USERS_UPDATE, USERS_VIEW
from app.core.users.schemas import UserCreateRequest, UserResponse, UserUpdateRequest
from app.core.users.service import UserManagementService
from app.database.session import get_db

router = APIRouter(prefix="/users", tags=["users"])


def _to_response(user) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        status=user.status,
        mfa_enabled=user.mfa_enabled,
        locale=user.locale,
        roles=[r.name for r in user.roles],
        created_at=user.created_at,
        last_login_at=user.last_login_at,
    )


@router.get("", response_model=list[UserResponse])
async def list_users(
    user: CurrentUser = Depends(require_permission(USERS_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    service = UserManagementService(db)
    return [_to_response(u) for u in await service.list_users()]


@router.post("", response_model=UserResponse, status_code=201)
async def create_user(
    payload: UserCreateRequest,
    user: CurrentUser = Depends(require_permission(USERS_CREATE)),
    db: AsyncSession = Depends(get_db),
):
    service = UserManagementService(db)
    created = await service.create_user(payload=payload, actor_id=user.id)
    return _to_response(created)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdateRequest,
    user: CurrentUser = Depends(require_permission(USERS_UPDATE)),
    db: AsyncSession = Depends(get_db),
):
    """Edits a user's name, locale, or role assignment - this is how an
    Admin changes what a user can see/do without disabling and
    recreating their account."""
    service = UserManagementService(db)
    updated = await service.update_user(user_id=user_id, payload=payload, actor_id=user.id)
    return _to_response(updated)


@router.post("/{user_id}/disable", status_code=204)
async def disable_user(
    user_id: uuid.UUID,
    user: CurrentUser = Depends(require_permission(USERS_DISABLE)),
    db: AsyncSession = Depends(get_db),
):
    service = UserManagementService(db)
    await service.disable_user(user_id=user_id, actor_id=user.id)


@router.post("/{user_id}/enable", response_model=UserResponse)
async def enable_user(
    user_id: uuid.UUID,
    user: CurrentUser = Depends(require_permission(USERS_DISABLE)),
    db: AsyncSession = Depends(get_db),
):
    """Re-activates a previously disabled account - preferred over trying
    to recreate the same email, which the unique-email constraint
    rejects. Same permission as disable, since it's the inverse of the
    same administrative action."""
    service = UserManagementService(db)
    enabled = await service.enable_user(user_id=user_id, actor_id=user.id)
    return _to_response(enabled)
