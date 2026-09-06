from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions.object_policy import ensure_found
from app.modules.crm.teachers.models import CRMTeacher, TeacherSlot
from app.modules.crm.teachers.repository import CRMTeacherRepository, TeacherSlotRepository
from app.modules.crm.teachers.schemas import (
    CRMTeacherCreateRequest,
    CRMTeacherWithSlotsResponse,
    TeacherSlotCreateRequest,
    TeacherSlotResponse,
)


class CRMTeacherService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = CRMTeacherRepository(db)
        self.slot_repo = TeacherSlotRepository(db)

    async def create_teacher(self, *, payload: CRMTeacherCreateRequest, user_id: uuid.UUID) -> CRMTeacher:
        teacher = CRMTeacher(full_name=payload.full_name, created_by=user_id)
        self.repo.add(teacher)
        await self.db.commit()
        return await self.repo.get_by_id(teacher.id)

    async def list_teachers_with_available_slots(self, *, include_inactive: bool = False) -> list[CRMTeacherWithSlotsResponse]:
        """
        Returns every teacher with only their not-yet-booked slots attached
        - this is what the lead booking step (step 2 of the pipeline) reads
        from, so a salesperson only ever sees times that are actually still
        bookable for that teacher.
        """
        teachers = await self.repo.list_all(include_inactive=include_inactive)
        results = []
        for teacher in teachers:
            slots = await self.slot_repo.list_available_for_teacher(teacher.id)
            results.append(
                CRMTeacherWithSlotsResponse(
                    id=teacher.id,
                    full_name=teacher.full_name,
                    is_active=teacher.is_active,
                    created_at=teacher.created_at,
                    available_slots=[TeacherSlotResponse.model_validate(s) for s in slots],
                )
            )
        return results

    async def add_slot(self, *, teacher_id: uuid.UUID, payload: TeacherSlotCreateRequest, user_id: uuid.UUID) -> TeacherSlot:
        teacher = await self.repo.get_by_id(teacher_id)
        ensure_found(teacher, "Teacher")

        slot = TeacherSlot(
            teacher_id=teacher_id,
            slot_date=payload.slot_date,
            slot_time=payload.slot_time,
            created_by=user_id,
        )
        self.slot_repo.add(slot)
        await self.db.commit()
        return await self.slot_repo.get_by_id(slot.id)

    async def deactivate_teacher(self, *, teacher_id: uuid.UUID) -> CRMTeacher:
        teacher = await self.repo.get_by_id(teacher_id)
        ensure_found(teacher, "Teacher")
        teacher.is_active = False
        await self.db.commit()
        return await self.repo.get_by_id(teacher_id)
