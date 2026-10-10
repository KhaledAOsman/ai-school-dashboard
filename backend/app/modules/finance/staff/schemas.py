from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class StaffDepartmentCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    display_order: int = 0


class StaffDepartmentResponse(BaseModel):
    id: uuid.UUID
    name: str
    display_order: int
    is_archived: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class StaffCreateRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    department_id: uuid.UUID
    email: str | None = None
    phone: str | None = Field(default=None, max_length=30)
    base_salary: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    currency: str = Field(default="SAR", min_length=3, max_length=3)


class StaffUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    department_id: uuid.UUID | None = None
    email: str | None = None
    phone: str | None = Field(default=None, max_length=30)
    base_salary: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    is_active: bool | None = None


class StaffResponse(BaseModel):
    id: uuid.UUID
    full_name: str
    department_id: uuid.UUID
    department_name: str
    email: str | None
    phone: str | None
    base_salary: Decimal | None
    currency: str
    is_active: bool
    created_at: datetime
    # Everyone here is paid per month on variable amounts (freelancers), so
    # instead of a fixed salary we report what was actually paid out.
    total_paid: Decimal = Decimal("0")
    payments_count: int = 0
    last_paid_on: date | None = None

    model_config = {"from_attributes": True}


class StaffDepartmentGroup(BaseModel):
    """A department with its members grouped underneath, plus rollup
    totals of what was actually paid to them."""
    department_id: uuid.UUID
    department_name: str
    member_count: int
    total_paid: Decimal
    payments_count: int = 0
    members: list[StaffResponse]
