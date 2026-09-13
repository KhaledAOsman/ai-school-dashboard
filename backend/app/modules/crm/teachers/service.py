from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions.object_policy import ensure_found
from app.modules.crm.leads.repository import LeadRepository
from app.modules.crm.teachers.models import CRMTeacher, TeacherSlot
from app.modules.crm.teachers.repository import CRMTeacherRepository, TeacherSlotRepository
from app.modules.crm.teachers.schemas import (
    CRMTeacherCreateRequest,
    CRMTeacherUpdateRequest,
    CRMTeacherWithSlotsResponse,
    ScheduleSlotResponse,
    TeacherScheduleResponse,
    TeacherSlotCreateRequest,
    TeacherSlotResponse,
)


class CRMTeacherService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = CRMTeacherRepository(db)
        self.slot_repo = TeacherSlotRepository(db)
        self.lead_repo = LeadRepository(db)

    async def create_teacher(self, *, payload: CRMTeacherCreateRequest, user_id: uuid.UUID) -> CRMTeacher:
        teacher = CRMTeacher(full_name=payload.full_name, zoom_link=payload.zoom_link, created_by=user_id)
        self.repo.add(teacher)
        await self.db.commit()
        return await self.repo.get_by_id(teacher.id)

    async def update_teacher(self, *, teacher_id: uuid.UUID, payload: CRMTeacherUpdateRequest) -> CRMTeacher:
        teacher = await self.repo.get_by_id(teacher_id)
        ensure_found(teacher, "Teacher")
        if payload.full_name is not None:
            teacher.full_name = payload.full_name
        if payload.zoom_link is not None:
            teacher.zoom_link = payload.zoom_link
        await self.db.commit()
        return await self.repo.get_by_id(teacher_id)

    async def list_teachers_with_available_slots(self, *, include_inactive: bool = False) -> list[CRMTeacherWithSlotsResponse]:
        """
        Returns every teacher with only their not-yet-booked slots attached
        - this is what the lead booking step reads from, so a salesperson
        only ever sees times that are actually still bookable.
        """
        teachers = await self.repo.list_all(include_inactive=include_inactive)
        results = []
        for teacher in teachers:
            slots = await self.slot_repo.list_available_for_teacher(teacher.id)
            results.append(
                CRMTeacherWithSlotsResponse(
                    id=teacher.id,
                    full_name=teacher.full_name,
                    zoom_link=teacher.zoom_link,
                    is_active=teacher.is_active,
                    created_at=teacher.created_at,
                    available_slots=[TeacherSlotResponse.model_validate(s) for s in slots],
                )
            )
        return results

    async def add_slot(self, *, teacher_id: uuid.UUID, payload: TeacherSlotCreateRequest, user_id: uuid.UUID) -> TeacherSlot:
        teacher = await self.repo.get_by_id(teacher_id)
        ensure_found(teacher, "Teacher")

        # Prevent double-booking the same teacher at the exact same
        # date+time - two customer-service reps could otherwise add
        # overlapping slots for the same teacher by mistake.
        existing_slots = await self.slot_repo.list_all_for_teacher(teacher_id)
        if any(s.slot_date == payload.slot_date and s.slot_time == payload.slot_time for s in existing_slots):
            raise HTTPException(status.HTTP_409_CONFLICT, "يوجد موعد مضاف بالفعل لهذا المدرّس في نفس التاريخ والوقت")

        slot = TeacherSlot(
            teacher_id=teacher_id,
            slot_date=payload.slot_date,
            slot_time=payload.slot_time,
            created_by=user_id,
        )
        self.slot_repo.add(slot)
        await self.db.commit()
        return await self.slot_repo.get_by_id(slot.id)

    async def delete_slot(self, *, slot_id: uuid.UUID) -> None:
        """Removes an available slot customer service no longer wants to
        offer. Only allowed while the slot is still unbooked - once a lead
        has booked it, deleting it would silently orphan that lead's
        lecture_date/time, so a booked slot must be un-booked (or the lead
        rescheduled) through the lead itself first."""
        slot = await self.slot_repo.get_by_id(slot_id)
        ensure_found(slot, "Teacher slot")
        if slot.is_booked:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete a slot that has already been booked")
        await self.slot_repo.delete(slot)
        await self.db.commit()

    async def deactivate_teacher(self, *, teacher_id: uuid.UUID) -> CRMTeacher:
        teacher = await self.repo.get_by_id(teacher_id)
        ensure_found(teacher, "Teacher")
        teacher.is_active = False
        await self.db.commit()
        return await self.repo.get_by_id(teacher_id)

    async def get_full_schedule(self) -> list[TeacherScheduleResponse]:
        """
        Every active teacher with EVERY slot (booked and available), for
        the professional schedule grid - customer service needs to see
        the whole picture across all teachers before booking a lead, not
        just one teacher's free times in a dropdown.
        """
        teachers = await self.repo.list_all(include_inactive=False)
        results = []
        for teacher in teachers:
            slots = await self.slot_repo.list_all_for_teacher(teacher.id)
            slot_responses = []
            for slot in slots:
                lead_name = None
                if slot.booked_lead_id:
                    lead = await self.lead_repo.get_by_id(slot.booked_lead_id)
                    lead_name = lead.full_name if lead else None
                slot_responses.append(
                    ScheduleSlotResponse(
                        id=slot.id,
                        teacher_id=slot.teacher_id,
                        slot_date=slot.slot_date,
                        slot_time=slot.slot_time,
                        is_booked=slot.is_booked,
                        booked_lead_id=slot.booked_lead_id,
                        created_at=slot.created_at,
                        booked_lead_name=lead_name,
                    )
                )
            results.append(
                TeacherScheduleResponse(teacher_id=teacher.id, teacher_full_name=teacher.full_name, slots=slot_responses)
            )
        return results
