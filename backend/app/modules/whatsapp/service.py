"""
WhatsApp integration service.

Talks to the standalone whatsapp-service (Node.js + whatsapp-web.js, see
whatsapp-service/server.js) over its internal HTTP API. This service owns:
  - reading live connection status / QR code from the bridge
  - CRUD on MessageTemplate
  - rendering a template's placeholders against a Lead
  - sending a rendered message and logging the attempt (success or not)
  - the automatic "lecture booked" send, called from crm.leads.service
    right after a slot is booked
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException, status

from app.core.settings.config import get_settings
from app.core.permissions.object_policy import ensure_found
from app.modules.whatsapp.models import MessageTemplate, WhatsAppMessageLog
from app.modules.whatsapp.repository import MessageTemplateRepository, WhatsAppMessageLogRepository
from app.modules.whatsapp.schemas import (
    MessageTemplateCreateRequest,
    MessageTemplateResponse,
    MessageTemplateUpdateRequest,
    WhatsAppQrResponse,
    WhatsAppStatusResponse,
)
from sqlalchemy.ext.asyncio import AsyncSession


class _SampleLead:
    """Stand-in for a real Lead when rendering a template with no actual
    lead attached (test-send from the templates page). Carries the same
    attributes render_template() reads, filled with obviously-fake sample
    values so a rendered preview is still readable."""
    full_name = "أحمد محمد (مثال)"
    phone = "201000000000"
    teacher_name = "أ. سارة"
    lecture_date = "2026-01-15"
    lecture_time = "17:00"
    zoom_link = "https://zoom.us/j/000000000"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class WhatsAppService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.templates = MessageTemplateRepository(db)
        self.logs = WhatsAppMessageLogRepository(db)
        self.base_url = get_settings().WHATSAPP_SERVICE_URL

    # ---- Connection status (proxied live from the bridge service) ----
    async def get_status(self) -> WhatsAppStatusResponse:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url}/status")
                resp.raise_for_status()
                return WhatsAppStatusResponse(**resp.json())
        except httpx.HTTPError:
            return WhatsAppStatusResponse(status="disconnected", last_error="whatsapp-service unreachable")

    async def get_qr(self) -> WhatsAppQrResponse:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url}/qr")
                if resp.status_code == 404:
                    raise HTTPException(status.HTTP_404_NOT_FOUND, "No QR code currently available")
                resp.raise_for_status()
                return WhatsAppQrResponse(**resp.json())
        except httpx.HTTPError:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "whatsapp-service unreachable")

    async def logout(self) -> None:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(f"{self.base_url}/logout")
                resp.raise_for_status()
        except httpx.HTTPError:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "whatsapp-service unreachable")

    # ---- Templates ----
    async def create_template(self, *, payload: MessageTemplateCreateRequest, user_id: uuid.UUID) -> MessageTemplateResponse:
        template = MessageTemplate(name=payload.name, body=payload.body, trigger=payload.trigger, created_by=user_id)
        self.templates.add(template)
        await self.db.commit()
        return MessageTemplateResponse.model_validate(template)

    async def update_template(self, *, template_id: uuid.UUID, payload: MessageTemplateUpdateRequest) -> MessageTemplateResponse:
        template = await self.templates.get_by_id(template_id)
        ensure_found(template, "Template")
        if payload.name is not None:
            template.name = payload.name
        if payload.body is not None:
            template.body = payload.body
        if payload.trigger is not None:
            template.trigger = payload.trigger
        if payload.is_active is not None:
            template.is_active = payload.is_active
        await self.db.commit()
        return MessageTemplateResponse.model_validate(template)

    async def list_templates(self, *, include_inactive: bool = False) -> list[MessageTemplateResponse]:
        templates = await self.templates.list_all(include_inactive=include_inactive)
        return [MessageTemplateResponse.model_validate(t) for t in templates]

    def render_template(self, body: str, *, lead) -> str:
        """
        Substitutes the supported placeholders against a Lead. Unknown
        placeholders are left as-is (str.format would raise KeyError -
        using a permissive substitution instead so a typo'd placeholder
        doesn't crash the send).
        """
        values = {
            "full_name": lead.full_name,
            "phone": lead.phone,
            "teacher_name": lead.teacher_name or "",
            "lecture_date": str(lead.lecture_date) if lead.lecture_date else "",
            "lecture_time": str(lead.lecture_time)[:5] if lead.lecture_time else "",
            "zoom_link": lead.zoom_link or "",
        }
        rendered = body
        for key, value in values.items():
            rendered = rendered.replace(f"{{{key}}}", str(value))
        return rendered

    async def _send_raw(self, *, phone: str, message: str) -> tuple[bool, str | None]:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(f"{self.base_url}/send", json={"phone": phone, "message": message})
                if resp.status_code == 200:
                    return True, None
                return False, resp.json().get("error", f"HTTP {resp.status_code}")
        except httpx.HTTPError as exc:
            return False, str(exc)

    async def send_to_lead(
        self, *, lead, template_id: uuid.UUID | None, raw_message: str | None, user_id: uuid.UUID | None
    ) -> WhatsAppMessageLog:
        """Manual send - either a chosen template or free-text raw_message."""
        body = raw_message
        resolved_template_id = None
        if template_id:
            template = await self.templates.get_by_id(template_id)
            ensure_found(template, "Template")
            body = self.render_template(template.body, lead=lead)
            resolved_template_id = template.id
        if not body:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Either template_id or raw_message is required")

        success, error = await self._send_raw(phone=lead.phone, message=body)
        log = WhatsAppMessageLog(
            lead_id=lead.id, template_id=resolved_template_id, phone=lead.phone, rendered_body=body,
            success=success, error=error, sent_by=user_id, created_at=_utcnow(),
        )
        self.logs.add(log)
        await self.db.commit()
        return log

    async def send_trigger_notification(self, *, trigger: str, lead, user_id: uuid.UUID | None) -> None:
        """
        Called automatically right after a lead pipeline action happens
        (booking, confirming, report sent, converted, lost, etc - see the
        call sites in crm.leads.service). Looks up whichever template
        staff have set as the active one for this trigger (via the
        templates page) and sends it - silently does nothing if no
        template is configured/active for this trigger, since this is a
        best-effort notification and a missing/misconfigured template
        must never block the underlying pipeline action.
        """
        template = await self.templates.get_active_for_trigger(trigger)
        if not template:
            return
        body = self.render_template(template.body, lead=lead)
        success, error = await self._send_raw(phone=lead.phone, message=body)
        log = WhatsAppMessageLog(
            lead_id=lead.id, template_id=template.id, phone=lead.phone, rendered_body=body,
            success=success, error=error, sent_by=user_id, created_at=_utcnow(),
        )
        self.logs.add(log)
        await self.db.commit()

    async def test_send(self, *, phone: str, template_id: uuid.UUID | None, raw_message: str | None, user_id: uuid.UUID | None) -> WhatsAppMessageLog:
        """Manual test send to an arbitrary phone number, not tied to any
        lead - lets staff verify the WhatsApp connection and a template's
        rendering (against sample placeholder values) before relying on
        it for a real trigger."""
        body = raw_message
        resolved_template_id = None
        if template_id:
            template = await self.templates.get_by_id(template_id)
            ensure_found(template, "Template")
            body = self.render_template(template.body, lead=_SampleLead())
            resolved_template_id = template.id
        if not body:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Either template_id or raw_message is required")

        success, error = await self._send_raw(phone=phone, message=body)
        log = WhatsAppMessageLog(
            lead_id=None, template_id=resolved_template_id, phone=phone, rendered_body=body,
            success=success, error=error, sent_by=user_id, created_at=_utcnow(),
        )
        self.logs.add(log)
        await self.db.commit()
        return log
