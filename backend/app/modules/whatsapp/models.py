"""
WhatsApp integration: message templates (customizable per-purpose message
text with placeholder variables) and a message log. No settings row is
stored here for the connection itself - connection status/phone number is
always read live from whatsapp-service's /status endpoint (see
service.py), since that's the single source of truth and caching it here
would just go stale.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class TemplateTrigger(str, enum.Enum):
    """When a template is used automatically. MANUAL templates are never
    auto-sent - only usable from the "send message" action on a lead."""
    MANUAL = "manual"
    LECTURE_BOOKED = "lecture_booked"  # sent automatically right after book_slot


class MessageTemplate(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "whatsapp_templates"

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    # Placeholders like {full_name}, {teacher_name}, {lecture_date},
    # {lecture_time} are substituted at send time - see service.py
    # render_template() for the exact supported set.
    body: Mapped[str] = mapped_column(Text, nullable=False)
    trigger: Mapped[str] = mapped_column(String(30), default=TemplateTrigger.MANUAL.value, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<MessageTemplate {self.name} ({self.trigger})>"


class WhatsAppMessageLog(Base, UUIDPrimaryKeyMixin):
    """Append-only log of every message actually sent - lets staff see
    what went out to a given lead and confirm delivery attempts, and
    gives a paper trail if the connected number gets flagged/banned."""
    __tablename__ = "whatsapp_message_log"

    lead_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crm_leads.id", ondelete="SET NULL"), nullable=True, index=True
    )
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("whatsapp_templates.id", ondelete="SET NULL"), nullable=True
    )
    phone: Mapped[str] = mapped_column(String(30), nullable=False)
    rendered_body: Mapped[str] = mapped_column(Text, nullable=False)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<WhatsAppMessageLog to={self.phone} success={self.success}>"
