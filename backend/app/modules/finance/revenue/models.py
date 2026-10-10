"""Subscription income (what students pay). Feeds the ledger as revenue."""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class FinanceRevenue(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "finance_revenues"

    revenue_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    # amount = what was actually received; discount_amount = price reduction
    # given on top of it (gross price = amount + discount_amount).
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="SAR", nullable=False)
    revenue_type: Mapped[str] = mapped_column(String(30), default="subscription", nullable=False)
    customer_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    package_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    invoice_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    invoice_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    payment_method: Mapped[str | None] = mapped_column(String(50), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
