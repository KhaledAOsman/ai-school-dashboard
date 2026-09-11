"""
CRM: Leads pipeline for free-trial-lecture bookings.

Stages are grouped into three sections, each its own page in the UI:

GROUP 1 - "العملاء المحتملون" (leads not yet booked): NEW, NOT_ANSWERED,
UNREACHABLE. A lead starts at NEW - it does NOT jump straight to
"contacted", since being added to the system is not the same as having
actually reached the person. Booking a slot moves the lead into group 2
regardless of which of these three it was sitting at.

GROUP 2 - "الحجوزات" (booked, awaiting the lecture outcome): BOOKED,
CONFIRMED_WHATSAPP, CONFIRMED_CALL, ZOOM_SENT, ATTENDANCE_RECORDED.
Sending the post-lecture report (only reachable after attended=True) moves
the lead into group 3.

GROUP 3 - "عملاء مهتمون" (interested clients - the real sales-conversion
work): REPORT_SENT, FOLLOW_UP, then the terminal CONVERTED/LOST.

Each stage transition is recorded in LeadStageEvent with WHO performed it
and WHEN, since different stages are commonly handled by different call
center staff. This is the per-lead audit trail the sales manager reviews.

Booking references a real TeacherSlot (crm.teachers) rather than a
free-text teacher name - customer service manages each teacher's available
slots (and fixed Zoom link) directly, and booking a lead consumes one slot
(see TeacherSlot.is_booked). teacher_name/lecture_date/lecture_time are
still stored on the Lead itself as a point-in-time snapshot: if the
teacher roster changes later, the lead's own booking history stays exactly
as it was when booked.

Call attempts (LeadCallAttempt) are a separate, repeatable log distinct
from stage events: a lead can accumulate several attempts (called, no
answer; called again, connected) while sitting in group 1.
"""
from __future__ import annotations

import enum
import uuid
from datetime import date, datetime, time

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, Text, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class LeadStage(str, enum.Enum):
    # Group 1: leads
    NEW = "new"  # جديد - لسة ما تم التواصل
    NOT_ANSWERED = "not_answered"  # لم يتم الرد (بعد محاولة اتصال واحدة أو أكثر)
    UNREACHABLE = "unreachable"  # لم يتم الاتصال (رقم خاطئ/غير متاح)

    # Group 2: bookings
    BOOKED = "booked"  # تم حجز الموعد
    CONFIRMED_WHATSAPP = "confirmed_whatsapp"  # تأكيد الموعد بالواتساب
    CONFIRMED_CALL = "confirmed_call"  # تأكيد الموعد بالجوال قبل المحاضرة
    ZOOM_SENT = "zoom_sent"  # تم إرسال رابط الزوم
    ATTENDANCE_RECORDED = "attendance_recorded"  # تم تسجيل الحضور (حضر/لم يحضر)

    # Group 3: interested clients
    REPORT_SENT = "report_sent"  # تم إرسال تقرير المحاضرة (يدخل مجموعة "عملاء مهتمون")
    FOLLOW_UP = "follow_up"  # متابعة لتحويله لعميل فعلي (قد تتكرر عدة مرات)
    CONVERTED = "converted"  # تم التحويل لعميل فعلي (نهاية ناجحة)
    LOST = "lost"  # تم إغلاق الـ Lead بدون تحويل (نهاية غير ناجحة)


# Which UI section/page a lead belongs in, given its current stage. Used by
# the repository to filter each of the three list endpoints.
LEADS_GROUP_STAGES: list[str] = [LeadStage.NEW.value, LeadStage.NOT_ANSWERED.value, LeadStage.UNREACHABLE.value]
BOOKINGS_GROUP_STAGES: list[str] = [
    LeadStage.BOOKED.value,
    LeadStage.CONFIRMED_WHATSAPP.value,
    LeadStage.CONFIRMED_CALL.value,
    LeadStage.ZOOM_SENT.value,
    LeadStage.ATTENDANCE_RECORDED.value,
]
INTERESTED_GROUP_STAGES: list[str] = [
    LeadStage.REPORT_SENT.value,
    LeadStage.FOLLOW_UP.value,
    LeadStage.CONVERTED.value,
    LeadStage.LOST.value,
]

STAGE_ORDER: list[str] = [
    LeadStage.NEW.value,
    LeadStage.BOOKED.value,
    LeadStage.CONFIRMED_WHATSAPP.value,
    LeadStage.CONFIRMED_CALL.value,
    LeadStage.ZOOM_SENT.value,
    LeadStage.ATTENDANCE_RECORDED.value,
    LeadStage.REPORT_SENT.value,
    LeadStage.FOLLOW_UP.value,
]


class CallOutcome(str, enum.Enum):
    """Outcome of a single call attempt made while a lead sits in group 1,
    before a slot is booked. A lead can accumulate many attempts (e.g. two
    no-answers before finally connecting) - see LeadCallAttempt below."""
    CONNECTED = "connected"  # تم الاتصال
    NOT_ANSWERED = "not_answered"  # لم يتم الرد
    UNREACHABLE = "unreachable"  # لم يتم الاتصال (رقم خاطئ/غير متاح)


class Lead(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "crm_leads"

    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(30), nullable=False)
    source: Mapped[str | None] = mapped_column(String(100), nullable=True)

    stage: Mapped[str] = mapped_column(String(30), default=LeadStage.NEW.value, nullable=False, index=True)

    # Booking snapshot - filled when a TeacherSlot is booked for this lead.
    # teacher_slot_id points at the consumed slot; the three snapshot
    # columns preserve what was true at booking time even if the teacher
    # roster or slot changes afterward.
    teacher_slot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crm_teacher_slots.id", ondelete="SET NULL"), nullable=True
    )
    teacher_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    lecture_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    lecture_time: Mapped[time | None] = mapped_column(Time, nullable=True)

    zoom_link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    attended: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    is_converted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_lost: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    lost_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)

    stage_events: Mapped[list["LeadStageEvent"]] = relationship(
        back_populates="lead", order_by="LeadStageEvent.created_at", cascade="all, delete-orphan"
    )
    call_attempts: Mapped[list["LeadCallAttempt"]] = relationship(
        back_populates="lead", order_by="LeadCallAttempt.created_at", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Lead {self.full_name} ({self.stage})>"


class LeadStageEvent(Base, UUIDPrimaryKeyMixin):
    """
    Append-only log of every stage transition (and follow-up attempt) on a
    lead: which stage, who performed it, when, and any free-text note (e.g.
    "لم يرد على الاتصال" for a follow-up attempt).
    """
    __tablename__ = "crm_lead_stage_events"

    lead_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crm_leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stage: Mapped[str] = mapped_column(String(30), nullable=False)
    performed_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    lead: Mapped["Lead"] = relationship(back_populates="stage_events")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<LeadStageEvent {self.stage} on {self.lead_id}>"


class LeadCallAttempt(Base, UUIDPrimaryKeyMixin):
    """
    A single call attempt logged while a lead sits in group 1 (before a
    TeacherSlot is booked). Separate from LeadStageEvent because an
    attempt is not itself a pipeline stage advance by default - only
    not_answered/unreachable outcomes change lead.stage (connecting is the
    trigger to book, not a stage of its own).
    """
    __tablename__ = "crm_lead_call_attempts"

    lead_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crm_leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    outcome: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    performed_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    lead: Mapped["Lead"] = relationship(back_populates="call_attempts")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<LeadCallAttempt {self.outcome} on {self.lead_id}>"
