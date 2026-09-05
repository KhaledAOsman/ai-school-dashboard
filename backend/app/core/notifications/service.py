from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.notifications.models import Notification


class NotificationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        *,
        user_id: uuid.UUID,
        event_type: str,
        title: str,
        body: str | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
    ) -> Notification:
        notification = Notification(
            user_id=user_id,
            event_type=event_type,
            title=title,
            body=body,
            resource_type=resource_type,
            resource_id=resource_id,
        )
        self.db.add(notification)
        await self.db.flush()
        return notification

    async def list_for_user(
        self, *, user_id: uuid.UUID, unread_only: bool = False, limit: int = 50
    ) -> list[Notification]:
        stmt = select(Notification).where(Notification.user_id == user_id)
        if unread_only:
            stmt = stmt.where(Notification.is_read.is_(False))
        stmt = stmt.order_by(Notification.created_at.desc()).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def mark_read(self, *, notification_id: uuid.UUID, user_id: uuid.UUID) -> None:
        from datetime import datetime, timezone

        result = await self.db.execute(
            select(Notification).where(
                Notification.id == notification_id, Notification.user_id == user_id
            )
        )
        notification = result.scalar_one_or_none()
        if notification is not None:
            notification.is_read = True
            notification.read_at = datetime.now(timezone.utc)
            await self.db.commit()
