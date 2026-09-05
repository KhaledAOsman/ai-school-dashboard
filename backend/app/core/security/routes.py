from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit.schemas import SecurityLogResponse
from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import SECURITY_LOGS_VIEW
from app.core.security.log_models import SecurityLog
from app.database.session import get_db

router = APIRouter(prefix="/security-logs", tags=["security"])


@router.get("", response_model=list[SecurityLogResponse])
async def list_security_logs(
    limit: int = Query(default=100, le=500),
    offset: int = 0,
    event_type: str | None = None,
    user: CurrentUser = Depends(require_permission(SECURITY_LOGS_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """
    Read-only view of the append-only security event log - conceptually and
    physically separate from the business audit log (spec section 14).
    """
    stmt = select(SecurityLog).order_by(SecurityLog.timestamp.desc())
    if event_type:
        stmt = stmt.where(SecurityLog.event_type == event_type)
    stmt = stmt.limit(limit).offset(offset)

    result = await db.execute(stmt)
    return list(result.scalars().all())
