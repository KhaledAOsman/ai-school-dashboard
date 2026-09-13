from __future__ import annotations

import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, Field


class LeadCreateRequest(BaseModel):
    """Creates a lead at the first pipeline stage (new) - this is the
    entry point into the pipeline, before any contact has been made.

    assigned_to lets the Admin/Sales Manager who creates the lead hand it
    straight to the customer-service rep who should work it (in this org,
    only an Admin/Sales Manager enters new leads - see CRM_LEAD_CREATE vs
    CRM_LEAD_MANAGE in the permissions registry). If omitted, the lead is
    left unassigned rather than defaulting to the creator.
    """
    full_name: str = Field(min_length=1, max_length=200)
    phone: str = Field(min_length=1, max_length=30)
    source: str | None = Field(default=None, pattern="^(instagram|tiktok|snapchat|organic)$")
    notes: str | None = None
    assigned_to: uuid.UUID | None = None


class LeadBookRequest(BaseModel):
    """Books an available TeacherSlot for this lead - moves the lead from
    group 1 (leads) into group 2 (bookings). The slot must currently be
    unbooked; booking it consumes it (marks is_booked=True) so it stops
    appearing as available."""
    teacher_slot_id: uuid.UUID


class LeadRescheduleRequest(BaseModel):
    """تأجيل: frees the lead's current slot (if any) and books a new one,
    keeping the lead in the 'booked' stage. Used at the attendance step
    when a lecture needs to move rather than be marked attended/no-show."""
    teacher_slot_id: uuid.UUID
    note: str | None = None


class LeadAdvanceRequest(BaseModel):
    """Generic advance-to-next-stage call for the simple linear steps
    (confirm via WhatsApp, confirm via call, send report, follow-up). Each
    carries an optional note for the stage-event log."""
    note: str | None = None


class LeadAttendanceRequest(BaseModel):
    attended: bool
    note: str | None = None


class LeadConvertRequest(BaseModel):
    note: str | None = None


class LeadLoseRequest(BaseModel):
    reason: str = Field(min_length=1)


class LeadNotInterestedRequest(BaseModel):
    """غير مهتم: closes a lead directly from group 1 (before any booking),
    chosen from the booking-status dropdown in the leads table. Reuses the
    same is_lost/lost_reason fields as the later-stage LOST outcome, since
    both represent "this lead will not convert" - just at different
    points in the pipeline."""
    reason: str | None = None


class LeadReassignRequest(BaseModel):
    assigned_to: uuid.UUID


class LeadUpdateRequest(BaseModel):
    """Direct edit of a lead's plain fields (name, phone, source, notes) -
    used by the inline-editable table cells, not the pipeline actions.
    All fields optional; only provided ones are changed."""
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    phone: str | None = Field(default=None, min_length=1, max_length=30)
    source: str | None = Field(default=None, pattern="^(instagram|tiktok|snapchat|organic)$")
    notes: str | None = None


class LeadCallAttemptRequest(BaseModel):
    """Logs one call attempt while the lead is being reached (before
    booking), and directly sets the lead's stage to match. outcome must be
    one of: contacted, not_answered - see CallOutcome in models.py."""
    outcome: str = Field(pattern="^(contacted|not_answered)$")
    note: str | None = None


class LeadCallAttemptResponse(BaseModel):
    id: uuid.UUID
    outcome: str
    note: str | None
    performed_by: uuid.UUID
    performed_by_name: str
    created_at: datetime

    model_config = {"from_attributes": True}


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
    follow_up_count: int
    assigned_to: uuid.UUID | None
    assigned_to_name: str | None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LeadDetailResponse(LeadResponse):
    stage_events: list[LeadStageEventResponse]
    call_attempts: list[LeadCallAttemptResponse]


# ---- Bulk import ----
class LeadImportRow(BaseModel):
    """One row from a pasted table or uploaded CSV/Excel file. Only
    full_name and phone are required, so a minimal two-column paste from
    a spreadsheet still works."""
    full_name: str = Field(min_length=1, max_length=200)
    phone: str = Field(min_length=1, max_length=30)
    source: str | None = Field(default=None, pattern="^(instagram|tiktok|snapchat|organic)$")
    notes: str | None = None


class LeadBulkImportRequest(BaseModel):
    rows: list[LeadImportRow] = Field(min_length=1, max_length=5000)
    assigned_to: uuid.UUID | None = None


class LeadBulkImportRowError(BaseModel):
    row_index: int
    full_name: str
    error: str


class LeadBulkImportResult(BaseModel):
    total_submitted: int
    created_count: int
    skipped_duplicate_count: int
    error_count: int
    errors: list[LeadBulkImportRowError]


# ---- Bulk reassignment ----
class LeadBulkAssignRequest(BaseModel):
    lead_ids: list[uuid.UUID] = Field(min_length=1, max_length=1000)
    assigned_to: uuid.UUID


# ---- Paginated, searchable, filterable listing ----
class PaginatedLeadResponse(BaseModel):
    items: list[LeadResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# ---- Upcoming lectures schedule (all booked leads, calendar-style view) ----
class ScheduledLectureResponse(BaseModel):
    """One row in the customer-service-facing schedule of upcoming booked
    lectures - a flattened, calendar-friendly view of leads that have
    reached the 'booked' stage or beyond with a lecture date still today
    or in the future."""
    lead_id: uuid.UUID
    lead_full_name: str
    lead_phone: str
    stage: str
    teacher_name: str | None
    lecture_date: date | None
    lecture_time: time | None
    zoom_link: str | None
    assigned_to_name: str | None

    model_config = {"from_attributes": True}
