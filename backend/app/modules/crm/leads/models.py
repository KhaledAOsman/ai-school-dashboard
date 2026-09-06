"""
CRM: Leads pipeline for free-trial-lecture bookings.

A Lead moves through a fixed 8-stage pipeline (see LeadStage below). Unlike
the platform's other approval-gate workflows, this pipeline isn't a strict
state machine with rejection branches - it's a straight-line sequence a
salesperson advances a lead through, with the option to mark "did not
attend" at the attendance stage and still continue to follow-up (a no-show
is not a dead end - the sales team may still convert them later).

Each stage transition is recorded in LeadStageEvent with WHO performed it
and WHEN, since different stages are commonly handled by different call
center staff (see docs: "كل مرحلة ممكن يسجلها موظف مختلف"). This is the
per-lead audit trail the sales manager reviews to see who called, who
booked, who confirmed, etc.

Booking references a real TeacherSlot (crm.teachers) rather than a free-text
teacher name - customer service manages each teacher's available slots
directly, and booking a lead consumes one slot (see TeacherSlot.is_booked).
teacher_name/lecture_date/lecture_time are still stored on the Lead itself
as a point-in-time snapshot: if the teacher roster changes later, the
lead's own booking history stays exactly as it was when booked.
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
    CONTACTED = "contacted"  # 1. التواصل بالهاتف
    BOOKED = "booked"  # 2. حجز الموعد
    CONFIRMED_WHATSAPP = "confirmed_whatsapp"  # 3. تأكيد الموعد بالواتساب
    CONFIRMED_CALL = "confirmed_call"  # 4. تأكيد الموعد بالجوال قبل المحاضرة
    ZOOM_SENT = "zoom_sent"  # 5. إرسال رابط الزوم
    ATTENDANCE_RECORDED = "attendance_recorded"  # 6. تم تسجيل الحضور (حضر/لم يحضر)
    REPORT_SENT = "report_sent"  # 7. تم إرسال تقرير المحاضرة (يُتخطى تلقائيًا لو لم يحضر)
    FOLLOW_UP = "follow_up"  # 8. متابعة لتحويله لعميل فعلي (قد تتكرر عدة مرات)
    CONVERTED = "converted"  # تم التحويل لعميل فعلي (نهاية ناجحة)
    LOST = "lost"  # تم إغلاق الـ Lead بدون تحويل (نهاية غير ناجحة)


STAGE_ORDER: list[str] = [
    LeadStage.CONTACTED.value,
    LeadStage.BOOKED.value,
    LeadStage.CONFIRMED_WHATSAPP.value,
    LeadStage.CONFIRMED_CALL.value,
    LeadStage.ZOOM_SENT.value,
    LeadStage.ATTENDANCE_RECORDED.value,
    LeadStage.REPORT_SENT.value,
    LeadStage.FOLLOW_UP.value,
]


class Lead(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "crm_leads"

    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(30), nullable=False)
    source: Mapped[str | None] = mapped_column(String(100), nullable=True)

    stage: Mapped[str] = mapped_column(String(30), default=LeadStage.CONTACTED.value, nullable=False, index=True)

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
