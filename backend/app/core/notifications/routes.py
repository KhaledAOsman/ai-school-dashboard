from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser, get_current_user
from app.core.notifications.schemas import NotificationResponse
from app.core.notifications.service import NotificationService
from app.database.session import get_db

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationResponse])
async def list_notifications(
    unread_only: bool = False,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Always scoped to the AUTHENTICATED user - there is no way to pass a
    different user_id, so a user can never read another user's notifications.
    """
    service = NotificationService(db)
    return await service.list_for_user(user_id=user.id, unread_only=unread_only)


@router.post("/{notification_id}/read", status_code=204)
async def mark_notification_read(
    notification_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = NotificationService(db)
    await service.mark_read(notification_id=notification_id, user_id=user.id)
