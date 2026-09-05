"""
SecurityLogService: the sole entry point for writing security event records.
Mirrors AuditService but for authentication/security events. Kept as a
separate service (not just a separate table) so callers can't confuse
which log a given event belongs in.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.log_models import SecurityEventType, SecurityLog


class SecurityLogService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def record(
        self,
        *,
        event_type: SecurityEventType,
        user_id: uuid.UUID | None = None,
        email_attempted: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> SecurityLog:
        entry = SecurityLog(
            event_type=event_type.value,
            user_id=user_id,
            email_attempted=email_attempted,
            ip_address=ip_address,
            user_agent=user_agent,
            log_metadata=metadata,
        )
        self.db.add(entry)
        await self.db.flush()
        return entry
