"""
SQLAlchemy declarative base and shared mixins.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""
    pass


def new_uuid() -> uuid.UUID:
    return uuid.uuid4()


class UUIDPrimaryKeyMixin:
    """
    UUID primary keys instead of sequential integers.

    Rationale: sequential IDs exposed through URLs (e.g. /expenses/123) leak
    business volume information and make object enumeration trivial. UUIDs
    close that off. Internal FKs can still be UUID for consistency.
    """
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=new_uuid
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
