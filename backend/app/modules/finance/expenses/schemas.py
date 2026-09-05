from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class ExpenseCreateRequest(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    currency: str = Field(default="SAR", min_length=3, max_length=3)
    expense_date: date
    category_id: uuid.UUID
    subcategory_id: uuid.UUID | None = None
    budget_line_id: uuid.UUID | None = None
    staff_id: uuid.UUID | None = None
    description: str | None = None
    vendor: str | None = Field(default=None, max_length=200)
    invoice_number: str | None = Field(default=None, max_length=100)
    payment_method: str | None = Field(default=None, max_length=50)
    notes: str | None = None


class ExpenseUpdateRequest(BaseModel):
    amount: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    expense_date: date | None = None
    category_id: uuid.UUID | None = None
    subcategory_id: uuid.UUID | None = None
    budget_line_id: uuid.UUID | None = None
    staff_id: uuid.UUID | None = None
    description: str | None = None
    vendor: str | None = Field(default=None, max_length=200)
    invoice_number: str | None = Field(default=None, max_length=100)
    payment_method: str | None = Field(default=None, max_length=50)
    notes: str | None = None
    change_reason: str | None = Field(default=None, max_length=500)


class ExpenseRejectRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


class ExpenseRestoreRequest(BaseModel):
    version_number: int = Field(gt=0)
    reason: str | None = Field(default=None, max_length=500)


class ExpenseResponse(BaseModel):
    id: uuid.UUID
    amount: Decimal
    currency: str
    expense_date: date
    category_id: uuid.UUID
    subcategory_id: uuid.UUID | None
    budget_line_id: uuid.UUID | None
    staff_id: uuid.UUID | None
    description: str | None
    vendor: str | None
    invoice_number: str | None
    payment_method: str | None
    notes: str | None
    status: str
    current_version: int
    created_by: uuid.UUID
    created_at: datetime
    updated_by: uuid.UUID | None
    updated_at: datetime
    approved_by: uuid.UUID | None
    approved_at: datetime | None
    rejected_by: uuid.UUID | None
    rejected_at: datetime | None
    rejection_reason: str | None
    is_archived: bool

    model_config = {"from_attributes": True}


class ExpenseVersionResponse(BaseModel):
    id: uuid.UUID
    version_number: int
    snapshot: dict
    change_reason: str | None
    restored_from_version: int | None
    created_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class ExpenseApprovalEventResponse(BaseModel):
    id: uuid.UUID
    action: str
    from_status: str
    to_status: str
    reason: str | None
    performed_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class ExpenseDetailResponse(ExpenseResponse):
    versions: list[ExpenseVersionResponse] = []
    approval_events: list[ExpenseApprovalEventResponse] = []
