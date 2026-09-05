from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    timestamp: datetime
    user_id: uuid.UUID | None
    action: str
    resource_type: str
    resource_id: str | None
    ip_address: str | None
    previous_value: dict | None
    new_value: dict | None
    log_metadata: dict | None
    notes: str | None

    model_config = {"from_attributes": True}


class SecurityLogResponse(BaseModel):
    id: uuid.UUID
    timestamp: datetime
    event_type: str
    user_id: uuid.UUID | None
    email_attempted: str | None
    ip_address: str | None
    log_metadata: dict | None

    model_config = {"from_attributes": True}
