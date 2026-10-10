from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class RevenueCreateRequest(BaseModel):
    revenue_date: date
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    currency: str = Field(default="SAR", min_length=3, max_length=3)
    customer_name: str | None = Field(default=None, max_length=200)
    package_name: str | None = Field(default=None, max_length=200)
    invoice_number: str | None = Field(default=None, max_length=100)
    invoice_url: str | None = None
    payment_method: str | None = Field(default=None, max_length=50)
    note: str | None = None


class RevenueUpdateRequest(BaseModel):
    revenue_date: date | None = None
    amount: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    discount_amount: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    customer_name: str | None = Field(default=None, max_length=200)
    package_name: str | None = Field(default=None, max_length=200)
    invoice_number: str | None = Field(default=None, max_length=100)
    invoice_url: str | None = None
    payment_method: str | None = Field(default=None, max_length=50)
    note: str | None = None


class RevenueResponse(BaseModel):
    id: uuid.UUID
    revenue_date: date
    amount: Decimal
    discount_amount: Decimal
    gross_amount: Decimal
    currency: str
    revenue_type: str
    customer_name: str | None
    package_name: str | None
    invoice_number: str | None
    invoice_url: str | None
    payment_method: str | None
    note: str | None
    source: str | None
    created_at: datetime
