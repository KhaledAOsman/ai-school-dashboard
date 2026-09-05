"""
Reusable notification model + service.

Notifications are permission-aware: a notification is created for a specific
user_id, so a user only ever sees notifications addressed to them (enforced
in the route: the query always filters by the authenticated user's id, never
by a user_id supplied in the request).

Delivery channels (email/SMS/push) are intentionally NOT implemented yet -
this module only provides in-app notification storage/retrieval. Wiring an
email channel later means adding a NotificationChannel implementation and
calling it from NotificationService.create(), without changing callers.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, UUIDPrimaryKeyMixin


class Notification(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "notifications"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(
        String(100), nullable=False,
        doc="e.g. 'expense.submitted', 'expense.approved', 'security.alert'",
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    resource_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
