from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.crm.leads.models import Lead, LeadStageEvent


class LeadRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, lead_id: uuid.UUID) -> Lead | None:
        result = await self.db.execute(
            select(Lead).options(selectinload(Lead.stage_events)).where(Lead.id == lead_id)
        )
        return result.scalar_one_or_none()

    async def list_all(
        self, *, stage: str | None = None, assigned_to: uuid.UUID | None = None
    ) -> list[Lead]:
        stmt = select(Lead).order_by(Lead.created_at.desc())
        if stage:
            stmt = stmt.where(Lead.stage == stage)
        if assigned_to:
            stmt = stmt.where(Lead.assigned_to == assigned_to)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    def add(self, lead: Lead) -> None:
        self.db.add(lead)

    def add_stage_event(self, event: LeadStageEvent) -> None:
        self.db.add(event)
