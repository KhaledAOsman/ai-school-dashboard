from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit.service import AuditService
from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import (
    FINANCE_EXPENSE_CREATE,
    FINANCE_EXPENSE_DELETE,
    FINANCE_EXPENSE_UPDATE,
    FINANCE_EXPENSE_VIEW,
)
from app.database.session import get_db
from app.modules.finance.funding.models import FinanceFunding
from app.modules.finance.funding.schemas import (
    FundingCreateRequest,
    FundingResponse,
    FundingUpdateRequest,
)

router = APIRouter(prefix="/finance/funding", tags=["finance-funding"])


async def _get_or_404(db: AsyncSession, funding_id: uuid.UUID) -> FinanceFunding:
    row = await db.get(FinanceFunding, funding_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Funding entry not found")
    return row


@router.get("", response_model=list[FundingResponse])
async def list_funding(
    user: CurrentUser = Depends(require_permission(FINANCE_EXPENSE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FinanceFunding).order_by(FinanceFunding.funding_date.desc(), FinanceFunding.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("", response_model=FundingResponse, status_code=201)
async def create_funding(
    payload: FundingCreateRequest,
    user: CurrentUser = Depends(require_permission(FINANCE_EXPENSE_CREATE)),
    db: AsyncSession = Depends(get_db),
):
    row = FinanceFunding(**payload.model_dump(), created_by=user.id)
    db.add(row)
    await db.flush()
    await AuditService(db).record(
        user_id=user.id,
        action="funding.created",
        resource_type="FinanceFunding",
        resource_id=str(row.id),
        new_value={"amount": str(row.amount), "source_name": row.source_name, "date": row.funding_date.isoformat()},
    )
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/{funding_id}", response_model=FundingResponse)
async def update_funding(
    funding_id: uuid.UUID,
    payload: FundingUpdateRequest,
    user: CurrentUser = Depends(require_permission(FINANCE_EXPENSE_UPDATE)),
    db: AsyncSession = Depends(get_db),
):
    row = await _get_or_404(db, funding_id)
    before = {"amount": str(row.amount), "source_name": row.source_name, "date": row.funding_date.isoformat()}
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    await AuditService(db).record(
        user_id=user.id,
        action="funding.updated",
        resource_type="FinanceFunding",
        resource_id=str(row.id),
        previous_value=before,
        new_value={"amount": str(row.amount), "source_name": row.source_name, "date": row.funding_date.isoformat()},
    )
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/{funding_id}", status_code=204)
async def delete_funding(
    funding_id: uuid.UUID,
    user: CurrentUser = Depends(require_permission(FINANCE_EXPENSE_DELETE)),
    db: AsyncSession = Depends(get_db),
):
    row = await _get_or_404(db, funding_id)
    await AuditService(db).record(
        user_id=user.id,
        action="funding.deleted",
        resource_type="FinanceFunding",
        resource_id=str(row.id),
        previous_value={"amount": str(row.amount), "source_name": row.source_name, "date": row.funding_date.isoformat()},
    )
    await db.delete(row)
    await db.commit()
