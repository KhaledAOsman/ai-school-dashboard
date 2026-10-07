from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator, computed_field

Source = Literal["snapchat", "meta", "tiktok", "organic", "other"]
Platform = Literal["snapchat", "meta", "tiktok"]


def normalize_phone(raw: str) -> str:
    """Digits only, drop leading 00/966/0, then prefix 966 (Saudi numbers)."""
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("966"):
        digits = digits[3:]
    digits = digits.lstrip("0")
    if not digits:
        raise ValueError("رقم الجوال غير صحيح")
    return "966" + digits


class SubscriptionBase(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    phone: str = Field(min_length=5, max_length=30)
    amount_paid: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0, max_digits=12, decimal_places=2)
    subscribed_at: date
    source: Source | None = None
    lead_id: uuid.UUID | None = None
    notes: str | None = None

    @field_validator("phone")
    @classmethod
    def _normalize(cls, v: str) -> str:
        return normalize_phone(v)


class SubscriptionCreateRequest(SubscriptionBase):
    pass


class SubscriptionUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    phone: str | None = Field(default=None, min_length=5, max_length=30)
    amount_paid: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    discount_amount: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    subscribed_at: date | None = None
    source: Source | None = None
    lead_id: uuid.UUID | None = None
    notes: str | None = None

    @field_validator("phone")
    @classmethod
    def _normalize(cls, v: str | None) -> str | None:
        return normalize_phone(v) if v is not None else v


class SubscriptionResponse(BaseModel):
    id: uuid.UUID
    full_name: str
    phone: str
    amount_paid: Decimal
    discount_amount: Decimal
    subscribed_at: date
    source: str | None
    lead_id: uuid.UUID | None
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}

    @computed_field  # type: ignore[prop-decorator]
    @property
    def list_price(self) -> Decimal:
        return self.amount_paid + self.discount_amount


class SubscriptionTotals(BaseModel):
    count: int
    total_paid: Decimal
    total_discount: Decimal
    total_list_price: Decimal


class SubscriptionListResponse(BaseModel):
    items: list[SubscriptionResponse]
    totals: SubscriptionTotals


class CampaignBase(BaseModel):
    platform: Platform
    name: str = Field(min_length=1, max_length=200)
    objective: str | None = Field(default=None, max_length=100)
    spend: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    results_count: int | None = Field(default=None, ge=0)
    results_label: str | None = Field(default=None, max_length=100)
    counts_as_leads: bool = False
    form_leads: int | None = Field(default=None, ge=0)
    website_leads: int | None = Field(default=None, ge=0)
    messaging_conversations: int | None = Field(default=None, ge=0)
    impressions: int | None = Field(default=None, ge=0)
    clicks: int | None = Field(default=None, ge=0)
    period_start: date | None = None
    period_end: date | None = None
    period_label: str | None = Field(default=None, max_length=100)
    notes: str | None = None


class CampaignCreateRequest(CampaignBase):
    pass


class CampaignUpdateRequest(BaseModel):
    platform: Platform | None = None
    name: str | None = Field(default=None, min_length=1, max_length=200)
    objective: str | None = None
    spend: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    results_count: int | None = Field(default=None, ge=0)
    results_label: str | None = None
    counts_as_leads: bool | None = None
    form_leads: int | None = Field(default=None, ge=0)
    website_leads: int | None = Field(default=None, ge=0)
    messaging_conversations: int | None = Field(default=None, ge=0)
    impressions: int | None = Field(default=None, ge=0)
    clicks: int | None = Field(default=None, ge=0)
    period_start: date | None = None
    period_end: date | None = None
    period_label: str | None = None
    notes: str | None = None


class CampaignResponse(CampaignBase):
    id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class PlatformTotals(BaseModel):
    platform: str
    spend: Decimal
    leads: int
    cost_per_lead: Decimal | None
    campaigns: int
    form_leads: int = 0
    website_leads: int = 0
    messaging_conversations: int = 0


class CampaignListResponse(BaseModel):
    items: list[CampaignResponse]
    platforms: list[PlatformTotals]
    total_spend: Decimal
