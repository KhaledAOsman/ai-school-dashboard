from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.whatsapp.models import MessageTemplate, WhatsAppMessageLog


class MessageTemplateRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, template_id: uuid.UUID) -> MessageTemplate | None:
        result = await self.db.execute(select(MessageTemplate).where(MessageTemplate.id == template_id))
        return result.scalar_one_or_none()

    async def list_all(self, *, include_inactive: bool = False) -> list[MessageTemplate]:
        stmt = select(MessageTemplate).order_by(MessageTemplate.name)
        if not include_inactive:
            stmt = stmt.where(MessageTemplate.is_active.is_(True))
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_active_for_trigger(self, trigger: str) -> MessageTemplate | None:
        """The single active template for an automatic trigger (e.g.
        lecture_booked) - if more than one is active for the same
        trigger, the most recently updated one wins."""
        result = await self.db.execute(
            select(MessageTemplate)
            .where(MessageTemplate.trigger == trigger, MessageTemplate.is_active.is_(True))
            .order_by(MessageTemplate.updated_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    def add(self, template: MessageTemplate) -> None:
        self.db.add(template)


class WhatsAppMessageLogRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    def add(self, log: WhatsAppMessageLog) -> None:
        self.db.add(log)

    async def list_for_lead(self, lead_id: uuid.UUID) -> list[WhatsAppMessageLog]:
        result = await self.db.execute(
            select(WhatsAppMessageLog)
            .where(WhatsAppMessageLog.lead_id == lead_id)
            .order_by(WhatsAppMessageLog.created_at.desc())
        )
        return list(result.scalars().all())
