from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class NotificationResponse(BaseModel):
    id: uuid.UUID
    event_type: str
    title: str
    body: str | None
    resource_type: str | None
    resource_id: str | None
    is_read: bool
    created_at: datetime
    read_at: datetime | None

    model_config = {"from_attributes": True}
