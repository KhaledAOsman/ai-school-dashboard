from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import CRM_LEAD_MANAGE
from app.database.session import get_db
from app.modules.crm.leads.repository import LeadRepository
from app.modules.crm.leads.service import LeadService
from app.modules.whatsapp.schemas import (
    MessageTemplateCreateRequest,
    MessageTemplateResponse,
    MessageTemplateUpdateRequest,
    SendMessageRequest,
    WhatsAppMessageLogResponse,
    WhatsAppQrResponse,
    WhatsAppStatusResponse,
)
from app.modules.whatsapp.service import WhatsAppService

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


@router.get("/status", response_model=WhatsAppStatusResponse)
async def get_status(
    user: CurrentUser = Depends(require_permission(CRM_LEAD_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    service = WhatsAppService(db)
    return await service.get_status()


@router.get("/qr", response_model=WhatsAppQrResponse)
async def get_qr(
    user: CurrentUser = Depends(require_permission(CRM_LEAD_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    service = WhatsAppService(db)
    return await service.get_qr()


@router.post("/logout", status_code=204)
async def logout(
    user: CurrentUser = Depends(require_permission(CRM_LEAD_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    service = WhatsAppService(db)
    await service.logout()


@router.get("/templates", response_model=list[MessageTemplateResponse])
async def list_templates(
    include_inactive: bool = False,
    user: CurrentUser = Depends(require_permission(CRM_LEAD_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    service = WhatsAppService(db)
    return await service.list_templates(include_inactive=include_inactive)


@router.post("/templates", response_model=MessageTemplateResponse, status_code=201)
async def create_template(
    payload: MessageTemplateCreateRequest,
    user: CurrentUser = Depends(require_permission(CRM_LEAD_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    service = WhatsAppService(db)
    return await service.create_template(payload=payload, user_id=user.id)


@router.patch("/templates/{template_id}", response_model=MessageTemplateResponse)
async def update_template(
    template_id: uuid.UUID,
    payload: MessageTemplateUpdateRequest,
    user: CurrentUser = Depends(require_permission(CRM_LEAD_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    service = WhatsAppService(db)
    return await service.update_template(template_id=template_id, payload=payload)


@router.post("/leads/{lead_id}/send", response_model=WhatsAppMessageLogResponse)
async def send_to_lead(
    lead_id: uuid.UUID,
    payload: SendMessageRequest,
    user: CurrentUser = Depends(require_permission(CRM_LEAD_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Manually send a template (or free-text message) to a specific
    lead's phone number - used from the lead detail page."""
    lead_repo = LeadRepository(db)
    lead = await lead_repo.get_by_id(lead_id)
    if lead is None:
        from fastapi import HTTPException, status as http_status
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, "Lead not found")

    service = WhatsAppService(db)
    return await service.send_to_lead(
        lead=lead, template_id=payload.template_id, raw_message=payload.raw_message, user_id=user.id
    )
