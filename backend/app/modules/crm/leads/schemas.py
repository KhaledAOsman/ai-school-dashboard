from __future__ import annotations

import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, Field


class LeadCreateRequest(BaseModel):
    """Creates a lead at the first pipeline stage (contacted) - this is the
    "التواصل بالهاتف" step, the entry point into the pipeline.

    assigned_to lets the Admin/Sales Manager who creates the lead hand it
    straight to the customer-service rep who should work it (the org's
    process: only an Admin enters leads, then assigns them out - see
    CRM_LEAD_CREATE vs CRM_LEAD_MANAGE in the permissions registry). If
    omitted, the lead is left unassigned rather than defaulting to the
    creator, since the creator here is typically an Admin, not a rep.
    """
    full_name: str = Field(min_length=1, max_length=200)
    phone: str = Field(min_length=1, max_length=30)
    source: str | None = None
    notes: str | None = None
    assigned_to: uuid.UUID | None = None


class LeadBookRequest(BaseModel):
    """Books an available TeacherSlot for this lead - advances stage 1 to 2
    (booked). The slot must currently be unbooked; booking it consumes it
    (marks is_booked=True) so it stops appearing as available."""
    teacher_slot_id: uuid.UUID


class LeadAdvanceRequest(BaseModel):
    """Generic advance-to-next-stage call for the simple linear steps
    (confirm via WhatsApp, confirm via call, send Zoom link, send report,
    follow-up). Each carries an optional note for the stage-event log."""
    note: str | None = None


class LeadAttendanceRequest(BaseModel):
    attended: bool
    note: str | None = None


class LeadConvertRequest(BaseModel):
    note: str | None = None


class LeadLoseRequest(BaseModel):
    reason: str = Field(min_length=1)


class LeadReassignRequest(BaseModel):
    assigned_to: uuid.UUID


class LeadStageEventResponse(BaseModel):
    id: uuid.UUID
    stage: str
    performed_by: uuid.UUID
    performed_by_name: str
    note: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class LeadResponse(BaseModel):
    id: uuid.UUID
    full_name: str
    phone: str
    source: str | None
    stage: str
    teacher_slot_id: uuid.UUID | None
    teacher_name: str | None
    lecture_date: date | None
    lecture_time: time | None
    zoom_link: str | None
    attended: bool | None
    is_converted: bool
    is_lost: bool
    lost_reason: str | None
    notes: str | None
    assigned_to: uuid.UUID | None
    assigned_to_name: str | None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LeadDetailResponse(LeadResponse):
    stage_events: list[LeadStageEventResponse]
