"""Ledger accounts (non-expense part of the chart) and manual journal entries."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class LedgerAccount(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "ledger_accounts"

    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    account_type: Mapped[str] = mapped_column(String(20), nullable=False)  # asset|liability|equity|revenue|expense
    parent_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    normal_side: Mapped[str] = mapped_column(String(6), nullable=False)  # debit|credit
    is_postable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class JournalEntry(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """A manual / adjusting entry. Voided entries stay on record but are ignored."""

    __tablename__ = "journal_entries"

    entry_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    memo: Mapped[str] = mapped_column(Text, nullable=False)
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    void_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    lines: Mapped[list["JournalLine"]] = relationship(
        "JournalLine", back_populates="entry", cascade="all, delete-orphan", order_by="JournalLine.line_no"
    )


class JournalLine(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "journal_lines"
    __table_args__ = (
        CheckConstraint("debit >= 0 AND credit >= 0 AND (debit = 0 OR credit = 0)", name="ck_journal_line_one_side"),
    )

    entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    line_no: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    account_code: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    debit: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    credit: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    party: Mapped[str | None] = mapped_column(String(200), nullable=True)

    entry: Mapped[JournalEntry] = relationship("JournalEntry", back_populates="lines")
