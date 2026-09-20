from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class WhatsAppStatusResponse(BaseModel):
    """Live connection status, read straight from whatsapp-service."""
    status: str  # initializing | qr_pending | connected | disconnected
    phone_number: str | None = None
    last_error: str | None = None


class WhatsAppQrResponse(BaseModel):
    qr_data_url: str


_TRIGGER_PATTERN = "^(manual|lecture_booked|confirmed_whatsapp|confirmed_call|report_sent|converted|lost|not_interested)$"


class MessageTemplateCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    body: str = Field(min_length=1)
    trigger: str = Field(default="manual", pattern=_TRIGGER_PATTERN)


class MessageTemplateUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    body: str | None = Field(default=None, min_length=1)
    trigger: str | None = Field(default=None, pattern=_TRIGGER_PATTERN)
    is_active: bool | None = None


class MessageTemplateResponse(BaseModel):
    id: uuid.UUID
    name: str
    body: str
    trigger: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class SendMessageRequest(BaseModel):
    """Manually send a template (or raw text) to a lead."""
    template_id: uuid.UUID | None = None
    raw_message: str | None = None


class TestSendRequest(BaseModel):
    """Send a template (rendered against sample placeholder values) or a
    raw message to an arbitrary phone number, not tied to any lead - used
    to test the WhatsApp connection/templates from the templates page
    before relying on them in real triggers."""
    phone: str = Field(min_length=5, max_length=30)
    template_id: uuid.UUID | None = None
    raw_message: str | None = None


class WhatsAppMessageLogResponse(BaseModel):
    id: uuid.UUID
    lead_id: uuid.UUID | None
    phone: str
    rendered_body: str
    success: bool
    error: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
