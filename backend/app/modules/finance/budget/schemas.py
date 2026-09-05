from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class BudgetLineCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    kind: str = Field(default="fixed", pattern="^(fixed|variable)$")
    period: str = Field(default="monthly", pattern="^(one_time|monthly|quarterly|yearly)$")
    budgeted_amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    currency: str = Field(default="SAR", min_length=3, max_length=3)
    period_start: date | None = None
    period_end: date | None = None
    category_ids: list[uuid.UUID] = Field(min_length=1, description="Must belong to at least one category")


class BudgetLineUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    kind: str | None = Field(default=None, pattern="^(fixed|variable)$")
    period: str | None = Field(default=None, pattern="^(one_time|monthly|quarterly|yearly)$")
    budgeted_amount: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    period_start: date | None = None
    period_end: date | None = None
    category_ids: list[uuid.UUID] | None = None


class BudgetLineRejectRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


class CategoryRef(BaseModel):
    id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}


class BudgetLineResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    kind: str
    period: str
    budgeted_amount: Decimal
    currency: str
    period_start: date | None
    period_end: date | None
    status: str
    created_by: uuid.UUID
    created_at: datetime
    approved_by: uuid.UUID | None
    approved_at: datetime | None
    rejected_by: uuid.UUID | None
    rejected_at: datetime | None
    rejection_reason: str | None
    is_archived: bool
    categories: list[CategoryRef]

    model_config = {"from_attributes": True}


class BudgetLineWithSpendResponse(BudgetLineResponse):
    """Adds actual-vs-budget figures, computed by the service layer."""
    spent_amount: Decimal
    remaining_amount: Decimal
    spent_pct: float
