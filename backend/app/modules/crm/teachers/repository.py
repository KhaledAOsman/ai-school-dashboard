from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.crm.teachers.models import CRMTeacher, TeacherSlot


class CRMTeacherRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, teacher_id: uuid.UUID) -> CRMTeacher | None:
        result = await self.db.execute(select(CRMTeacher).where(CRMTeacher.id == teacher_id))
        return result.scalar_one_or_none()

    async def list_all(self, *, include_inactive: bool = False) -> list[CRMTeacher]:
        stmt = select(CRMTeacher).order_by(CRMTeacher.full_name)
        if not include_inactive:
            stmt = stmt.where(CRMTeacher.is_active.is_(True))
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    def add(self, teacher: CRMTeacher) -> None:
        self.db.add(teacher)


class TeacherSlotRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, slot_id: uuid.UUID) -> TeacherSlot | None:
        result = await self.db.execute(
            select(TeacherSlot).options(selectinload(TeacherSlot.teacher)).where(TeacherSlot.id == slot_id)
        )
        return result.scalar_one_or_none()

    async def list_available_for_teacher(self, teacher_id: uuid.UUID) -> list[TeacherSlot]:
        result = await self.db.execute(
            select(TeacherSlot)
            .where(TeacherSlot.teacher_id == teacher_id, TeacherSlot.is_booked.is_(False))
            .order_by(TeacherSlot.slot_date, TeacherSlot.slot_time)
        )
        return list(result.scalars().all())

    def add(self, slot: TeacherSlot) -> None:
        self.db.add(slot)
