"""
Security event log: authentication and security-relevant events, kept
conceptually and physically separate from the business audit log
(core/audit/models.py). This lets security review happen independently
of business/finance auditing and keeps each table's access controls
scoped to what actually needs them.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, UUIDPrimaryKeyMixin


class SecurityEventType(str, Enum):
    LOGIN_SUCCESS = "login_success"
    LOGIN_FAILED = "login_failed"
    MFA_FAILED = "mfa_failed"
    MFA_ENABLED = "mfa_enabled"
    MFA_DISABLED = "mfa_disabled"
    RECOVERY_CODE_USED = "recovery_code_used"
    PASSWORD_RESET_REQUESTED = "password_reset_requested"
    PASSWORD_CHANGED = "password_changed"
    SESSION_CREATED = "session_created"
    SESSION_REVOKED = "session_revoked"
    LOGOUT = "logout"
    LOGOUT_ALL = "logout_all"
    ACCOUNT_LOCKED = "account_locked"
    ACCOUNT_UNLOCKED = "account_unlocked"
    RATE_LIMITED = "rate_limited"
    AUTHORIZATION_FAILED = "authorization_failed"
    PERMISSION_ESCALATION_ATTEMPT = "permission_escalation_attempt"


class SecurityLog(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "security_logs"

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()", nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    email_attempted: Mapped[str | None] = mapped_column(
        String(320), nullable=True,
        doc="Captured for failed-login analysis even if no matching user exists",
    )
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    log_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
