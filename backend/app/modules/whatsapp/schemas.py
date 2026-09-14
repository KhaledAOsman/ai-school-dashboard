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


class MessageTemplateCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    body: str = Field(min_length=1)
    trigger: str = Field(default="manual", pattern="^(manual|lecture_booked)$")


class MessageTemplateUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    body: str | None = Field(default=None, min_length=1)
    trigger: str | None = Field(default=None, pattern="^(manual|lecture_booked)$")
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


class WhatsAppMessageLogResponse(BaseModel):
    id: uuid.UUID
    lead_id: uuid.UUID | None
    phone: str
    rendered_body: str
    success: bool
    error: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
