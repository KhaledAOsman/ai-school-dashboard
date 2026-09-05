from __future__ import annotations

import uuid
from datetime import datetime
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

    model_config = {"from_attributes": True}


class StaffDepartmentGroup(BaseModel):
    """A department with its members grouped underneath, plus rollup
    totals - used by the Staff page to render sectioned groups (e.g.
    "المدرّسون: 5 أفراد، إجمالي 40,000 ر.س")."""
    department_id: uuid.UUID
    department_name: str
    member_count: int
    total_salary: Decimal
    members: list[StaffResponse]
