"""
CRM: Teachers and their available trial-lecture slots.

This is intentionally separate from the platform's own `staff_members`
table (finance/payroll) - a CRM teacher here is just a name the customer
service team manages for scheduling purposes, not necessarily a payroll
record. Kept simple per the org's current process: no recurring/weekly
slots, no capacity - one row per bookable slot, one slot per student
booking (see TeacherSlot.is_booked below).

Customer service team manages this list directly (create teachers, add
slots) - when a slot is booked from the Lead booking step, it's marked
is_booked=True and disappears from the "available" list for that teacher,
never to be reused (a fresh slot must be added if the teacher becomes
available again at that time).
"""
from __future__ import annotations

import uuid
from datetime import date, time

from sqlalchemy import Boolean, Date, ForeignKey, String, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class CRMTeacher(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "crm_teachers"

    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    slots: Mapped[list["TeacherSlot"]] = relationship(back_populates="teacher", cascade="all, delete-orphan")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<CRMTeacher {self.full_name}>"


class TeacherSlot(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    A single bookable date+time slot for one teacher. One-time use only -
    once booked (is_booked=True, linked to a lead), it's no longer offered
    as available and is never recycled.
    """
    __tablename__ = "crm_teacher_slots"

    teacher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crm_teachers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    slot_date: Mapped[date] = mapped_column(Date, nullable=False)
    slot_time: Mapped[time] = mapped_column(Time, nullable=False)

    is_booked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    booked_lead_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crm_leads.id", ondelete="SET NULL"), nullable=True
    )

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    teacher: Mapped["CRMTeacher"] = relationship(back_populates="slots")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<TeacherSlot {self.slot_date} {self.slot_time} booked={self.is_booked}>"
