"""
Expense entity + version history + approval action log.

Versioning design (spec sections 9-10):
    - `Expense` holds the CURRENT state (denormalized for fast reads).
    - Every meaningful change inserts a new `ExpenseVersion` row capturing
      a full snapshot of the fields at that point, plus who/when/why.
    - Restoring an old version creates a NEW version (never rewrites or
      deletes old ones) - see modules/finance/expenses/service.py.
    - `ExpenseApproval` is a narrower, append-only log specifically of
      approval-workflow actions (submit/approve/reject/cancel), distinct
      from the general version history, so "show me the approval trail"
      and "show me every edit" can be queried independently.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Date,
    ForeignKey,
    Numeric,
    String,
    Text,
    Integer,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Expense(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "expenses"

    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="SAR", nullable=False)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)

    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("expense_categories.id", ondelete="RESTRICT"), nullable=False
    )
    subcategory_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("expense_categories.id", ondelete="RESTRICT"), nullable=True
    )

    # Optional link to a budget line item (e.g. "Instructor Salaries -
    # September"). When set, this expense counts against that line's
    # budgeted_amount for actual-vs-budget tracking. A budget line must be
    # APPROVED before any expense can reference it - enforced in the
    # service layer, not here (spec: manager approves the line before any
    # spending against it).
    budget_line_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("budget_lines.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    # Optional link to the staff member this expense pays (e.g. a specific
    # instructor's monthly salary). Nullable - most non-payroll expenses
    # have no associated staff member.
    staff_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_members.id", ondelete="SET NULL"), nullable=True, index=True
    )

    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    vendor: Mapped[str | None] = mapped_column(String(200), nullable=True)
    invoice_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    payment_method: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(String(30), default="draft", nullable=False, index=True)

    current_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    versions: Mapped[list["ExpenseVersion"]] = relationship(
        back_populates="expense", order_by="ExpenseVersion.version_number"
    )
    approval_events: Mapped[list["ExpenseApproval"]] = relationship(
        back_populates="expense", order_by="ExpenseApproval.created_at"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Expense {self.id} {self.amount} {self.currency}>"


class ExpenseVersion(Base, UUIDPrimaryKeyMixin):
    """
    Immutable snapshot of an expense's fields at a point in time.
    Never updated or deleted after creation.
    """
    __tablename__ = "expense_versions"

    expense_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)

    snapshot: Mapped[dict] = mapped_column(
        JSONB, nullable=False, doc="Full field snapshot at this version"
    )

    change_reason: Mapped[str | None] = mapped_column(
        String(500), nullable=True,
        doc="e.g. 'Initial creation', 'Amount corrected', 'Restored from version 1'",
    )
    restored_from_version: Mapped[int | None] = mapped_column(
        Integer, nullable=True,
        doc="Set when this version was created via a rollback/restore action",
    )

    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")

    expense: Mapped["Expense"] = relationship(back_populates="versions")


class ExpenseApproval(Base, UUIDPrimaryKeyMixin):
    """Append-only log of approval-workflow actions on an expense."""
    __tablename__ = "expense_approvals"

    expense_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    action: Mapped[str] = mapped_column(
        String(30), nullable=False, doc="submit | approve | reject | cancel | resubmit"
    )
    from_status: Mapped[str] = mapped_column(String(30), nullable=False)
    to_status: Mapped[str] = mapped_column(String(30), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    performed_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")

    expense: Mapped["Expense"] = relationship(back_populates="approval_events")
