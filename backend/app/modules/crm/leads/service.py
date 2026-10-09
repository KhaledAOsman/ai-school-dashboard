"""
Lead pipeline service.

Each advance-stage method here does three things in one transaction:
1. Applies the actual state change to the Lead row.
2. Appends a LeadStageEvent recording exactly who performed this step and
   when - the per-lead "who called, who booked, who confirmed" trail.
3. Commits.

Stages move a lead between three UI groups (see models.py):
group 1 (leads) -> book -> group 2 (bookings) -> attended -> group 3
(interested); "did not attend" stays in group 2. Call attempts are logged while in group 1 and only
not_answered/unreachable change lead.stage (connecting is the trigger to
book, not a stage of its own). follow_up can be logged repeatedly, and a
lead marked "did not attend" can still continue to follow-up rather than
being a dead end.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit.service import AuditService
from app.core.permissions.object_policy import ensure_found
from app.core.users.repository import UserRepository
from app.modules.crm.leads.models import (
    BOOKINGS_GROUP_STAGES,
    INTERESTED_GROUP_STAGES,
    LEADS_GROUP_STAGES,
    Booking,
    Lead,
    LeadCallAttempt,
    LeadStage,
    LeadStageEvent,
)
from app.modules.crm.leads.repository import LeadRepository
from app.modules.crm.leads.schemas import (
    BookingListItem,
    BookingResponse,
    PaginatedBookingResponse,
    LeadBookRequest,
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

    async def _notify_whatsapp(self, *, trigger: str, lead: Lead, user_id: uuid.UUID) -> None:
        """Best-effort automatic WhatsApp notification for a pipeline
        trigger - never lets a WhatsApp failure (bridge down, no active
        template configured for this trigger, number not linked, etc.)
        fail or roll back the pipeline action itself, since that action
        succeeding is what actually matters. Staff configure which
        template (if any) fires for which trigger from the templates
        page - nothing here is hardcoded to a specific template."""
        try:
            from app.modules.whatsapp.service import WhatsAppService
            await WhatsAppService(self.db).send_trigger_notification(trigger=trigger, lead=lead, user_id=user_id)
        except Exception:  # noqa: BLE001
            pass

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
            legacy_booked=lead.legacy_booked,
            bookings=[BookingResponse.model_validate(b) for b in lead.bookings],
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
        if await self.repo.phone_exists(payload.phone):
            raise HTTPException(status.HTTP_409_CONFLICT, "هذا الرقم مسجّل بالفعل كعميل")
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
        if payload.phone is not None and payload.phone != lead.phone:
            # the phone identifies the customer: it cannot collide with another one
            if await self.repo.phone_exists(payload.phone):
                raise HTTPException(status.HTTP_409_CONFLICT, "هذا الرقم مسجّل لعميل آخر")
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

    # ---- Bookings: a customer can hold any number of them ----
    @staticmethod
    def _mirror_latest_booking(lead: Lead) -> None:
        """Lead.teacher_name / lecture_date / ... mirror the customer's
        latest booking (WhatsApp templates and the schedule read them)."""
        bookings = list(lead.bookings)
        if not bookings:
            lead.teacher_slot_id = lead.teacher_name = lead.lecture_date = lead.lecture_time = lead.zoom_link = None
            lead.attended = None
            return
        latest = max(enumerate(bookings), key=lambda ib: (ib[1].lecture_date or date.min, ib[0]))[1]
        lead.teacher_slot_id = latest.teacher_slot_id
        lead.teacher_name = latest.teacher_name
        lead.lecture_date = latest.lecture_date
        lead.lecture_time = latest.lecture_time
        lead.zoom_link = latest.zoom_link
        lead.attended = latest.attended

    def _recompute_stage(
        self, lead: Lead, *, user_id: uuid.UUID, note: str | None, attendance_changed: bool = False, record: bool = True
    ) -> None:
        """Keeps the customer's stage in step with their bookings: any
        attended booking -> interested; otherwise booked while bookings
        exist; back to contacted when the last booking is removed. Later
        pipeline stages (follow-up, converted, lost...) are never touched."""
        old = lead.stage
        if old in (LeadStage.REPORT_SENT.value, LeadStage.FOLLOW_UP.value, LeadStage.CONVERTED.value, LeadStage.LOST.value):
            return
        has_attended = any(b.attended is True for b in lead.bookings)
        if has_attended:
            new = LeadStage.INTERESTED.value
        elif lead.bookings:
            if old in (LeadStage.CONFIRMED_WHATSAPP.value, LeadStage.CONFIRMED_CALL.value, LeadStage.ZOOM_SENT.value):
                new = old
            elif old == LeadStage.INTERESTED.value and not attendance_changed:
                new = old
            else:
                new = LeadStage.BOOKED.value
        else:
            new = LeadStage.CONTACTED.value if (old in BOOKINGS_GROUP_STAGES or old == LeadStage.INTERESTED.value) else old
        if new != old:
            lead.stage = new
            if record:
                self._record_stage_event(lead=lead, stage=new, user_id=user_id, note=note)

    async def _load_booking(self, booking_id: uuid.UUID) -> tuple[Booking, Lead]:
        booking = await self.repo.get_booking(booking_id)
        ensure_found(booking, "Booking")
        lead = await self.repo.get_by_id(booking.lead_id)
        ensure_found(lead, "Lead")
        booking = next(b for b in lead.bookings if b.id == booking_id)
        return booking, lead

    async def _free_slot(self, booking: Booking, lead: Lead) -> None:
        if booking.teacher_slot_id:
            old_slot = await self.slot_repo.get_by_id(booking.teacher_slot_id)
            if old_slot and old_slot.booked_lead_id == lead.id:
                old_slot.is_booked = False
                old_slot.booked_lead_id = None

    async def book(self, *, lead_id: uuid.UUID, payload: LeadBookRequest, user_id: uuid.UUID) -> LeadResponse:
        """Adds a booking for the customer (any number of them - siblings
        sharing a phone, or one person attending several lectures). With a
        teacher slot it consumes the slot; without one it is a plain
        "تم الحجز" whose lecture details can be filled in later."""
        lead = await self.repo.get_by_id(lead_id)
        ensure_found(lead, "Lead")

        teacher_name, lecture_date, lecture_time, zoom_link, slot_id = (
            payload.teacher_name, payload.lecture_date, payload.lecture_time, None, None,
        )
        slot = None
        if payload.teacher_slot_id:
            slot = await self.slot_repo.get_by_id(payload.teacher_slot_id)
            ensure_found(slot, "Teacher slot")
            if slot.is_booked:
                raise HTTPException(status.HTTP_409_CONFLICT, "This slot has already been booked")
            teacher_name = slot.teacher.full_name if slot.teacher else None
            lecture_date, lecture_time = slot.slot_date, slot.slot_time
            # the teacher's fixed Zoom link is applied automatically
            zoom_link = slot.teacher.zoom_link if slot.teacher and slot.teacher.zoom_link else None
            slot_id = slot.id

        for b in lead.bookings:
            if lecture_date is None and b.lecture_date is None and b.attended is None:
                raise HTTPException(status.HTTP_409_CONFLICT, "لدى العميل حجز بدون موعد بانتظار الحضور بالفعل")
            if lecture_date is not None and b.lecture_date == lecture_date and b.lecture_time == lecture_time and b.teacher_name == teacher_name:
                raise HTTPException(status.HTTP_409_CONFLICT, "هذا الحجز مسجّل للعميل بالفعل")

        booking = Booking(
            lead_id=lead.id, teacher_slot_id=slot_id, teacher_name=teacher_name,
            lecture_date=lecture_date, lecture_time=lecture_time, zoom_link=zoom_link, attended=None,
        )
        lead.bookings.append(booking)
        if slot is not None:
            slot.is_booked = True
            slot.booked_lead_id = lead.id
        lead.legacy_booked = False
        self._mirror_latest_booking(lead)
        self._recompute_stage(lead, user_id=user_id, note="تم الحجز", record=False)
        when = f" {lecture_date} {lecture_time}" if lecture_date else ""
        self._record_stage_event(lead=lead, stage=LeadStage.BOOKED.value, user_id=user_id, note=f"حجز جديد{when}")
        await self.db.commit()
        lead = await self.repo.get_by_id(lead_id)
        if slot is not None:
            await self._notify_whatsapp(trigger="lecture_booked", lead=lead, user_id=user_id)
        return await self._to_response(lead)

    async def unbook(self, *, booking_id: uuid.UUID, user_id: uuid.UUID, note: str | None = None) -> LeadResponse:
        """إلغاء الحجز: removes one booking (frees its slot, drops its
        attendance). If it was the customer's last booking the customer
        returns to العملاء المحتملون."""
        booking, lead = await self._load_booking(booking_id)
        await self._free_slot(booking, lead)
        lead.bookings.remove(booking)
        lead.legacy_booked = False
        await self.db.flush()
        self._mirror_latest_booking(lead)
        self._recompute_stage(lead, user_id=user_id, note=note or "إلغاء الحجز", attendance_changed=True)
        await self.db.commit()
        lead = await self.repo.get_by_id(lead.id)
        return await self._to_response(lead)

    async def reschedule(self, *, booking_id: uuid.UUID, teacher_slot_id: uuid.UUID, user_id: uuid.UUID, note: str | None) -> LeadResponse:
        """تأجيل: moves one booking to a new teacher slot (frees the old
        slot, re-applies the new teacher's Zoom link, resets attendance)."""
        booking, lead = await self._load_booking(booking_id)
        slot = await self.slot_repo.get_by_id(teacher_slot_id)
        ensure_found(slot, "Teacher slot")
        if slot.is_booked:
            raise HTTPException(status.HTTP_409_CONFLICT, "This slot has already been booked")
        await self._free_slot(booking, lead)
        slot.is_booked = True
        slot.booked_lead_id = lead.id
        booking.teacher_slot_id = slot.id
        booking.teacher_name = slot.teacher.full_name if slot.teacher else None
        booking.lecture_date = slot.slot_date
        booking.lecture_time = slot.slot_time
        if slot.teacher and slot.teacher.zoom_link:
            booking.zoom_link = slot.teacher.zoom_link
        booking.attended = None
        self._mirror_latest_booking(lead)
        self._recompute_stage(lead, user_id=user_id, note="تأجيل", attendance_changed=True)
        text_note = f"Rescheduled to {slot.slot_date} {slot.slot_time}" + (f" - {note}" if note else "")
        self._record_stage_event(lead=lead, stage=lead.stage, user_id=user_id, note=text_note)
        await self.db.commit()
        lead = await self.repo.get_by_id(lead.id)
        await self._notify_whatsapp(trigger="lecture_booked", lead=lead, user_id=user_id)
        return await self._to_response(lead)

    # ---- Stages 3, 4, 5: simple linear advances within group 2 ----
    async def _advance(
        self, *, lead_id: uuid.UUID, target_stage: str, user_id: uuid.UUID, note: str | None, whatsapp_trigger: str | None = None
    ) -> LeadResponse:
        lead = await self.repo.get_by_id(lead_id)
        ensure_found(lead, "Lead")
        lead.stage = target_stage
        self._record_stage_event(lead=lead, stage=target_stage, user_id=user_id, note=note)
        await self.db.commit()
        lead = await self.repo.get_by_id(lead_id)
        if whatsapp_trigger:
            await self._notify_whatsapp(trigger=whatsapp_trigger, lead=lead, user_id=user_id)
        return await self._to_response(lead)

    async def confirm_whatsapp(self, *, lead_id: uuid.UUID, user_id: uuid.UUID, note: str | None) -> LeadResponse:
        return await self._advance(
            lead_id=lead_id, target_stage=LeadStage.CONFIRMED_WHATSAPP.value, user_id=user_id, note=note,
            whatsapp_trigger="confirmed_whatsapp",
        )

    async def confirm_call(self, *, lead_id: uuid.UUID, user_id: uuid.UUID, note: str | None) -> LeadResponse:
        """Confirming by phone moves straight to zoom_sent - the Zoom link
        is already applied automatically from the teacher's fixed link at
        booking time (see book_slot), so there is no separate manual
        "send Zoom" step for staff to do."""
        return await self._advance(
            lead_id=lead_id, target_stage=LeadStage.ZOOM_SENT.value, user_id=user_id, note=note,
            whatsapp_trigger="confirmed_call",
        )

    async def send_zoom(self, *, lead_id: uuid.UUID, zoom_link: str, user_id: uuid.UUID, note: str | None) -> LeadResponse:
        lead = await self.repo.get_by_id(lead_id)
        ensure_found(lead, "Lead")
        lead.zoom_link = zoom_link
        target = next((b for b in reversed(list(lead.bookings)) if b.attended is None), None)
        if target is not None:
            target.zoom_link = zoom_link
        lead.stage = LeadStage.ZOOM_SENT.value
        self._record_stage_event(lead=lead, stage=LeadStage.ZOOM_SENT.value, user_id=user_id, note=note)
        await self.db.commit()
        lead = await self.repo.get_by_id(lead_id)
        return await self._to_response(lead)

    # ---- Attendance ----
    async def record_attendance(self, *, booking_id: uuid.UUID, payload: LeadAttendanceRequest, user_id: uuid.UUID) -> LeadResponse:
        """Attendance is recorded per booking. حضر -> the customer becomes an
        interested client (and still shows in الحجوزات as attended). لم يحضر
        -> the booking stays in الحجوزات marked "لم يحضر". None -> undo:
        back to waiting for a decision."""
        booking, lead = await self._load_booking(booking_id)
        booking.attended = payload.attended
        lead.legacy_booked = False
        note = payload.note or {True: "حضر المحاضرة", False: "لم يحضر"}.get(payload.attended, "بانتظار تغيّر الحالة")
        self._mirror_latest_booking(lead)
        old_stage = lead.stage
        self._recompute_stage(lead, user_id=user_id, note=note, attendance_changed=True)
        if lead.stage == old_stage:
            self._record_stage_event(lead=lead, stage=lead.stage, user_id=user_id, note=note)
        await self.db.commit()
        lead = await self.repo.get_by_id(lead.id)
        return await self._to_response(lead)

    async def delete_lead(self, *, lead_id: uuid.UUID, user_id: uuid.UUID) -> None:
        """System-administrator action: permanently removes the customer
        (identified by phone) with ALL of their rows - leads, bookings and
        interested lists - plus stage events and call attempts. Blocked when
        the customer owns a subscription, so revenue records are never orphaned."""
        lead = await self.repo.get_by_id(lead_id)
        ensure_found(lead, "Lead")
        rows = await self.repo.list_by_phone(lead.phone)
        ids = [r.id for r in rows]
        has_sub = (
            await self.db.execute(text("SELECT count(*) FROM subscriptions WHERE lead_id = ANY(:ids) OR phone = :p"), {"ids": ids, "p": lead.phone})
        ).scalar_one()
        if has_sub:
            raise HTTPException(status_code=409, detail="لا يمكن حذف عميل لديه اشتراك مسجّل. عدّل أو احذف الاشتراك أولاً.")
        snapshot = {"full_name": lead.full_name, "phone": lead.phone, "source": lead.source, "stage": lead.stage, "rows": len(rows)}
        await self.audit.record(
            user_id=user_id, action="crm_lead.deleted", resource_type="Lead", resource_id=str(lead.id),
            previous_value=snapshot,
        )
        for r in rows:
            for b in await self.repo.list_bookings(r.id):
                await self._free_slot(b, r)
            await self.db.delete(r)
        await self.db.commit()

    async def send_report(self, *, lead_id: uuid.UUID, user_id: uuid.UUID, note: str | None) -> LeadResponse:
        """Sends the post-lecture report - this is also the transition
        point from group 2 (الحجوزات) into group 3 (عملاء مهتمون), where the
        real sales/conversion follow-up work happens. Only meaningful if
        the lead attended - the UI hides this action otherwise, but it
        isn't hard-blocked server-side since a report might legitimately
        be sent for other reasons."""
        return await self._advance(
            lead_id=lead_id, target_stage=LeadStage.REPORT_SENT.value, user_id=user_id, note=note,
            whatsapp_trigger="report_sent",
        )

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
        await self._notify_whatsapp(trigger="converted", lead=lead, user_id=user_id)
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
        await self._notify_whatsapp(trigger="lost", lead=lead, user_id=user_id)
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
        await self._notify_whatsapp(trigger="not_interested", lead=lead, user_id=user_id)
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
        attendance: str | None = None,
        unique_phone: bool = False,
    ) -> PaginatedLeadResponse:
        leads, total = await self.repo.list_paginated(
            page=page, page_size=page_size, search=search, stage=stage, stages=stages, source=source,
            assigned_to=assigned_to, date_from=date_from, date_to=date_to,
            sort_by=sort_by, sort_dir=sort_dir, attendance=attendance, unique_phone=unique_phone,
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
        results = []
        for booking, lead in await self.repo.list_scheduled(assigned_to=assigned_to):
            assigned_user = await self.user_repo.get_by_id(lead.assigned_to) if lead.assigned_to else None
            results.append(
                ScheduledLectureResponse(
                    lead_id=lead.id,
                    booking_id=booking.id,
                    lead_full_name=lead.full_name,
                    lead_phone=lead.phone,
                    stage=lead.stage,
                    teacher_name=booking.teacher_name,
                    lecture_date=booking.lecture_date,
                    lecture_time=booking.lecture_time,
                    zoom_link=booking.zoom_link,
                    assigned_to_name=assigned_user.full_name if assigned_user else None,
                )
            )
        return results

    # ---- الحجوزات: one row per booking ----
    async def list_bookings(
        self, *, page: int, page_size: int, search: str | None, attendance: str | None, assigned_to: uuid.UUID | None
    ) -> PaginatedBookingResponse:
        rows, total, counts = await self.repo.list_bookings_paginated(
            page=page, page_size=page_size, search=search, attendance=attendance, assigned_to=assigned_to
        )
        items = []
        for booking, lead in rows:
            assigned_user = await self.user_repo.get_by_id(lead.assigned_to) if lead.assigned_to else None
            items.append(
                BookingListItem(
                    **BookingResponse.model_validate(booking).model_dump(),
                    full_name=lead.full_name,
                    phone=lead.phone,
                    source=lead.source,
                    lead_stage=lead.stage,
                    lead_notes=lead.notes,
                    assigned_to=lead.assigned_to,
                    assigned_to_name=assigned_user.full_name if assigned_user else None,
                )
            )
        return PaginatedBookingResponse(
            items=items, total=total, page=page, page_size=page_size,
            total_pages=max(1, (total + page_size - 1) // page_size), **counts,
        )
