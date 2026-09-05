"""
Budget line item models.

A BudgetLine is a planned allocation of money (e.g. "Instructor Salaries -
September", "Software Subscriptions - Q1", "Marketing Campaign - Launch")
that:
    - has its own budgeted amount + recurrence period
    - is fixed or variable in nature
    - belongs to one OR MORE expense categories (many-to-many - a single
      line like "Instructor Salaries" might span both an "HR" category and
      a "Payroll" subcategory, for example)
    - must be approved by a General Manager (via the BudgetLineStatus state
      machine) BEFORE any expense can be posted against it
    - tracks actual spend vs. budget via its linked expenses

Expenses reference a budget line via `expenses.budget_line_id` (nullable -
not every expense has to belong to a budget line, but doing so enables
budget-vs-actual tracking).
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Table,
    Text,
    Column,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class BudgetLineKind(str, Enum):
    FIXED = "fixed"
    VARIABLE = "variable"


class BudgetPeriod(str, Enum):
    ONE_TIME = "one_time"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"


# ---- Many-to-many: a budget line can span multiple categories ----
budget_line_categories = Table(
    "budget_line_categories",
    Base.metadata,
    Column("budget_line_id", UUID(as_uuid=True), ForeignKey("budget_lines.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", UUID(as_uuid=True), ForeignKey("expense_categories.id", ondelete="RESTRICT"), primary_key=True),
)


class BudgetLine(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "budget_lines"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    kind: Mapped[str] = mapped_column(String(20), default=BudgetLineKind.FIXED.value, nullable=False)
    period: Mapped[str] = mapped_column(String(20), default=BudgetPeriod.MONTHLY.value, nullable=False)

    budgeted_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="SAR", nullable=False)

    period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_end: Mapped[date | None] = mapped_column(Date, nullable=True)

    status: Mapped[str] = mapped_column(String(30), default="draft", nullable=False, index=True)

    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
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

    categories: Mapped[list["ExpenseCategory"]] = relationship(  # noqa: F821
        secondary=budget_line_categories,
    )
    approval_events: Mapped[list["BudgetLineApproval"]] = relationship(
        back_populates="budget_line", order_by="BudgetLineApproval.created_at"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<BudgetLine {self.name} ({self.status})>"


class BudgetLineApproval(Base, UUIDPrimaryKeyMixin):
    """Append-only log of approval-workflow actions on a budget line."""
    __tablename__ = "budget_line_approvals"

    budget_line_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("budget_lines.id", ondelete="CASCADE"), nullable=False, index=True
    )
    action: Mapped[str] = mapped_column(String(30), nullable=False, doc="submit | approve | reject | archive")
    from_status: Mapped[str] = mapped_column(String(30), nullable=False)
    to_status: Mapped[str] = mapped_column(String(30), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    performed_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")

    budget_line: Mapped["BudgetLine"] = relationship(back_populates="approval_events")
