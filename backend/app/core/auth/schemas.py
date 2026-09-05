from __future__ import annotations

import uuid

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    """
    If mfa_required is True, access_token/refresh_token are omitted and the
    client must call /auth/mfa/verify with the mfa_challenge_token.
    """
    mfa_required: bool
    mfa_challenge_token: str | None = None
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"


class MFAVerifyRequest(BaseModel):
    mfa_challenge_token: str
    code: str = Field(min_length=6, max_length=12)


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class LogoutRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class PasswordResetRequestSchema(BaseModel):
    email: EmailStr


class PasswordResetConfirmSchema(BaseModel):
    reset_token: str
    new_password: str


class MFASetupResponse(BaseModel):
    provisioning_uri: str
    secret: str  # shown once during setup, for manual entry fallback


class MFAConfirmRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class RecoveryCodesResponse(BaseModel):
    codes: list[str]


class CurrentUserResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    locale: str
    permissions: list[str]
    roles: list[str]
