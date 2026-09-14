"""
Lead pipeline service.

Each advance-stage method here does three things in one transaction:
1. Applies the actual state change to the Lead row.
2. Appends a LeadStageEvent recording exactly who performed this step and
   when - the per-lead "who called, who booked, who confirmed" trail.
3. Commits.

Stages move a lead between three UI groups (see models.py):
group 1 (leads) -> book_slot -> group 2 (bookings) -> send_report ->
group 3 (interested). Call attempts are logged while in group 1 and only
not_answered/unreachable change lead.stage (connecting is the trigger to
book, not a stage of its own). follow_up can be logged repeatedly, and a
lead marked "did not attend" can still continue to follow-up rather than
being a dead end.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit.service import AuditService
from app.core.permissions.object_policy import ensure_found
from app.core.users.repository import UserRepository
from app.modules.crm.leads.models import Lead, LeadCallAttempt, LeadStage, LeadStageEvent
from app.modules.crm.leads.repository import LeadRepository
from app.modules.crm.leads.schemas import (
    LeadAttendanceRequest,
    LeadBulkAssignRequest,
    LeadBulkImportRequest,
    LeadBulkImportResult,
    LeadBulkImportRowError,
    LeadCallAttemptRequest,
    LeadCallAttemptResponse,
    LeadConvertRequest,
    LeadCreateRequest,
    LeadDetailResponse,
    LeadLoseRequest,
    LeadNotInterestedRequest,
    LeadReassignRequest,
    LeadResponse,
    LeadStageEventResponse,
    LeadUpdateRequest,
    PaginatedLeadResponse,
    ScheduledLectureResponse,
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

    def _record_call_attempt(self, *, lead: Lead, outcome: str, user_id: uuid.UUID, note: str | None) -> None:
        attempt = LeadCallAttempt(
            lead_id=lead.id,
            outcome=outcome,
            note=note,
            performed_by=user_id,
            created_at=_utcnow(),
        )
        self.repo.add_call_attempt(attempt)

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
            follow_up_count=lead.follow_up_count,
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
        call_attempts = []
        for a in lead.call_attempts:
            performer = await self.user_repo.get_by_id(a.performed_by)
            call_attempts.append(
                LeadCallAttemptResponse(
                    id=a.id,
                    outcome=a.outcome,
                    note=a.note,
                    performed_by=a.performed_by,
                    performed_by_name=performer.full_name if performer else "—",
                    created_at=a.created_at,
                )
            )
        return LeadDetailResponse(**base.model_dump(), stage_events=events, call_attempts=call_attempts)

    # ---- Call attempts (repeatable, happen while stage is in the "leads"
    # group: NEW / CONTACTED / NOT_ANSWERED) ----
    async def log_call_attempt(self, *, lead_id: uuid.UUID, payload: LeadCallAttemptRequest, user_id: uuid.UUID) -> LeadResponse:
        """
        Logs a call attempt AND always moves the lead's stage to match the
        outcome, so the leads table shows the lead's real status
        (جديد / تم الاتصال / لم يتم الرد) rather than staying stuck at
        whatever it started as. Repeatable - logging another attempt later
        (e.g. re-confirming contact) just updates the stage again.
        """
        lead = await self.repo.get_by_id(lead_id)
        ensure_found(lead, "Lead")
        self._record_call_attempt(lead=lead, outcome=payload.outcome, user_id=user_id, note=payload.note)
        lead.stage = payload.outcome
        self._record_stage_event(lead=lead, stage=payload.outcome, user_id=user_id, note=payload.note)
        await self.db.commit()
        lead = await self.repo.get_by_id(lead_id)
        return await self._to_response(lead)

    # ---- Group 1 -> creation ----
    async def create_lead(self, *, payload: LeadCreateRequest, user_id: uuid.UUID) -> LeadResponse:
        lead = Lead(
            full_name=payload.full_name,
            phone=payload.phone,
            source=payload.source,
            notes=payload.notes,
            stage=LeadStage.NEW.value,
            assigned_to=payload.assigned_to,
            created_by=user_id,
        )
        self.repo.add(lead)
        await self.db.flush()
        self._record_stage_event(lead=lead, stage=LeadStage.NEW.value, user_id=user_id, note=None)
        await self.audit.record(
            user_id=user_id, action="crm_lead.created", resource_type="Lead", resource_id=str(lead.id),
        )
        await self.db.commit()
        lead = await self.repo.get_by_id(lead.id)
        return await self._to_response(lead)

    # ---- Direct field edit (inline-editable table cells) ----
    async def update_lead(self, *, lead_id: uuid.UUID, payload: LeadUpdateRequest, user_id: uuid.UUID) -> LeadResponse:
        """Edits plain fields (name, phone, source, notes) directly - used
        by the inline-editable source/notes cells in the leads table. Not
        part of the pipeline, so it does not touch stage or record a
        stage_event; the audit log still captures the change."""
        lead = await self.repo.get_by_id(lead_id)
        ensure_found(lead, "Lead")

        previous = {"full_name": lead.full_name, "phone": lead.phone, "source": lead.source, "notes": lead.notes}
        if payload.full_name is not None:
            lead.full_name = payload.full_name
        if payload.phone is not None:
            lead.phone = payload.phone
        if payload.source is not None:
            lead.source = payload.source
        if payload.notes is not None:
            lead.notes = payload.notes

        await self.audit.record(
            user_id=user_id, action="crm_lead.updated", resource_type="Lead", resource_id=str(lead.id),
            previous_value=previous,
            new_value={"full_name": lead.full_name, "phone": lead.phone, "source": lead.source, "notes": lead.notes},
        )
        await self.db.commit()
        lead = await self.repo.get_by_id(lead_id)
        return await self._to_response(lead)

    # ---- Group 2: booking / reschedule ----
    async def book_slot(
        self, *, lead_id: uuid.UUID, teacher_slot_id: uuid.UUID, user_id: uuid.UUID, reschedule_note: str | None = None
    ) -> LeadResponse:
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
        # Auto-apply the teacher's fixed Zoom link, if they have one, so
        # customer service doesn't have to look it up or retype it - the
        # explicit send_zoom step still exists for cases where a teacher
        # has no fixed link yet or it needs to be overridden.
        if slot.teacher and slot.teacher.zoom_link:
            lead.zoom_link = slot.teacher.zoom_link
        lead.stage = LeadStage.BOOKED.value

        note = reschedule_note or f"Booked {slot.slot_date} {slot.slot_time}"
        if reschedule_note is not None:
            note = f"Rescheduled to {slot.slot_date} {slot.slot_time}" + (f" - {reschedule_note}" if reschedule_note else "")
        self._record_stage_event(lead=lead, stage=LeadStage.BOOKED.value, user_id=user_id, note=note)
        await self.db.commit()
        lead = await self.repo.get_by_id(lead_id)

        # Best-effort automatic WhatsApp notification - never lets a
        # WhatsApp failure (bridge down, no active template, number not
        # linked, etc.) fail or roll back the booking itself, since the
        # booking succeeding is what actually matters here.
        try:
            from app.modules.whatsapp.service import WhatsAppService
            await WhatsAppService(self.db).send_lecture_booked_notification(lead=lead, user_id=user_id)
        except Exception:  # noqa: BLE001
            pass

        return await self._to_response(lead)

    async def reschedule(self, *, lead_id: uuid.UUID, teacher_slot_id: uuid.UUID, user_id: uuid.UUID, note: str | None) -> LeadResponse:
        """
        تأجيل: used at the attendance step when the lecture needs to be
        postponed rather than marked attended/did-not-attend. Frees the
        lead's previous slot (if any, so it becomes bookable again for
        someone else) and books the new one via book_slot (which also
        re-applies the new teacher's Zoom link automatically). Resets
        attended back to None since the previous attendance record no
        longer applies to the new lecture time.
        """
        lead = await self.repo.get_by_id(lead_id)
        ensure_found(lead, "Lead")

        if lead.teacher_slot_id:
            old_slot = await self.slot_repo.get_by_id(lead.teacher_slot_id)
            if old_slot and old_slot.booked_lead_id == lead.id:
                old_slot.is_booked = False
                old_slot.booked_lead_id = None

        lead.attended = None
        await self.db.flush()

        return await self.book_slot(lead_id=lead_id, teacher_slot_id=teacher_slot_id, user_id=user_id, reschedule_note=note)

    # ---- Stages 3, 4, 5: simple linear advances within group 2 ----
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
        """Confirming by phone moves straight to zoom_sent - the Zoom link
        is already applied automatically from the teacher's fixed link at
        booking time (see book_slot), so there is no separate manual
        "send Zoom" step for staff to do."""
        return await self._advance(lead_id=lead_id, target_stage=LeadStage.ZOOM_SENT.value, user_id=user_id, note=note)

    async def send_zoom(self, *, lead_id: uuid.UUID, zoom_link: str, user_id: uuid.UUID, note: str | None) -> LeadResponse:
        lead = await self.repo.get_by_id(lead_id)
        ensure_found(lead, "Lead")
        lead.zoom_link = zoom_link
        lead.stage = LeadStage.ZOOM_SENT.value
        self._record_stage_event(lead=lead, stage=LeadStage.ZOOM_SENT.value, user_id=user_id, note=note)
        await self.db.commit()
        lead = await self.repo.get_by_id(lead_id)
        return await self._to_response(lead)

    # ---- Attendance ----
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
        """Sends the post-lecture report - this is also the transition
        point from group 2 (الحجوزات) into group 3 (عملاء مهتمون), where the
        real sales/conversion follow-up work happens. Only meaningful if
        the lead attended - the UI hides this action otherwise, but it
        isn't hard-blocked server-side since a report might legitimately
        be sent for other reasons."""
        return await self._advance(lead_id=lead_id, target_stage=LeadStage.REPORT_SENT.value, user_id=user_id, note=note)

    # ---- Group 3: follow-up (repeatable) ----
    async def log_follow_up(self, *, lead_id: uuid.UUID, user_id: uuid.UUID, note: str | None) -> LeadResponse:
        """
        Unlike the other stages, follow-up can be logged multiple times -
        each call just appends another stage_event without necessarily
        needing lead.stage to change (it may already be "follow_up").
        follow_up_count increments every call, which the UI uses to
        require confirmation before closing a lead after 3+ attempts.
        """
        lead = await self.repo.get_by_id(lead_id)
        ensure_found(lead, "Lead")
        lead.stage = LeadStage.FOLLOW_UP.value
        lead.follow_up_count += 1
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

    async def mark_not_interested(self, *, lead_id: uuid.UUID, payload: LeadNotInterestedRequest, user_id: uuid.UUID) -> LeadResponse:
        """غير مهتم: closes a lead straight from group 1, chosen from the
        booking-status dropdown instead of proceeding to book a slot.
        Reuses is_lost/lost_reason (same terminal-outcome bookkeeping as
        mark_lost) but a distinct stage/audit action so reporting can tell
        "never booked" apart from "booked, attended, but didn't convert"."""
        lead = await self.repo.get_by_id(lead_id)
        ensure_found(lead, "Lead")
        lead.is_lost = True
        lead.lost_reason = payload.reason
        lead.stage = LeadStage.NOT_INTERESTED.value
        self._record_stage_event(lead=lead, stage=LeadStage.NOT_INTERESTED.value, user_id=user_id, note=payload.reason)
        await self.audit.record(user_id=user_id, action="crm_lead.not_interested", resource_type="Lead", resource_id=str(lead.id))
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

    # ---- Paginated, searchable, filterable listing (used for 1000+ rows) ----
    async def list_paginated(
        self,
        *,
        page: int,
        page_size: int,
        search: str | None,
        stage: str | None,
        stages: list[str] | None = None,
        source: str | None,
        assigned_to: uuid.UUID | None,
        date_from,
        date_to,
        sort_by: str,
        sort_dir: str,
    ) -> PaginatedLeadResponse:
        leads, total = await self.repo.list_paginated(
            page=page, page_size=page_size, search=search, stage=stage, stages=stages, source=source,
            assigned_to=assigned_to, date_from=date_from, date_to=date_to,
            sort_by=sort_by, sort_dir=sort_dir,
        )
        items = [await self._to_response(l) for l in leads]
        total_pages = max(1, (total + page_size - 1) // page_size)
        return PaginatedLeadResponse(items=items, total=total, page=page, page_size=page_size, total_pages=total_pages)

    async def list_sources(self) -> list[str]:
        return await self.repo.list_distinct_sources()

    # ---- Bulk import ----
    async def bulk_import(self, *, payload: LeadBulkImportRequest, user_id: uuid.UUID) -> LeadBulkImportResult:
        created_count = 0
        skipped_duplicate_count = 0
        errors: list[LeadBulkImportRowError] = []

        for index, row in enumerate(payload.rows):
            try:
                if await self.repo.phone_exists(row.phone):
                    skipped_duplicate_count += 1
                    continue

                lead = Lead(
                    full_name=row.full_name,
                    phone=row.phone,
                    source=row.source,
                    notes=row.notes,
                    stage=LeadStage.NEW.value,
                    assigned_to=payload.assigned_to,
                    created_by=user_id,
                )
                self.repo.add(lead)
                await self.db.flush()
                self._record_stage_event(lead=lead, stage=LeadStage.NEW.value, user_id=user_id, note="Imported")
                created_count += 1
            except Exception as exc:  # noqa: BLE001 - one bad row must not abort the batch
                errors.append(LeadBulkImportRowError(row_index=index, full_name=row.full_name, error=str(exc)))

        await self.audit.record(
            user_id=user_id, action="crm_lead.bulk_imported", resource_type="Lead", resource_id="bulk",
            new_value={"created": created_count, "skipped_duplicates": skipped_duplicate_count, "errors": len(errors)},
        )
        await self.db.commit()

        return LeadBulkImportResult(
            total_submitted=len(payload.rows),
            created_count=created_count,
            skipped_duplicate_count=skipped_duplicate_count,
            error_count=len(errors),
            errors=errors,
        )

    # ---- Bulk reassignment ----
    async def bulk_assign(self, *, payload: LeadBulkAssignRequest, user_id: uuid.UUID) -> int:
        leads = await self.repo.get_by_ids(payload.lead_ids)
        updated_count = 0
        for lead in leads:
            if lead.assigned_to != payload.assigned_to:
                lead.assigned_to = payload.assigned_to
                updated_count += 1

        await self.audit.record(
            user_id=user_id, action="crm_lead.bulk_reassigned", resource_type="Lead", resource_id="bulk",
            new_value={"lead_count": len(leads), "assigned_to": str(payload.assigned_to)},
        )
        await self.db.commit()
        return updated_count

    # ---- Schedule: every booked lecture, calendar-style ----
    async def list_scheduled(self, *, assigned_to: uuid.UUID | None = None) -> list[ScheduledLectureResponse]:
        leads = await self.repo.list_scheduled(assigned_to=assigned_to)
        results = []
        for lead in leads:
            assigned_user = await self.user_repo.get_by_id(lead.assigned_to) if lead.assigned_to else None
            results.append(
                ScheduledLectureResponse(
                    lead_id=lead.id,
                    lead_full_name=lead.full_name,
                    lead_phone=lead.phone,
                    stage=lead.stage,
                    teacher_name=lead.teacher_name,
                    lecture_date=lead.lecture_date,
                    lecture_time=lead.lecture_time,
                    zoom_link=lead.zoom_link,
                    assigned_to_name=assigned_user.full_name if assigned_user else None,
                )
            )
        return results
