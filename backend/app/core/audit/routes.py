from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit.models import AuditLog
from app.core.audit.schemas import AuditLogResponse
from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import AUDIT_VIEW
from app.database.session import get_db

router = APIRouter(prefix="/audit-logs", tags=["audit"])


@router.get("", response_model=list[AuditLogResponse])
async def list_audit_logs(
    limit: int = Query(default=100, le=500),
    offset: int = 0,
    action: str | None = None,
    resource_type: str | None = None,
    user: CurrentUser = Depends(require_permission(AUDIT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """
    Read-only view of the append-only business audit log. There is no
    update/delete endpoint here, by design (spec section 13: audit logs
    must not be casually editable or deletable).
    """
    stmt = select(AuditLog).order_by(AuditLog.timestamp.desc())
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if resource_type:
        stmt = stmt.where(AuditLog.resource_type == resource_type)
    stmt = stmt.limit(limit).offset(offset)

    result = await db.execute(stmt)
    return list(result.scalars().all())
