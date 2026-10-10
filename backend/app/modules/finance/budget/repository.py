from __future__ import annotations

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.finance.budget.models import BudgetLine, BudgetLineApproval, budget_line_categories
from app.modules.finance.expenses.allocations import A
from app.modules.finance.expenses.models import Expense


class BudgetLineRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, budget_line_id: uuid.UUID) -> BudgetLine | None:
        result = await self.db.execute(
            select(BudgetLine)
            .options(selectinload(BudgetLine.categories), selectinload(BudgetLine.approval_events))
            .where(BudgetLine.id == budget_line_id)
        )
        return result.scalar_one_or_none()

    async def list_all(
        self, *, status: str | None = None, category_id: uuid.UUID | None = None, include_archived: bool = False
    ) -> list[BudgetLine]:
        stmt = select(BudgetLine).options(selectinload(BudgetLine.categories))
        if not include_archived:
            stmt = stmt.where(BudgetLine.is_archived.is_(False))
        if status:
            stmt = stmt.where(BudgetLine.status == status)
        if category_id:
            stmt = stmt.join(BudgetLine.categories).where(
                BudgetLine.categories.any(id=category_id)
            )
        stmt = stmt.order_by(BudgetLine.created_at.desc())
        result = await self.db.execute(stmt)
        return list(result.unique().scalars().all())

    def add(self, budget_line: BudgetLine) -> None:
        self.db.add(budget_line)

    def add_approval_event(self, event: BudgetLineApproval) -> None:
        self.db.add(event)

    def _line_scope(self, budget_line_id: uuid.UUID):
        """Invoice lines charged to an account the budget line covers (a
        budget line spans whole account groups, e.g. 5200 + 5300 + 5400)."""
        cats = select(budget_line_categories.c.category_id).where(
            budget_line_categories.c.budget_line_id == budget_line_id
        )
        return (
            or_(A.category_id.in_(cats), A.subcategory_id.in_(cats)),
            A.status != "cancelled",
            A.is_archived.is_(False),
        )

    async def spent_amount_for(self, budget_line_id: uuid.UUID) -> float:
        """Committed spend (draft/pending/approved, not cancelled) on the
        accounts this budget line covers, counted per invoice line."""
        result = await self.db.execute(
            select(func.coalesce(func.sum(A.amount), 0)).where(*self._line_scope(budget_line_id))
        )
        return float(result.scalar_one())

    async def spent_by_month(self, budget_line_id: uuid.UUID) -> dict[str, float]:
        """Spend per month the cost belongs to: period_month when set (salaries of
        month N paid in N+1), otherwise the payment month."""
        month = func.coalesce(A.period_month, func.to_char(A.expense_date, "YYYY-MM"))
        result = await self.db.execute(
            select(month, func.sum(A.amount)).where(*self._line_scope(budget_line_id)).group_by(month)
        )
        return {m: float(v) for m, v in result.all()}
