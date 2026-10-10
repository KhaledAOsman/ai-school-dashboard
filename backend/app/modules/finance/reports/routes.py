from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import FINANCE_REPORT_VIEW
from app.database.session import get_db
from app.modules.finance.expenses.schemas import ExpenseResponse
from app.modules.finance.reports.service import FinanceReportService

router = APIRouter(prefix="/finance/reports", tags=["finance-reports"])


class OverviewAccount(BaseModel):
    category_id: uuid.UUID
    code: str | None
    name: str
    total: Decimal
    budget_line: str | None


class OverviewBudget(BaseModel):
    id: uuid.UUID
    name: str
    budget: Decimal
    spent: Decimal
    remaining: Decimal


class OverviewResponse(BaseModel):
    month: str | None
    months: list[str]
    expenses: Decimal
    invoices: int
    pending_amount: Decimal
    pending_count: int
    revenue: Decimal
    subscriptions: int
    net: Decimal
    by_account: list[OverviewAccount]
    budget: list[OverviewBudget]
    recent: list[ExpenseResponse]


@router.get("/overview", response_model=OverviewResponse)
async def get_overview(
    month: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    user: CurrentUser = Depends(require_permission(FINANCE_REPORT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """One month (or the whole period without ?month) for the finance overview."""
    return await FinanceReportService(db).overview(month=month)


@router.get("/summary")
async def get_summary(
    user: CurrentUser = Depends(require_permission(FINANCE_REPORT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    service = FinanceReportService(db)
    return await service.summary()


@router.get("/category-breakdown")
async def get_category_breakdown(
    date_from: date | None = None,
    date_to: date | None = None,
    user: CurrentUser = Depends(require_permission(FINANCE_REPORT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    service = FinanceReportService(db)
    return await service.category_breakdown(date_from=date_from, date_to=date_to)


@router.get("/monthly-trend")
async def get_monthly_trend(
    months_back: int = 12,
    user: CurrentUser = Depends(require_permission(FINANCE_REPORT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    service = FinanceReportService(db)
    return await service.monthly_trend(months_back=months_back)


@router.get("/recent-expenses", response_model=list[ExpenseResponse])
async def get_recent_expenses(
    limit: int = 10,
    user: CurrentUser = Depends(require_permission(FINANCE_REPORT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    service = FinanceReportService(db)
    return await service.recent_expenses(limit=limit)


@router.get("/account-totals")
async def get_account_totals(
    user: CurrentUser = Depends(require_permission(FINANCE_REPORT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    service = FinanceReportService(db)
    return await service.account_totals()


@router.get("/by-period")
async def get_monthly_by_period(
    user: CurrentUser = Depends(require_permission(FINANCE_REPORT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    service = FinanceReportService(db)
    return await service.monthly_by_period()
