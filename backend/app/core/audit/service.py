"""
AuditService: the sole entry point for writing business audit records.

No other module should construct an AuditLog row directly - route every
audited action through record() so the shape stays consistent and so this
file is the one place a reviewer needs to check for audit coverage.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit.models import AuditLog


class AuditService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def record(
        self,
        *,
        user_id: uuid.UUID | None,
        action: str,
        resource_type: str,
        resource_id: str | None = None,
        request_id: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        previous_value: dict[str, Any] | None = None,
        new_value: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
        notes: str | None = None,
    ) -> AuditLog:
        entry = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            request_id=request_id,
            ip_address=ip_address,
            user_agent=user_agent,
            previous_value=previous_value,
            new_value=new_value,
            log_metadata=metadata,
            notes=notes,
        )
        self.db.add(entry)
        await self.db.flush()
        return entry
