from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.finance.categories.models import ExpenseCategory


class CategoryRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, category_id: uuid.UUID) -> ExpenseCategory | None:
        result = await self.db.execute(
            select(ExpenseCategory).where(ExpenseCategory.id == category_id)
        )
        return result.scalar_one_or_none()

    async def list_all(self, *, include_archived: bool = False) -> list[ExpenseCategory]:
        stmt = select(ExpenseCategory).order_by(ExpenseCategory.display_order, ExpenseCategory.name)
        if not include_archived:
            stmt = stmt.where(ExpenseCategory.is_archived.is_(False))
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    def add(self, category: ExpenseCategory) -> None:
        self.db.add(category)
