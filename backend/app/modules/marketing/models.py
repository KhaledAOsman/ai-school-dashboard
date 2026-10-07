"""
Marketing & subscriptions data feeding the half-yearly KPI dashboard.

Subscription: one paid subscriber. Every subscriber pays a different price
(there are no fixed packages), so the amount actually paid and the discount
given are entered by hand; list_price is derived (paid + discount).

AdCampaign: one ad campaign on one of the three platforms (Snapchat, Meta,
TikTok). period_start/period_end are optional - historical figures taken
from the ad accounts are lifetime totals with no dates.

AppSetting: tiny key/value store (project_start_date, full_launch_date).
"""
from __future__ import annotations

import enum
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class AcquisitionSource(str, enum.Enum):
    SNAPCHAT = "snapchat"
    META = "meta"
    TIKTOK = "tiktok"
    ORGANIC = "organic"
    OTHER = "other"


class AdPlatform(str, enum.Enum):
    SNAPCHAT = "snapchat"
    META = "meta"
    TIKTOK = "tiktok"


class Subscription(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "subscriptions"

    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Normalized 9665XXXXXXXX. NOT unique: one phone can hold two subscriptions.
    phone: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    subscribed_at: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    source: Mapped[str | None] = mapped_column(String(20), nullable=True)
    lead_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crm_leads.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


class AdCampaign(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "ad_campaigns"

    platform: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    objective: Mapped[str | None] = mapped_column(String(100), nullable=True)
    spend: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    results_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    results_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # True when results_count is a real "lead" (sign-up / lead-form) result;
    # traffic/engagement results (clicks, page views) must not inflate lead counts.
    counts_as_leads: Mapped[bool] = mapped_column(default=False, nullable=False)
    # Split of the platform's reported results (all optional): instant-form
    # leads export with a phone number, the other two never do.
    form_leads: Mapped[int | None] = mapped_column(Integer, nullable=True)
    website_leads: Mapped[int | None] = mapped_column(Integer, nullable=True)
    messaging_conversations: Mapped[int | None] = mapped_column(Integer, nullable=True)
    impressions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    clicks: Mapped[int | None] = mapped_column(Integer, nullable=True)
    period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
