from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class FundingCreateRequest(BaseModel):
    funding_date: date
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    currency: str = Field(default="SAR", min_length=3, max_length=3)
    source_name: str = Field(min_length=1, max_length=200)
    note: str | None = None


class FundingUpdateRequest(BaseModel):
    funding_date: date | None = None
    amount: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    source_name: str | None = Field(default=None, min_length=1, max_length=200)
    note: str | None = None


class FundingResponse(BaseModel):
    id: uuid.UUID
    funding_date: date
    amount: Decimal
    currency: str
    source_name: str
    note: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
