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

from sqlalchemy import cast, func, or_, select
from sqlalchemy import TIMESTAMP
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.finance.categories.models import ExpenseCategory
from app.modules.finance.expenses.allocations import A, expense_allocations
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
        # per invoice LINE: a transfer of salary + bonus + fee counts each part
        # under its own account
        stmt = (
            select(
                ExpenseCategory.id,
                ExpenseCategory.name,
                func.coalesce(func.sum(A.amount), 0).label("total"),
            )
            .join(expense_allocations, A.category_id == ExpenseCategory.id)
            .where(A.is_archived.is_(False), A.status != "cancelled")
            .group_by(ExpenseCategory.id, ExpenseCategory.name)
            .order_by(func.sum(A.amount).desc())
        )
        if date_from:
            stmt = stmt.where(A.expense_date >= date_from)
        if date_to:
            stmt = stmt.where(A.expense_date <= date_to)

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
            .order_by(Expense.expense_date.desc(), Expense.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def account_totals(self) -> list[dict]:
        """Spend per (category, subcategory) pair - the chart of accounts
        builds its running totals from this in one query instead of one
        request per node. Cancelled/archived expenses are excluded."""
        stmt = (
            select(
                A.category_id,
                A.subcategory_id,
                func.coalesce(func.sum(A.amount), 0).label("total"),
                func.count(func.distinct(A.expense_id)).label("count"),
            )
            .where(A.is_archived.is_(False), A.status != "cancelled")
            .group_by(A.category_id, A.subcategory_id)
        )
        result = await self.db.execute(stmt)
        return [
            {
                "category_id": row.category_id,
                "subcategory_id": row.subcategory_id,
                "total": row.total,
                "count": row.count,
            }
            for row in result.all()
        ]

    async def monthly_by_period(self) -> list[dict]:
        """Spend per business month (expenses.period_month, falling back to
        the payment month) - what the payroll for a month actually cost."""
        period = func.coalesce(Expense.period_month, func.to_char(Expense.expense_date, "YYYY-MM"))
        stmt = (
            select(
                period.label("period"),
                func.coalesce(func.sum(Expense.amount), 0).label("total"),
                func.count(Expense.id).label("count"),
            )
            .where(Expense.is_archived.is_(False), Expense.status != "cancelled")
            .group_by(period)
            .order_by(period)
        )
        result = await self.db.execute(stmt)
        return [{"period": row.period, "total": row.total, "count": row.count} for row in result.all()]

    # ------------------------------------------------------------------ overview
    async def overview(self, *, month: str | None) -> dict:
        """Management overview for one month (or the whole period when month is
        None). Costs count in the month they belong to (period_month, else the
        payment month) and only once approved - the same basis as the income
        statement - so every number here ties back to the books."""
        from app.modules.finance.budget.models import BudgetLine, budget_line_categories
        from app.modules.marketing.models import Subscription

        amonth = func.coalesce(A.period_month, func.to_char(A.expense_date, "YYYY-MM"))
        smonth = func.to_char(Subscription.subscribed_at, "YYYY-MM")
        live = (A.is_archived.is_(False),)

        exp_months = {m for (m,) in (await self.db.execute(select(amonth).where(*live).distinct())).all() if m}
        sub_months = {m for (m,) in (await self.db.execute(select(smonth).distinct())).all() if m}
        months = sorted(exp_months | sub_months, reverse=True)

        def in_period(col):
            return (col == month,) if month else ()

        async def one(stmt):
            return (await self.db.execute(stmt)).one()

        approved_total, invoices = await one(
            select(func.coalesce(func.sum(A.amount), 0), func.count(func.distinct(A.expense_id)))
            .where(*live, A.status == "approved", *in_period(amonth))
        )
        pending_total, pending_count = await one(
            select(func.coalesce(func.sum(A.amount), 0), func.count(func.distinct(A.expense_id)))
            .where(*live, A.status.in_(("draft", "pending_approval")), *in_period(amonth))
        )
        revenue, subs_count = await one(
            select(func.coalesce(func.sum(Subscription.amount_paid), 0), func.count(Subscription.id))
            .where(*in_period(smonth))
        )

        # approved spend per account group
        rows = (await self.db.execute(
            select(ExpenseCategory.id, ExpenseCategory.code, ExpenseCategory.name, func.sum(A.amount))
            .join(expense_allocations, A.category_id == ExpenseCategory.id)
            .where(*live, A.status == "approved", *in_period(amonth))
            .group_by(ExpenseCategory.id, ExpenseCategory.code, ExpenseCategory.name)
        )).all()
        line_of: dict[uuid.UUID, str] = {}
        lines = (await self.db.execute(
            select(BudgetLine).where(BudgetLine.status == "approved", BudgetLine.is_archived.is_(False))
        )).scalars().all()
        links = (await self.db.execute(select(budget_line_categories))).all()
        for bl_id, cat_id in links:
            bl = next((b for b in lines if b.id == bl_id), None)
            if bl:
                line_of[cat_id] = bl.name
        by_account = sorted(
            [{"category_id": r[0], "code": r[1], "name": r[2], "total": r[3], "budget_line": line_of.get(r[0])} for r in rows],
            key=lambda r: (r["code"] or "~"),
        )

        # budget vs actual for the period
        budget = []
        for bl in lines:
            cats = [c for b, c in links if b == bl.id]
            spent = (await self.db.execute(
                select(func.coalesce(func.sum(A.amount), 0)).where(
                    *live, A.status == "approved", *in_period(amonth),
                    or_(A.category_id.in_(cats), A.subcategory_id.in_(cats)),
                )
            )).scalar_one() if cats else Decimal("0")
            start = bl.period_start.strftime("%Y-%m") if bl.period_start else None
            end = bl.period_end.strftime("%Y-%m") if bl.period_end else None
            amt = Decimal(bl.budgeted_amount)
            if bl.period != "monthly":
                period_budget = amt
            elif month:
                active = (start is None or start <= month) and (end is None or month <= end)
                period_budget = amt if active else Decimal("0")
            else:
                first = start or (min(exp_months) if exp_months else date.today().strftime("%Y-%m"))
                last = max([date.today().strftime("%Y-%m")] + list(exp_months))
                if end:
                    last = min(last, end)
                y, m = int(first[:4]), int(first[5:7])
                n = 0
                while (y, m) <= (int(last[:4]), int(last[5:7])):
                    n += 1
                    y, m = (y + 1, 1) if m == 12 else (y, m + 1)
                period_budget = amt * max(n, 1)
            budget.append({"id": bl.id, "name": bl.name, "budget": period_budget, "spent": spent,
                           "remaining": period_budget - Decimal(spent)})

        recent = (await self.db.execute(
            select(Expense)
            .where(Expense.is_archived.is_(False), *in_period(func.coalesce(Expense.period_month, func.to_char(Expense.expense_date, "YYYY-MM"))))
            .order_by(Expense.expense_date.desc(), Expense.created_at.desc())
            .limit(8)
        )).scalars().all()

        return {
            "month": month,
            "months": months,
            "expenses": approved_total,
            "invoices": invoices,
            "pending_amount": pending_total,
            "pending_count": pending_count,
            "revenue": revenue,
            "subscriptions": subs_count,
            "net": Decimal(revenue) - Decimal(approved_total),
            "by_account": by_account,
            "budget": budget,
            "recent": recent,
        }
