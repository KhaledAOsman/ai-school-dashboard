"""
Dashboard/report aggregation queries. Kept separate from ExpenseService
since these are read-only analytical queries, not transactional business
logic - a distinction that matters as more modules add their own dashboard
widgets later (see docs/adding-a-new-dashboard-widget.md).
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import cast, func, select
from sqlalchemy import TIMESTAMP
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.finance.categories.models import ExpenseCategory
from app.modules.finance.expenses.models import Expense


class FinanceReportService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def summary(self) -> dict:
        today = date.today()
        month_start = today.replace(day=1)
        quarter_start_month = ((today.month - 1) // 3) * 3 + 1
        quarter_start = today.replace(month=quarter_start_month, day=1)
        year_start = today.replace(month=1, day=1)

        async def total_since(start: date) -> Decimal:
            result = await self.db.execute(
                select(func.coalesce(func.sum(Expense.amount), 0)).where(
                    Expense.expense_date >= start,
                    Expense.is_archived.is_(False),
                    Expense.status != "cancelled",
                )
            )
            return result.scalar_one()

        async def total_by_status(expense_status: str) -> Decimal:
            result = await self.db.execute(
                select(func.coalesce(func.sum(Expense.amount), 0)).where(
                    Expense.status == expense_status, Expense.is_archived.is_(False)
                )
            )
            return result.scalar_one()

        async def count_by_status(expense_status: str) -> int:
            result = await self.db.execute(
                select(func.count(Expense.id)).where(
                    Expense.status == expense_status, Expense.is_archived.is_(False)
                )
            )
            return result.scalar_one()

        return {
            "total_expenses_month": await total_since(month_start),
            "total_expenses_quarter": await total_since(quarter_start),
            "total_expenses_year": await total_since(year_start),
            "pending_approval_count": await count_by_status("pending_approval"),
            "pending_approval_amount": await total_by_status("pending_approval"),
            "approved_amount": await total_by_status("approved"),
            "rejected_amount": await total_by_status("rejected"),
        }

    async def category_breakdown(self, *, date_from: date | None = None, date_to: date | None = None) -> list[dict]:
        stmt = (
            select(
                ExpenseCategory.id,
                ExpenseCategory.name,
                func.coalesce(func.sum(Expense.amount), 0).label("total"),
            )
            .join(Expense, Expense.category_id == ExpenseCategory.id)
            .where(Expense.is_archived.is_(False), Expense.status != "cancelled")
            .group_by(ExpenseCategory.id, ExpenseCategory.name)
            .order_by(func.sum(Expense.amount).desc())
        )
        if date_from:
            stmt = stmt.where(Expense.expense_date >= date_from)
        if date_to:
            stmt = stmt.where(Expense.expense_date <= date_to)

        result = await self.db.execute(stmt)
        return [{"category_id": row.id, "category_name": row.name, "total": row.total} for row in result.all()]

    async def monthly_trend(self, *, months_back: int = 12) -> list[dict]:
        start = date.today().replace(day=1) - timedelta(days=months_back * 31)
        # date_trunc() only has a documented overload for (text, timestamp)/
        # (text, timestamptz) in PostgreSQL - passing a plain DATE column
        # can fail to resolve on some driver/server combinations. Casting
        # explicitly to timestamp avoids relying on an implicit cast.
        truncated_month = func.date_trunc("month", cast(Expense.expense_date, TIMESTAMP))
        stmt = (
            select(
                truncated_month.label("month"),
                func.coalesce(func.sum(Expense.amount), 0).label("total"),
            )
            .where(
                Expense.expense_date >= start,
                Expense.is_archived.is_(False),
                Expense.status != "cancelled",
            )
            .group_by(truncated_month)
            .order_by(truncated_month)
        )
        result = await self.db.execute(stmt)

        def _month_to_iso(value) -> str:
            # The truncated value comes back as a Python datetime (has
            # .date()) on most driver versions, but handle a bare date too
            # so this endpoint never 500s on a driver-version difference.
            if isinstance(value, datetime):
                return value.date().isoformat()
            return value.isoformat()

        return [{"month": _month_to_iso(row.month), "total": row.total} for row in result.all()]

    async def recent_expenses(self, *, limit: int = 10) -> list[Expense]:
        result = await self.db.execute(
            select(Expense)
            .where(Expense.is_archived.is_(False))
            .order_by(Expense.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())
