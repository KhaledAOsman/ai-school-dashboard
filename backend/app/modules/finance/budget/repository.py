from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.finance.budget.models import BudgetLine, BudgetLineApproval
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

    async def spent_amount_for(self, budget_line_id: uuid.UUID) -> float:
        """
        Sum of all non-cancelled expenses posted against this budget line -
        includes draft/pending/approved so a manager can see committed
        spend building up even before final approval, matching how real
        budget tracking works (a submitted-but-not-yet-approved expense
        still represents an intent to spend against the line).
        """
        result = await self.db.execute(
            select(func.coalesce(func.sum(Expense.amount), 0)).where(
                Expense.budget_line_id == budget_line_id,
                Expense.status != "cancelled",
                Expense.is_archived.is_(False),
            )
        )
        return float(result.scalar_one())
