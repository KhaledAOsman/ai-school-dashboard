from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class AttachmentResponse(BaseModel):
    id: uuid.UUID
    expense_id: uuid.UUID
    original_filename: str
    content_type: str
    size_bytes: int
    uploaded_by: uuid.UUID
    uploaded_at: datetime

    model_config = {"from_attributes": True}
