from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import CRM_LEAD_CREATE, CRM_LEAD_MANAGE, CRM_LEAD_VIEW, CRM_LEAD_VIEW_ALL
from app.database.session import get_db
from app.modules.crm.leads.schemas import (
    LeadAdvanceRequest,
    LeadAttendanceRequest,
    LeadBookRequest,
    LeadConvertRequest,
    LeadCreateRequest,
    LeadDetailResponse,
    LeadLoseRequest,
    LeadReassignRequest,
    LeadResponse,
)
from app.modules.crm.leads.service import LeadService

router = APIRouter(prefix="/crm/leads", tags=["crm-leads"])


class ZoomLinkRequest(BaseModel):
    zoom_link: str
    note: str | None = None


@router.get("", response_model=list[LeadResponse])
async def list_leads(
    stage: str | None = Query(default=None),
    mine_only: bool = Query(default=False),
    user: CurrentUser = Depends(require_permission(CRM_LEAD_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """
    Salespeople without CRM_LEAD_VIEW_ALL only ever see their own assigned
    leads (mine_only is forced true for them) - a sales manager with
    CRM_LEAD_VIEW_ALL can see everyone's, optionally filtered by mine_only
    for their own queue too.
    """
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


@router.post("", response_model=LeadResponse, status_code=201)
async def create_lead(
    payload: LeadCreateRequest,
    user: CurrentUser = Depends(require_permission(CRM_LEAD_CREATE)),
    db: AsyncSession = Depends(get_db),
):
    service = LeadService(db)
    return await service.create_lead(payload=payload, user_id=user.id)


@router.post("/{lead_id}/book", response_model=LeadResponse)
async def book_slot(
    lead_id: uuid.UUID,
    payload: LeadBookRequest,
    user: CurrentUser = Depends(require_permission(CRM_LEAD_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    service = LeadService(db)
    return await service.book_slot(lead_id=lead_id, teacher_slot_id=payload.teacher_slot_id, user_id=user.id)


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
    # Reassigning ownership is a supervisory action - requires seeing all
    # leads, not just manage permission, so a rank-and-file salesperson
    # can't hand their own lead off unilaterally.
    user: CurrentUser = Depends(require_permission(CRM_LEAD_VIEW_ALL)),
    db: AsyncSession = Depends(get_db),
):
    service = LeadService(db)
    return await service.reassign(lead_id=lead_id, payload=payload, user_id=user.id)
