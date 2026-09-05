from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import PERMISSIONS_VIEW
from app.core.users.repository import PermissionRepository
from app.core.users.schemas import PermissionResponse
from app.database.session import get_db

router = APIRouter(prefix="/permissions", tags=["permissions"])


@router.get("", response_model=list[PermissionResponse])
async def list_permissions(
    user: CurrentUser = Depends(require_permission(PERMISSIONS_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """
    Read-only catalogue of all permission codes known to the system, used by
    the frontend's role-editor UI to render checkboxes. This is the seeded
    registry (core/permissions/registry.py), not something Admins edit here -
    new permissions are added by developers when a new module is built.
    """
    repo = PermissionRepository(db)
    permissions = await repo.list_all()
    return [
        PermissionResponse(id=p.id, code=p.code, description=p.description, category=p.category)
        for p in permissions
    ]
