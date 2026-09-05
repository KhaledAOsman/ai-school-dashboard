from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.finance.attachments.models import ExpenseAttachment


class AttachmentRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, attachment_id: uuid.UUID) -> ExpenseAttachment | None:
        result = await self.db.execute(
            select(ExpenseAttachment).where(
                ExpenseAttachment.id == attachment_id, ExpenseAttachment.is_deleted.is_(False)
            )
        )
        return result.scalar_one_or_none()

    async def list_for_expense(self, expense_id: uuid.UUID) -> list[ExpenseAttachment]:
        result = await self.db.execute(
            select(ExpenseAttachment).where(
                ExpenseAttachment.expense_id == expense_id,
                ExpenseAttachment.is_deleted.is_(False),
            )
        )
        return list(result.scalars().all())

    def add(self, attachment: ExpenseAttachment) -> None:
        self.db.add(attachment)
