"""
Authentication-related models: sessions (refresh tokens), MFA secrets,
recovery codes. Kept separate from the User model so auth secrets are
easy to isolate, audit, and never accidentally serialize in a User schema.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, UUIDPrimaryKeyMixin


class Session(Base, UUIDPrimaryKeyMixin):
    """
    Represents a single logged-in session, tracked via a hashed refresh token.
    Allows 'logout' (revoke one) and 'logout everywhere' (revoke all for user).
    """
    __tablename__ = "sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    refresh_token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def is_active(self) -> bool:
        from app.database.base import utcnow
        return self.revoked_at is None and self.expires_at > utcnow()


class MFACredential(Base, UUIDPrimaryKeyMixin):
    """
    TOTP secret for a user. Secret is encrypted at rest (see security module);
    this column stores the encrypted blob, never plaintext.
    """
    __tablename__ = "mfa_credentials"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    encrypted_secret: Mapped[str] = mapped_column(String(500), nullable=False)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")


class RecoveryCode(Base, UUIDPrimaryKeyMixin):
    """
    One-time MFA recovery codes. Stored as Argon2 hashes, single-use.
    """
    __tablename__ = "recovery_codes"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")
