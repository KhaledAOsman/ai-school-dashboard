from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.finance.expenses.models import Expense, ExpenseApproval, ExpenseVersion


class ExpenseRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, expense_id: uuid.UUID) -> Expense | None:
        result = await self.db.execute(
            select(Expense)
            .options(selectinload(Expense.versions), selectinload(Expense.approval_events))
            .where(Expense.id == expense_id)
        )
        return result.scalar_one_or_none()

    async def list_filtered(
        self,
        *,
        status: str | None = None,
        category_id: uuid.UUID | None = None,
        subcategory_id: uuid.UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        created_by: uuid.UUID | None = None,
        amount_min: float | None = None,
        amount_max: float | None = None,
        include_archived: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Expense]:
        stmt = select(Expense)
        if not include_archived:
            stmt = stmt.where(Expense.is_archived.is_(False))
        if status:
            stmt = stmt.where(Expense.status == status)
        if category_id:
            stmt = stmt.where(Expense.category_id == category_id)
        if subcategory_id:
            stmt = stmt.where(Expense.subcategory_id == subcategory_id)
        if date_from:
            stmt = stmt.where(Expense.expense_date >= date_from)
        if date_to:
            stmt = stmt.where(Expense.expense_date <= date_to)
        if created_by:
            stmt = stmt.where(Expense.created_by == created_by)
        if amount_min is not None:
            stmt = stmt.where(Expense.amount >= amount_min)
        if amount_max is not None:
            stmt = stmt.where(Expense.amount <= amount_max)

        stmt = stmt.order_by(Expense.expense_date.desc()).limit(limit).offset(offset)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    def add(self, expense: Expense) -> None:
        self.db.add(expense)

    def add_version(self, version: ExpenseVersion) -> None:
        self.db.add(version)

    def add_approval_event(self, event: ExpenseApproval) -> None:
        self.db.add(event)

    async def get_version(self, expense_id: uuid.UUID, version_number: int) -> ExpenseVersion | None:
        result = await self.db.execute(
            select(ExpenseVersion).where(
                ExpenseVersion.expense_id == expense_id,
                ExpenseVersion.version_number == version_number,
            )
        )
        return result.scalar_one_or_none()
