"""
Lead pipeline service.

Each advance-stage method here does three things in one transaction:
1. Applies the actual state change to the Lead row.
2. Appends a LeadStageEvent recording exactly who performed this step and
   when - this is the per-lead "who called, who booked, who confirmed"
   trail requested by the sales manager.
3. Commits.

The pipeline is intentionally NOT a strict forward-only state machine -
"follow_up" can be logged repeatedly (see advance_follow_up), and a lead
marked "did not attend" can still continue to follow-up rather than being
a dead end. This matches the org's actual process: a no-show is still a
lead worth chasing.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit.service import AuditService
from app.core.permissions.object_policy import ensure_found
from app.core.users.repository import UserRepository
from app.modules.crm.leads.models import Lead, LeadStage, LeadStageEvent
from app.modules.crm.leads.repository import LeadRepository
from app.modules.crm.leads.schemas import (
    LeadAttendanceRequest,
    LeadConvertRequest,
    LeadCreateRequest,
    LeadDetailResponse,
    LeadLoseRequest,
    LeadReassignRequest,
    LeadResponse,
    LeadStageEventResponse,
)
from app.modules.crm.teachers.repository import TeacherSlotRepository


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class LeadService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = LeadRepository(db)
        self.slot_repo = TeacherSlotRepository(db)
        self.user_repo = UserRepository(db)
        self.audit = AuditService(db)

    def _record_stage_event(self, *, lead: Lead, stage: str, user_id: uuid.UUID, note: str | None) -> None:
        event = LeadStageEvent(
            lead_id=lead.id,
            stage=stage,
            performed_by=user_id,
            note=note,
            created_at=_utcnow(),
        )
        self.repo.add_stage_event(event)

    async def _to_response(self, lead: Lead) -> LeadResponse:
        assigned_user = await self.user_repo.get_by_id(lead.assigned_to) if lead.assigned_to else None
        return LeadResponse(
            id=lead.id,
            full_name=lead.full_name,
            phone=lead.phone,
            source=lead.source,
            stage=lead.stage,
            teacher_slot_id=lead.teacher_slot_id,
            teacher_name=lead.teacher_name,
            lecture_date=lead.lecture_date,
            lecture_time=lead.lecture_time,
            zoom_link=lead.zoom_link,
            attended=lead.attended,
            is_converted=lead.is_converted,
            is_lost=lead.is_lost,
            lost_reason=lead.lost_reason,
            notes=lead.notes,
            assigned_to=lead.assigned_to,
            assigned_to_name=assigned_user.full_name if assigned_user else None,
            created_by=lead.created_by,
            created_at=lead.created_at,
            updated_at=lead.updated_at,
        )

    async def _to_detail_response(self, lead: Lead) -> LeadDetailResponse:
        base = await self._to_response(lead)
        events = []
        for e in lead.stage_events:
            performer = await self.user_repo.get_by_id(e.performed_by)
            events.append(
                LeadStageEventResponse(
                    id=e.id,
                    stage=e.stage,
                    performed_by=e.performed_by,
                    performed_by_name=performer.full_name if performer else "—",
                    note=e.note,
                    created_at=e.created_at,
                )
            )
        return LeadDetailResponse(**base.model_dump(), stage_events=events)

    # ---- Stage 1: contacted (lead creation) ----
    async def create_lead(self, *, payload: LeadCreateRequest, user_id: uuid.UUID) -> LeadResponse:
        lead = Lead(
            full_name=payload.full_name,
            phone=payload.phone,
            source=payload.source,
            notes=payload.notes,
            stage=LeadStage.CONTACTED.value,
            assigned_to=payload.assigned_to,
            created_by=user_id,
        )
        self.repo.add(lead)
        await self.db.flush()
        self._record_stage_event(lead=lead, stage=LeadStage.CONTACTED.value, user_id=user_id, note=None)
        await self.audit.record(
            user_id=user_id, action="crm_lead.created", resource_type="Lead", resource_id=str(lead.id),
        )
        await self.db.commit()
        lead = await self.repo.get_by_id(lead.id)
        return await self._to_response(lead)

    # ---- Stage 2: booked ----
    async def book_slot(self, *, lead_id: uuid.UUID, teacher_slot_id: uuid.UUID, user_id: uuid.UUID) -> LeadResponse:
        lead = await self.repo.get_by_id(lead_id)
        ensure_found(lead, "Lead")

        slot = await self.slot_repo.get_by_id(teacher_slot_id)
        ensure_found(slot, "Teacher slot")
        if slot.is_booked:
            raise HTTPException(status.HTTP_409_CONFLICT, "This slot has already been booked")

        slot.is_booked = True
        slot.booked_lead_id = lead.id

        lead.teacher_slot_id = slot.id
        lead.teacher_name = slot.teacher.full_name if slot.teacher else None
        lead.lecture_date = slot.slot_date
        lead.lecture_time = slot.slot_time
        lead.stage = LeadStage.BOOKED.value

        self._record_stage_event(
            lead=lead, stage=LeadStage.BOOKED.value, user_id=user_id,
            note=f"Booked {slot.slot_date} {slot.slot_time}",
        )
        await self.db.commit()
        lead = await self.repo.get_by_id(lead_id)
        return await self._to_response(lead)

    # ---- Stages 3, 4, 5, 7: simple linear advances ----
    async def _advance(self, *, lead_id: uuid.UUID, target_stage: str, user_id: uuid.UUID, note: str | None) -> LeadResponse:
        lead = await self.repo.get_by_id(lead_id)
        ensure_found(lead, "Lead")
        lead.stage = target_stage
        self._record_stage_event(lead=lead, stage=target_stage, user_id=user_id, note=note)
        await self.db.commit()
        lead = await self.repo.get_by_id(lead_id)
        return await self._to_response(lead)

    async def confirm_whatsapp(self, *, lead_id: uuid.UUID, user_id: uuid.UUID, note: str | None) -> LeadResponse:
        return await self._advance(lead_id=lead_id, target_stage=LeadStage.CONFIRMED_WHATSAPP.value, user_id=user_id, note=note)

    async def confirm_call(self, *, lead_id: uuid.UUID, user_id: uuid.UUID, note: str | None) -> LeadResponse:
        return await self._advance(lead_id=lead_id, target_stage=LeadStage.CONFIRMED_CALL.value, user_id=user_id, note=note)

    async def send_zoom(self, *, lead_id: uuid.UUID, zoom_link: str, user_id: uuid.UUID, note: str | None) -> LeadResponse:
        lead = await self.repo.get_by_id(lead_id)
        ensure_found(lead, "Lead")
        lead.zoom_link = zoom_link
        lead.stage = LeadStage.ZOOM_SENT.value
        self._record_stage_event(lead=lead, stage=LeadStage.ZOOM_SENT.value, user_id=user_id, note=note)
        await self.db.commit()
        lead = await self.repo.get_by_id(lead_id)
        return await self._to_response(lead)

    # ---- Stage 6: attendance ----
    async def record_attendance(self, *, lead_id: uuid.UUID, payload: LeadAttendanceRequest, user_id: uuid.UUID) -> LeadResponse:
        lead = await self.repo.get_by_id(lead_id)
        ensure_found(lead, "Lead")
        lead.attended = payload.attended
        lead.stage = LeadStage.ATTENDANCE_RECORDED.value
        self._record_stage_event(
            lead=lead, stage=LeadStage.ATTENDANCE_RECORDED.value, user_id=user_id,
            note=payload.note or ("Attended" if payload.attended else "Did not attend"),
        )
        await self.db.commit()
        lead = await self.repo.get_by_id(lead_id)
        return await self._to_response(lead)

    async def send_report(self, *, lead_id: uuid.UUID, user_id: uuid.UUID, note: str | None) -> LeadResponse:
        """Only meaningful if the lead attended - the UI should hide this
        action otherwise, but we don't hard-block it server-side since a
        report might legitimately be sent for other reasons."""
        return await self._advance(lead_id=lead_id, target_stage=LeadStage.REPORT_SENT.value, user_id=user_id, note=note)

    # ---- Stage 8: follow-up (repeatable) ----
    async def log_follow_up(self, *, lead_id: uuid.UUID, user_id: uuid.UUID, note: str | None) -> LeadResponse:
        """
        Unlike the other stages, follow-up can be logged multiple times -
        each call just appends another stage_event without necessarily
        needing lead.stage to change (it may already be "follow_up"). This
        matches "محاولة تحويل العميل لعميل فعلي فيها FOLLOW UP اكتر من مرة".
        """
        lead = await self.repo.get_by_id(lead_id)
        ensure_found(lead, "Lead")
        lead.stage = LeadStage.FOLLOW_UP.value
        self._record_stage_event(lead=lead, stage=LeadStage.FOLLOW_UP.value, user_id=user_id, note=note)
        await self.db.commit()
        lead = await self.repo.get_by_id(lead_id)
        return await self._to_response(lead)

    # ---- Terminal outcomes ----
    async def convert(self, *, lead_id: uuid.UUID, user_id: uuid.UUID, note: str | None) -> LeadResponse:
        lead = await self.repo.get_by_id(lead_id)
        ensure_found(lead, "Lead")
        lead.is_converted = True
        lead.stage = LeadStage.CONVERTED.value
        self._record_stage_event(lead=lead, stage=LeadStage.CONVERTED.value, user_id=user_id, note=note)
        await self.audit.record(user_id=user_id, action="crm_lead.converted", resource_type="Lead", resource_id=str(lead.id))
        await self.db.commit()
        lead = await self.repo.get_by_id(lead_id)
        return await self._to_response(lead)

    async def mark_lost(self, *, lead_id: uuid.UUID, payload: LeadLoseRequest, user_id: uuid.UUID) -> LeadResponse:
        lead = await self.repo.get_by_id(lead_id)
        ensure_found(lead, "Lead")
        lead.is_lost = True
        lead.lost_reason = payload.reason
        lead.stage = LeadStage.LOST.value
        self._record_stage_event(lead=lead, stage=LeadStage.LOST.value, user_id=user_id, note=payload.reason)
        await self.audit.record(user_id=user_id, action="crm_lead.lost", resource_type="Lead", resource_id=str(lead.id))
        await self.db.commit()
        lead = await self.repo.get_by_id(lead_id)
        return await self._to_response(lead)

    # ---- Reassignment ----
    async def reassign(self, *, lead_id: uuid.UUID, payload: LeadReassignRequest, user_id: uuid.UUID) -> LeadResponse:
        lead = await self.repo.get_by_id(lead_id)
        ensure_found(lead, "Lead")
        previous = lead.assigned_to
        lead.assigned_to = payload.assigned_to
        await self.audit.record(
            user_id=user_id, action="crm_lead.reassigned", resource_type="Lead", resource_id=str(lead.id),
            previous_value={"assigned_to": str(previous) if previous else None},
            new_value={"assigned_to": str(payload.assigned_to)},
        )
        await self.db.commit()
        lead = await self.repo.get_by_id(lead_id)
        return await self._to_response(lead)

    async def get(self, *, lead_id: uuid.UUID) -> LeadDetailResponse:
        lead = await self.repo.get_by_id(lead_id)
        ensure_found(lead, "Lead")
        return await self._to_detail_response(lead)

    async def list_all(self, *, stage: str | None = None, assigned_to: uuid.UUID | None = None) -> list[LeadResponse]:
        leads = await self.repo.list_all(stage=stage, assigned_to=assigned_to)
        return [await self._to_response(l) for l in leads]
