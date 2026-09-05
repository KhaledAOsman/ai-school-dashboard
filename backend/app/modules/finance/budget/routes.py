from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import (
    FINANCE_BUDGET_APPROVE,
    FINANCE_BUDGET_ARCHIVE,
    FINANCE_BUDGET_CREATE,
    FINANCE_BUDGET_REJECT,
    FINANCE_BUDGET_SUBMIT,
    FINANCE_BUDGET_UPDATE,
    FINANCE_BUDGET_VIEW,
)
from app.database.session import get_db
from app.modules.finance.budget.schemas import (
    BudgetLineCreateRequest,
    BudgetLineRejectRequest,
    BudgetLineResponse,
    BudgetLineUpdateRequest,
    BudgetLineWithSpendResponse,
    CategoryRef,
)
from app.modules.finance.budget.service import BudgetLineService

router = APIRouter(prefix="/finance/budget-lines", tags=["finance-budget"])


async def _to_response_with_spend(service: BudgetLineService, budget_line) -> BudgetLineWithSpendResponse:
    spend = await service.spend_summary(budget_line)
    return BudgetLineWithSpendResponse(
        id=budget_line.id,
        name=budget_line.name,
        description=budget_line.description,
        kind=budget_line.kind,
        period=budget_line.period,
        budgeted_amount=budget_line.budgeted_amount,
        currency=budget_line.currency,
        period_start=budget_line.period_start,
        period_end=budget_line.period_end,
        status=budget_line.status,
        created_by=budget_line.created_by,
        created_at=budget_line.created_at,
        approved_by=budget_line.approved_by,
        approved_at=budget_line.approved_at,
        rejected_by=budget_line.rejected_by,
        rejected_at=budget_line.rejected_at,
        rejection_reason=budget_line.rejection_reason,
        is_archived=budget_line.is_archived,
        categories=[CategoryRef(id=c.id, name=c.name) for c in budget_line.categories],
        spent_amount=spend["spent_amount"],
        remaining_amount=spend["remaining_amount"],
        spent_pct=spend["spent_pct"],
    )


@router.get("", response_model=list[BudgetLineWithSpendResponse])
async def list_budget_lines(
    status_filter: str | None = Query(default=None, alias="status"),
    category_id: uuid.UUID | None = None,
    include_archived: bool = False,
    user: CurrentUser = Depends(require_permission(FINANCE_BUDGET_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    service = BudgetLineService(db)
    lines = await service.list_all(status=status_filter, category_id=category_id, include_archived=include_archived)
    return [await _to_response_with_spend(service, line) for line in lines]


@router.get("/{budget_line_id}", response_model=BudgetLineWithSpendResponse)
async def get_budget_line(
    budget_line_id: uuid.UUID,
    user: CurrentUser = Depends(require_permission(FINANCE_BUDGET_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    service = BudgetLineService(db)
    line = await service.get(budget_line_id=budget_line_id)
    return await _to_response_with_spend(service, line)


@router.post("", response_model=BudgetLineResponse, status_code=201)
async def create_budget_line(
    payload: BudgetLineCreateRequest,
    user: CurrentUser = Depends(require_permission(FINANCE_BUDGET_CREATE)),
    db: AsyncSession = Depends(get_db),
):
    service = BudgetLineService(db)
    return await service.create(payload=payload, user_id=user.id)


@router.patch("/{budget_line_id}", response_model=BudgetLineResponse)
async def update_budget_line(
    budget_line_id: uuid.UUID,
    payload: BudgetLineUpdateRequest,
    user: CurrentUser = Depends(require_permission(FINANCE_BUDGET_UPDATE)),
    db: AsyncSession = Depends(get_db),
):
    service = BudgetLineService(db)
    return await service.update(budget_line_id=budget_line_id, payload=payload, user_id=user.id)


@router.post("/{budget_line_id}/submit", response_model=BudgetLineResponse)
async def submit_budget_line(
    budget_line_id: uuid.UUID,
    user: CurrentUser = Depends(require_permission(FINANCE_BUDGET_SUBMIT)),
    db: AsyncSession = Depends(get_db),
):
    service = BudgetLineService(db)
    return await service.submit(budget_line_id=budget_line_id, user_id=user.id)


@router.post("/{budget_line_id}/approve", response_model=BudgetLineResponse)
async def approve_budget_line(
    budget_line_id: uuid.UUID,
    user: CurrentUser = Depends(require_permission(FINANCE_BUDGET_APPROVE)),
    db: AsyncSession = Depends(get_db),
):
    """
    Only a holder of finance.budget.approve (typically the General Manager
    role) can approve a budget line. Once approved, expenses may be posted
    against it - see ExpenseService.create()/update().
    """
    service = BudgetLineService(db)
    return await service.approve(budget_line_id=budget_line_id, user_id=user.id)


@router.post("/{budget_line_id}/reject", response_model=BudgetLineResponse)
async def reject_budget_line(
    budget_line_id: uuid.UUID,
    payload: BudgetLineRejectRequest,
    user: CurrentUser = Depends(require_permission(FINANCE_BUDGET_REJECT)),
    db: AsyncSession = Depends(get_db),
):
    service = BudgetLineService(db)
    return await service.reject(budget_line_id=budget_line_id, payload=payload, user_id=user.id)


@router.post("/{budget_line_id}/archive", response_model=BudgetLineResponse)
async def archive_budget_line(
    budget_line_id: uuid.UUID,
    user: CurrentUser = Depends(require_permission(FINANCE_BUDGET_ARCHIVE)),
    db: AsyncSession = Depends(get_db),
):
    service = BudgetLineService(db)
    return await service.archive(budget_line_id=budget_line_id, user_id=user.id)
