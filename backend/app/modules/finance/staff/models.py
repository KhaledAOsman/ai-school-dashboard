"""
Staff/instructor records - separate from the platform's own `users` table.
A staff member is someone the school pays (instructor, admin employee) but
who does NOT necessarily have a login account on this platform. Salary
expenses reference this table via `expenses.staff_id` so a monthly salary
run can be traced back to a specific person.

Departments (StaffDepartment) are user-managed, not a fixed enum - the
Owner/Admin can add new departments (e.g. "خدمة العملاء") from the UI, and
new staff members are then assigned to one. This lets the org's structure
grow without a code change, matching the "أنا وتتثبت" requirement: a
department typed once by the user becomes a permanent, reusable option.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class StaffDepartment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    A user-defined job department/category (e.g. "المدرسين", "خدمة العملاء",
    "التسويق"). Created on demand from the Staff page - not a fixed enum -
    so the org can grow its own structure over time.
    """
    __tablename__ = "staff_departments"

    name: Mapped[str] = mapped_column(String(150), nullable=False, unique=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    members: Mapped[list["StaffMember"]] = relationship(back_populates="department")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<StaffDepartment {self.name}>"


class StaffMember(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "staff_members"

    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_departments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)

    base_salary: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="SAR", nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    department: Mapped["StaffDepartment"] = relationship(back_populates="members")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<StaffMember {self.full_name}>"
