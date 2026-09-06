from __future__ import annotations

import uuid
from datetime import date, time, datetime

from pydantic import BaseModel, Field


class CRMTeacherCreateRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)


class CRMTeacherResponse(BaseModel):
    id: uuid.UUID
    full_name: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TeacherSlotCreateRequest(BaseModel):
    slot_date: date
    slot_time: time


class TeacherSlotResponse(BaseModel):
    id: uuid.UUID
    teacher_id: uuid.UUID
    slot_date: date
    slot_time: time
    is_booked: bool
    booked_lead_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CRMTeacherWithSlotsResponse(CRMTeacherResponse):
    """Teacher plus their upcoming available (not-yet-booked) slots - used
    by the lead booking step to show only what's actually bookable."""
    available_slots: list[TeacherSlotResponse]
