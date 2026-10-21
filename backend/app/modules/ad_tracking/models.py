"""
Ad tracking: the two-way link between the CRM and the ad platforms.

LeadAdAttribution - one row per lead-form submission received from an ad
platform (today: Snapchat lead forms via webhook). It keeps the platform's
own lead id (what Snap uses to tie a later conversion back to the exact ad)
plus the campaign / ad set / ad the person came from. A customer is unique
by phone, so a second submission from an existing customer adds another
attribution row to the SAME lead instead of creating a duplicate lead.

AdConversionEvent - an outbox of conversion events to report back to the
platform when the lead moves forward in the CRM (booked -> attended ->
subscribed). Rows are written in the same transaction as the pipeline
action and sent afterwards, so a platform outage never blocks or rolls
back customer-service work; failed rows are retried. event_id is unique,
which makes every stage report at most once per lead.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

JsonType = JSON().with_variant(JSONB(), "postgresql")


class ConversionStage(str, enum.Enum):
    BOOKED = "booked"        # تم حجز محاضرة مجانية
    ATTENDED = "attended"    # حضر المحاضرة المجانية
    PURCHASE = "purchase"    # اشترك ودفع


class ConversionStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"        # will be retried until MAX_ATTEMPTS
    GAVE_UP = "gave_up"      # exceeded MAX_ATTEMPTS - retried only on manual request


class LeadAdAttribution(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "crm_lead_ad_attributions"
    __table_args__ = (UniqueConstraint("platform", "external_lead_id", name="uq_lead_ad_attr_platform_ext"),)

    lead_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crm_leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    platform: Mapped[str] = mapped_column(String(20), nullable=False)
    external_lead_id: Mapped[str] = mapped_column(String(100), nullable=False)
    form_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    form_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    ad_account_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    campaign_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    campaign_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    ad_squad_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ad_squad_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    ad_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ad_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    raw: Mapped[dict | None] = mapped_column(JsonType, nullable=True)


class AdConversionEvent(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "ad_conversion_events"
    __table_args__ = (UniqueConstraint("event_id", name="uq_ad_conversion_events_event_id"),)

    lead_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crm_leads.id", ondelete="SET NULL"), nullable=True, index=True
    )
    platform: Mapped[str] = mapped_column(String(20), nullable=False)
    stage: Mapped[str] = mapped_column(String(20), nullable=False)
    event_name: Mapped[str] = mapped_column(String(50), nullable=False)
    event_id: Mapped[str] = mapped_column(String(150), nullable=False)
    event_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    value: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)

    status: Mapped[str] = mapped_column(String(20), default=ConversionStatus.PENDING.value, nullable=False, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    response_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # the exact (hashed) payload last sent - for debugging rejected events
    payload: Mapped[dict | None] = mapped_column(JsonType, nullable=True)
