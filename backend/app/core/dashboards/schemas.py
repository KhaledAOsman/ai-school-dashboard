from __future__ import annotations

from pydantic import BaseModel


class WidgetResponse(BaseModel):
    key: str
    title: str
    data_endpoint: str
    category: str
