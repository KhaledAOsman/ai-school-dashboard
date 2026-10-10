from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CategoryCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    name_ar: str | None = Field(default=None, max_length=150)
    code: str | None = Field(default=None, max_length=20)
    parent_id: uuid.UUID | None = None
    display_order: int = 0


class CategoryUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    name_ar: str | None = Field(default=None, max_length=150)
    code: str | None = Field(default=None, max_length=20)
    display_order: int | None = None


class CategoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    name_ar: str | None
    code: str | None = None
    parent_id: uuid.UUID | None
    display_order: int
    is_archived: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CategoryTreeNode(CategoryResponse):
    children: list["CategoryTreeNode"] = []
