from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import CRM_LEAD_CREATE, CRM_LEAD_MANAGE, CRM_LEAD_VIEW, CRM_LEAD_VIEW_ALL
from app.database.session import get_db
from app.modules.crm.leads.models import BOOKINGS_GROUP_STAGES, INTERESTED_GROUP_STAGES, LEADS_GROUP_STAGES
from app.modules.crm.leads.schemas import (
    LeadAdvanceRequest,
    LeadAttendanceRequest,
    LeadBookRequest,
    LeadBulkAssignRequest,
    LeadBulkImportRequest,
    LeadBulkImportResult,
    LeadCallAttemptRequest,
    LeadConvertRequest,
    LeadCreateRequest,
    LeadDetailResponse,
    LeadLoseRequest,
    LeadReassignRequest,
    LeadRescheduleRequest,
    LeadResponse,
    LeadUpdateRequest,
    PaginatedLeadResponse,
    ScheduledLectureResponse,
)
from app.modules.crm.leads.service import LeadService

router = APIRouter(prefix="/crm/leads", tags=["crm-leads"])


class ZoomLinkRequest(BaseModel):
    zoom_link: str
    note: str | None = None


class BulkAssignResultResponse(BaseModel):
    updated_count: int


@router.get("/search/paginated", response_model=PaginatedLeadResponse)
async def search_leads(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    search: str | None = Query(default=None, description="Matches name or phone"),
    group: str | None = Query(
        default=None,
        description="One of: leads, bookings, interested - restricts to that UI section's stages",
    ),
    stage: str | None = Query(default=None),
    source: str | None = Query(default=None),
    assigned_to: uuid.UUID | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    sort_by: str = Query(default="created_at"),
    sort_dir: str = Query(default="desc"),
    mine_only: bool = Query(default=False),
    user: CurrentUser = Depends(require_permission(CRM_LEAD_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """
    Paginated, searchable, filterable leads listing - this is what all
    three CRM table pages (leads / bookings / interested) use, each
    passing its own `group` value so it stays fast and usable at 1000+
    rows instead of shipping the whole table to the browser at once. Reps
    without CRM_LEAD_VIEW_ALL are always scoped to their own leads
    regardless of the assigned_to/mine_only params they pass.
    """
    service = LeadService(db)
    can_view_all = CRM_LEAD_VIEW_ALL in user.permissions
    effective_assigned_to = assigned_to
    if not can_view_all:
        effective_assigned_to = user.id
    elif mine_only:
        effective_assigned_to = user.id

    stages = {"leads": LEADS_GROUP_STAGES, "bookings": BOOKINGS_GROUP_STAGES, "interested": INTERESTED_GROUP_STAGES}.get(group)

    return await service.list_paginated(
        page=page, page_size=page_size, search=search, stage=stage, stages=stages, source=source,
        assigned_to=effective_assigned_to, date_from=date_from, date_to=date_to,
        sort_by=sort_by, sort_dir=sort_dir,
    )


@router.get("/meta/sources", response_model=list[str])
async def list_sources(
    user: CurrentUser = Depends(require_permission(CRM_LEAD_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Distinct source values currently in use - powers the source filter
    dropdown with real data instead of a hardcoded list."""
    service = LeadService(db)
    return await service.list_sources()


@router.get("/meta/schedule", response_model=list[ScheduledLectureResponse])
async def get_schedule(
    mine_only: bool = Query(default=False),
    user: CurrentUser = Depends(require_permission(CRM_LEAD_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Every booked-or-later lead with a lecture date, in calendar order -
    the customer-service-facing schedule of upcoming (and recent) trial
    lectures. Reps without CRM_LEAD_VIEW_ALL always see only their own."""
    service = LeadService(db)
    can_view_all = CRM_LEAD_VIEW_ALL in user.permissions
    assigned_to = user.id if (mine_only or not can_view_all) else None
    return await service.list_scheduled(assigned_to=assigned_to)


@router.get("", response_model=list[LeadResponse])
async def list_leads(
    stage: str | None = Query(default=None),
    mine_only: bool = Query(default=False),
    user: CurrentUser = Depends(require_permission(CRM_LEAD_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Simple unpaginated listing (kept for small/legacy callers) - the
    main table pages use /search/paginated instead."""
    service = LeadService(db)
    can_view_all = CRM_LEAD_VIEW_ALL in user.permissions
    assigned_to = user.id if (mine_only or not can_view_all) else None
    return await service.list_all(stage=stage, assigned_to=assigned_to)


@router.get("/{lead_id}", response_model=LeadDetailResponse)
async def get_lead(
    lead_id: uuid.UUID,
    user: CurrentUser = Depends(require_permission(CRM_LEAD_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    service = LeadService(db)
    return await service.get(lead_id=lead_id)


@router.patch("/{lead_id}", response_model=LeadResponse)
async def update_lead(
    lead_id: uuid.UUID,
    payload: LeadUpdateRequest,
    user: CurrentUser = Depends(require_permission(CRM_LEAD_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Direct edit of plain fields (name, phone, source, notes) - used by
    the inline-editable table cells (e.g. the source/الإحالة column)."""
    service = LeadService(db)
    return await service.update_lead(lead_id=lead_id, payload=payload, user_id=user.id)


@router.post("", response_model=LeadResponse, status_code=201)
async def create_lead(
    payload: LeadCreateRequest,
    user: CurrentUser = Depends(require_permission(CRM_LEAD_CREATE)),
    db: AsyncSession = Depends(get_db),
):
    service = LeadService(db)
    return await service.create_lead(payload=payload, user_id=user.id)


@router.post("/bulk-import", response_model=LeadBulkImportResult)
async def bulk_import_leads(
    payload: LeadBulkImportRequest,
    user: CurrentUser = Depends(require_permission(CRM_LEAD_CREATE)),
    db: AsyncSession = Depends(get_db),
):
    """Bulk-creates leads from a pasted table or parsed Excel/CSV file (the
    frontend parses the file and sends rows as JSON here). Same permission
    as single-lead creation."""
    service = LeadService(db)
    return await service.bulk_import(payload=payload, user_id=user.id)


@router.post("/bulk-assign", response_model=BulkAssignResultResponse)
async def bulk_assign_leads(
    payload: LeadBulkAssignRequest,
    user: CurrentUser = Depends(require_permission(CRM_LEAD_VIEW_ALL)),
    db: AsyncSession = Depends(get_db),
):
    service = LeadService(db)
    updated_count = await service.bulk_assign(payload=payload, user_id=user.id)
    return BulkAssignResultResponse(updated_count=updated_count)


@router.post("/{lead_id}/call-attempt", response_model=LeadResponse)
async def log_call_attempt(
    lead_id: uuid.UUID,
    payload: LeadCallAttemptRequest,
    user: CurrentUser = Depends(require_permission(CRM_LEAD_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Logs one call attempt (تم الاتصال / لم يتم الرد / لم يتم الاتصال) while
    a lead is being reached, before booking. Repeatable."""
    service = LeadService(db)
    return await service.log_call_attempt(lead_id=lead_id, payload=payload, user_id=user.id)


@router.post("/{lead_id}/book", response_model=LeadResponse)
async def book_slot(
    lead_id: uuid.UUID,
    payload: LeadBookRequest,
    user: CurrentUser = Depends(require_permission(CRM_LEAD_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    service = LeadService(db)
    return await service.book_slot(lead_id=lead_id, teacher_slot_id=payload.teacher_slot_id, user_id=user.id)


@router.post("/{lead_id}/reschedule", response_model=LeadResponse)
async def reschedule_lead(
    lead_id: uuid.UUID,
    payload: LeadRescheduleRequest,
    user: CurrentUser = Depends(require_permission(CRM_LEAD_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """تأجيل: frees the lead's current slot and books a new one, returning
    the lead to the 'booked' stage (used at the attendance step instead of
    marking attended/did-not-attend)."""
    service = LeadService(db)
    return await service.reschedule(lead_id=lead_id, teacher_slot_id=payload.teacher_slot_id, user_id=user.id, note=payload.note)


@router.post("/{lead_id}/confirm-whatsapp", response_model=LeadResponse)
async def confirm_whatsapp(
    lead_id: uuid.UUID,
    payload: LeadAdvanceRequest,
    user: CurrentUser = Depends(require_permission(CRM_LEAD_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    service = LeadService(db)
    return await service.confirm_whatsapp(lead_id=lead_id, user_id=user.id, note=payload.note)


@router.post("/{lead_id}/confirm-call", response_model=LeadResponse)
async def confirm_call(
    lead_id: uuid.UUID,
    payload: LeadAdvanceRequest,
    user: CurrentUser = Depends(require_permission(CRM_LEAD_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    service = LeadService(db)
    return await service.confirm_call(lead_id=lead_id, user_id=user.id, note=payload.note)


@router.post("/{lead_id}/send-zoom", response_model=LeadResponse)
async def send_zoom(
    lead_id: uuid.UUID,
    payload: ZoomLinkRequest,
    user: CurrentUser = Depends(require_permission(CRM_LEAD_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    service = LeadService(db)
    return await service.send_zoom(lead_id=lead_id, zoom_link=payload.zoom_link, user_id=user.id, note=payload.note)


@router.post("/{lead_id}/attendance", response_model=LeadResponse)
async def record_attendance(
    lead_id: uuid.UUID,
    payload: LeadAttendanceRequest,
    user: CurrentUser = Depends(require_permission(CRM_LEAD_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    service = LeadService(db)
    return await service.record_attendance(lead_id=lead_id, payload=payload, user_id=user.id)


@router.post("/{lead_id}/send-report", response_model=LeadResponse)
async def send_report(
    lead_id: uuid.UUID,
    payload: LeadAdvanceRequest,
    user: CurrentUser = Depends(require_permission(CRM_LEAD_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    service = LeadService(db)
    return await service.send_report(lead_id=lead_id, user_id=user.id, note=payload.note)


@router.post("/{lead_id}/follow-up", response_model=LeadResponse)
async def log_follow_up(
    lead_id: uuid.UUID,
    payload: LeadAdvanceRequest,
    user: CurrentUser = Depends(require_permission(CRM_LEAD_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    service = LeadService(db)
    return await service.log_follow_up(lead_id=lead_id, user_id=user.id, note=payload.note)


@router.post("/{lead_id}/convert", response_model=LeadResponse)
async def convert_lead(
    lead_id: uuid.UUID,
    payload: LeadConvertRequest,
    user: CurrentUser = Depends(require_permission(CRM_LEAD_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    service = LeadService(db)
    return await service.convert(lead_id=lead_id, user_id=user.id, note=payload.note)


@router.post("/{lead_id}/lose", response_model=LeadResponse)
async def lose_lead(
    lead_id: uuid.UUID,
    payload: LeadLoseRequest,
    user: CurrentUser = Depends(require_permission(CRM_LEAD_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    service = LeadService(db)
    return await service.mark_lost(lead_id=lead_id, payload=payload, user_id=user.id)


@router.post("/{lead_id}/reassign", response_model=LeadResponse)
async def reassign_lead(
    lead_id: uuid.UUID,
    payload: LeadReassignRequest,
    user: CurrentUser = Depends(require_permission(CRM_LEAD_VIEW_ALL)),
    db: AsyncSession = Depends(get_db),
):
    service = LeadService(db)
    return await service.reassign(lead_id=lead_id, payload=payload, user_id=user.id)
