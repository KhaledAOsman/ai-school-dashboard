from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.finance.expenses.allocations import A
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

    def _filtered(
        self,
        *,
        status: str | None = None,
        category_id: uuid.UUID | None = None,
        subcategory_id: uuid.UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        created_by: uuid.UUID | None = None,
        staff_id: uuid.UUID | None = None,
        period_month: str | None = None,
        paid_by: str | None = None,
        q: str | None = None,
        amount_min: float | None = None,
        amount_max: float | None = None,
        include_archived: bool = False,
    ) -> Select:
        stmt = select(Expense)
        if not include_archived:
            stmt = stmt.where(Expense.is_archived.is_(False))
        if status:
            stmt = stmt.where(Expense.status == status)
        # an invoice matches an account when ANY of its lines is charged to it
        if category_id:
            stmt = stmt.where(Expense.id.in_(select(A.expense_id).where(A.category_id == category_id)))
        if subcategory_id:
            stmt = stmt.where(Expense.id.in_(select(A.expense_id).where(A.subcategory_id == subcategory_id)))
        if date_from:
            stmt = stmt.where(Expense.expense_date >= date_from)
        if date_to:
            stmt = stmt.where(Expense.expense_date <= date_to)
        if created_by:
            stmt = stmt.where(Expense.created_by == created_by)
        if staff_id:
            stmt = stmt.where(Expense.id.in_(select(A.expense_id).where(A.staff_id == staff_id)))
        if period_month:
            stmt = stmt.where(Expense.period_month == period_month)
        if paid_by:
            stmt = stmt.where(Expense.paid_by == paid_by)
        if q:
            like = f"%{q.strip()}%"
            stmt = stmt.where(
                or_(
                    Expense.vendor.ilike(like),
                    Expense.description.ilike(like),
                    Expense.invoice_number.ilike(like),
                    Expense.notes.ilike(like),
                )
            )
        if amount_min is not None:
            stmt = stmt.where(Expense.amount >= amount_min)
        if amount_max is not None:
            stmt = stmt.where(Expense.amount <= amount_max)

        return stmt

    async def list_filtered(self, *, limit: int = 50, offset: int = 0, **filters) -> list[Expense]:
        stmt = self._filtered(**filters)
        stmt = stmt.order_by(Expense.expense_date.desc(), Expense.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def page_filtered(self, *, page: int, page_size: int, **filters) -> dict:
        """One page of rows plus the totals of the WHOLE filtered set (so the
        footer sums every matching invoice, not just the visible page)."""
        base = self._filtered(**filters).subquery()
        active = base.c.status != "cancelled"
        agg = (
            await self.db.execute(
                select(
                    func.count(),
                    func.count().filter(active),
                    func.coalesce(func.sum(base.c.amount).filter(active), 0),
                ).select_from(base)
            )
        ).one()
        total, active_count, active_sum = int(agg[0]), int(agg[1]), agg[2]
        items = await self.list_filtered(limit=page_size, offset=(page - 1) * page_size, **filters)
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": max((total + page_size - 1) // page_size, 1),
            "active_count": active_count,
            "active_amount": active_sum,
        }

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
