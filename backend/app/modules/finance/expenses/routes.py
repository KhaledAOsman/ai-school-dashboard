from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import (
    FINANCE_EXPENSE_APPROVE,
    FINANCE_EXPENSE_CREATE,
    FINANCE_EXPENSE_DELETE,
    FINANCE_EXPENSE_REJECT,
    FINANCE_EXPENSE_RESTORE_VERSION,
    FINANCE_EXPENSE_SUBMIT,
    FINANCE_EXPENSE_UPDATE,
    FINANCE_EXPENSE_VIEW,
)
from app.database.session import get_db
from app.modules.finance.expenses.schemas import (
    ExpenseCreateRequest,
    ExpenseDetailResponse,
    ExpenseRejectRequest,
    ExpenseRestoreRequest,
    ExpenseResponse,
    ExpenseUpdateRequest,
)
from app.modules.finance.expenses.service import ExpenseService

router = APIRouter(prefix="/finance/expenses", tags=["finance-expenses"])


@router.get("", response_model=list[ExpenseResponse])
async def list_expenses(
    status_filter: str | None = Query(default=None, alias="status"),
    category_id: uuid.UUID | None = None,
    subcategory_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    created_by: uuid.UUID | None = None,
    amount_min: float | None = None,
    amount_max: float | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    user: CurrentUser = Depends(require_permission(FINANCE_EXPENSE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    service = ExpenseService(db)
    return await service.list_filtered(
        status=status_filter,
        category_id=category_id,
        subcategory_id=subcategory_id,
        date_from=date_from,
        date_to=date_to,
        created_by=created_by,
        amount_min=amount_min,
        amount_max=amount_max,
        limit=limit,
        offset=offset,
    )


@router.get("/{expense_id}", response_model=ExpenseDetailResponse)
async def get_expense(
    expense_id: uuid.UUID,
    user: CurrentUser = Depends(require_permission(FINANCE_EXPENSE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    service = ExpenseService(db)
    return await service.get(expense_id=expense_id)


@router.post("", response_model=ExpenseResponse, status_code=201)
async def create_expense(
    payload: ExpenseCreateRequest,
    user: CurrentUser = Depends(require_permission(FINANCE_EXPENSE_CREATE)),
    db: AsyncSession = Depends(get_db),
):
    service = ExpenseService(db)
    return await service.create(payload=payload, user_id=user.id)


@router.patch("/{expense_id}", response_model=ExpenseResponse)
async def update_expense(
    expense_id: uuid.UUID,
    payload: ExpenseUpdateRequest,
    user: CurrentUser = Depends(require_permission(FINANCE_EXPENSE_UPDATE)),
    db: AsyncSession = Depends(get_db),
):
    service = ExpenseService(db)
    return await service.update(expense_id=expense_id, payload=payload, user_id=user.id)


@router.post("/{expense_id}/submit", response_model=ExpenseResponse)
async def submit_expense(
    expense_id: uuid.UUID,
    user: CurrentUser = Depends(require_permission(FINANCE_EXPENSE_SUBMIT)),
    db: AsyncSession = Depends(get_db),
):
    service = ExpenseService(db)
    await service.submit(expense_id=expense_id, user_id=user.id)
    return await service.get(expense_id=expense_id)


@router.post("/{expense_id}/approve", response_model=ExpenseResponse)
async def approve_expense(
    expense_id: uuid.UUID,
    user: CurrentUser = Depends(require_permission(FINANCE_EXPENSE_APPROVE)),
    db: AsyncSession = Depends(get_db),
):
    service = ExpenseService(db)
    await service.approve(expense_id=expense_id, user_id=user.id)
    return await service.get(expense_id=expense_id)


@router.post("/{expense_id}/reject", response_model=ExpenseResponse)
async def reject_expense(
    expense_id: uuid.UUID,
    payload: ExpenseRejectRequest,
    user: CurrentUser = Depends(require_permission(FINANCE_EXPENSE_REJECT)),
    db: AsyncSession = Depends(get_db),
):
    service = ExpenseService(db)
    await service.reject(expense_id=expense_id, payload=payload, user_id=user.id)
    return await service.get(expense_id=expense_id)


@router.post("/{expense_id}/cancel", response_model=ExpenseResponse)
async def cancel_expense(
    expense_id: uuid.UUID,
    user: CurrentUser = Depends(require_permission(FINANCE_EXPENSE_UPDATE)),
    db: AsyncSession = Depends(get_db),
):
    service = ExpenseService(db)
    await service.cancel(expense_id=expense_id, user_id=user.id)
    return await service.get(expense_id=expense_id)


@router.post("/{expense_id}/resubmit", response_model=ExpenseResponse)
async def resubmit_expense(
    expense_id: uuid.UUID,
    user: CurrentUser = Depends(require_permission(FINANCE_EXPENSE_SUBMIT)),
    db: AsyncSession = Depends(get_db),
):
    service = ExpenseService(db)
    await service.resubmit(expense_id=expense_id, user_id=user.id)
    return await service.get(expense_id=expense_id)


@router.post("/{expense_id}/restore", response_model=ExpenseResponse)
async def restore_expense_version(
    expense_id: uuid.UUID,
    payload: ExpenseRestoreRequest,
    user: CurrentUser = Depends(require_permission(FINANCE_EXPENSE_RESTORE_VERSION)),
    db: AsyncSession = Depends(get_db),
):
    service = ExpenseService(db)
    await service.restore_version(
        expense_id=expense_id,
        version_number=payload.version_number,
        reason=payload.reason,
        user_id=user.id,
    )
    return await service.get(expense_id=expense_id)


@router.post("/{expense_id}/archive", status_code=204)
async def archive_expense(
    expense_id: uuid.UUID,
    user: CurrentUser = Depends(require_permission(FINANCE_EXPENSE_DELETE)),
    db: AsyncSession = Depends(get_db),
):
    service = ExpenseService(db)
    await service.archive(expense_id=expense_id, user_id=user.id)
