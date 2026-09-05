"""
Attachment metadata. The actual file bytes live in whatever storage backend
is configured (local disk or S3-compatible - see integrations/storage), never
in a public/static directory and never at a predictable URL. This table only
stores metadata + the internal storage key needed to retrieve the file
through the storage abstraction.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, UUIDPrimaryKeyMixin


class ExpenseAttachment(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "expense_attachments"

    expense_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False, index=True
    )

    original_filename: Mapped[str] = mapped_column(
        String(255), nullable=False, doc="User-supplied filename, sanitized, DISPLAY ONLY"
    )
    storage_key: Mapped[str] = mapped_column(
        String(500), nullable=False, unique=True,
        doc="Randomized internal storage key/path - never derived from user input",
    )
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)

    uploaded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
