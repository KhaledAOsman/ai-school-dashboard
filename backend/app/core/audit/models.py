"""
Audit log: append-only record of business actions (as distinct from
security events - see core/security/log_models.py).

Ordinary application code must only ever INSERT into this table via
AuditService.record(...). There is intentionally no update/delete method
exposed anywhere in the service layer. Database-level protections
(a REVOKE UPDATE/DELETE grant for the application's DB role, applied
in the initial migration) provide a second layer of enforcement.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, UUIDPrimaryKeyMixin


class AuditLog(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "audit_logs"

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()", nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(
        String(150), nullable=False, index=True,
        doc="e.g. 'expense.created', 'expense.approved', 'role.permission_changed'",
    )
    resource_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    resource_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    request_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)

    previous_value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    new_value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    log_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
