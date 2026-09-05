from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import FINANCE_REPORT_VIEW
from app.database.session import get_db
from app.modules.finance.expenses.schemas import ExpenseResponse
from app.modules.finance.reports.service import FinanceReportService

router = APIRouter(prefix="/finance/reports", tags=["finance-reports"])


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
