from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import ROLES_CREATE, ROLES_DELETE, ROLES_UPDATE, ROLES_VIEW
from app.core.roles.service import RoleService
from app.core.users.schemas import RoleCreateRequest, RoleResponse, RoleUpdateRequest
from app.database.session import get_db

router = APIRouter(prefix="/roles", tags=["roles"])


def _to_response(role) -> RoleResponse:
    return RoleResponse(
        id=role.id,
        name=role.name,
        description=role.description,
        is_system_role=role.is_system_role,
        permission_codes=sorted(p.code for p in role.permissions),
    )


@router.get("", response_model=list[RoleResponse])
async def list_roles(
    user: CurrentUser = Depends(require_permission(ROLES_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    service = RoleService(db)
    return [_to_response(r) for r in await service.list_roles()]


@router.post("", response_model=RoleResponse, status_code=201)
async def create_role(
    payload: RoleCreateRequest,
    user: CurrentUser = Depends(require_permission(ROLES_CREATE)),
    db: AsyncSession = Depends(get_db),
):
    """
    Admins can create arbitrary custom roles here - the backend places no
    restriction on role names or which permissions can be combined together
    (spec section 3/5: do not assume a fixed set of roles).
    """
    service = RoleService(db)
    created = await service.create_role(payload=payload, actor_id=user.id)
    return _to_response(created)


@router.patch("/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: uuid.UUID,
    payload: RoleUpdateRequest,
    user: CurrentUser = Depends(require_permission(ROLES_UPDATE)),
    db: AsyncSession = Depends(get_db),
):
    service = RoleService(db)
    updated = await service.update_role(role_id=role_id, payload=payload, actor_id=user.id)
    return _to_response(updated)


@router.delete("/{role_id}", status_code=204)
async def delete_role(
    role_id: uuid.UUID,
    user: CurrentUser = Depends(require_permission(ROLES_DELETE)),
    db: AsyncSession = Depends(get_db),
):
    service = RoleService(db)
    await service.delete_role(role_id=role_id, actor_id=user.id)
