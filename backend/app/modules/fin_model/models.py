"""Saved versions of the investor financial model.

A version is one complete set of assumptions. Drafts are edited by the
financial analyst; a published version is frozen (assumptions plus the
calibration snapshot of actual data at publish time) so investors always
see exactly the numbers that were approved.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class FinModelVersion(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "fin_model_versions"

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # draft | published | archived
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", index=True)
    assumptions: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # snapshot of calibrate() frozen when published (None while draft: live data is used)
    calibration: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    published_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
