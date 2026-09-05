from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserCreateRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=200)
    temporary_password: str
    role_ids: list[uuid.UUID] = []
    locale: str = "ar"


class UserUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    role_ids: list[uuid.UUID] | None = None
    locale: str | None = None


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    status: str
    mfa_enabled: bool
    locale: str
    roles: list[str]
    created_at: datetime
    last_login_at: datetime | None

    model_config = {"from_attributes": True}


class RoleCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    permission_codes: list[str] = []


class RoleUpdateRequest(BaseModel):
    description: str | None = None
    permission_codes: list[str] | None = None


class RoleResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    is_system_role: bool
    permission_codes: list[str]

    model_config = {"from_attributes": True}


class PermissionResponse(BaseModel):
    id: uuid.UUID
    code: str
    description: str | None
    category: str

    model_config = {"from_attributes": True}
