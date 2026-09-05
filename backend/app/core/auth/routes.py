from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser, get_current_user
from app.core.auth.schemas import (
    ChangePasswordRequest,
    CurrentUserResponse,
    LoginRequest,
    LoginResponse,
    LogoutRequest,
    MFAConfirmRequest,
    MFASetupResponse,
    MFAVerifyRequest,
    PasswordResetConfirmSchema,
    PasswordResetRequestSchema,
    RecoveryCodesResponse,
    RefreshRequest,
    TokenResponse,
)
from app.core.auth.service import AuthService
from app.core.settings.config import get_settings
from app.core.users.models import User
from app.core.users.repository import UserRepository
from app.database.session import get_db

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


def _client_info(request: Request) -> tuple[str | None, str | None]:
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    return ip, ua


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    ip, ua = _client_info(request)
    service = AuthService(db)
    result = await service.login(
        email=payload.email, password=payload.password, ip_address=ip, user_agent=ua
    )
    return LoginResponse(**result)


@router.post("/mfa/verify", response_model=TokenResponse)
async def verify_mfa(payload: MFAVerifyRequest, request: Request, db: AsyncSession = Depends(get_db)):
    ip, ua = _client_info(request)
    service = AuthService(db)
    result = await service.verify_mfa(
        mfa_challenge_token=payload.mfa_challenge_token,
        code=payload.code,
        ip_address=ip,
        user_agent=ua,
    )
    return TokenResponse(**result)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest, request: Request, db: AsyncSession = Depends(get_db)):
    ip, ua = _client_info(request)
    service = AuthService(db)
    result = await service.refresh(refresh_token=payload.refresh_token, ip_address=ip, user_agent=ua)
    return TokenResponse(**result)


@router.post("/logout", status_code=204)
async def logout(
    payload: LogoutRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = AuthService(db)
    await service.logout(refresh_token=payload.refresh_token, user_id=user.id)


@router.post("/logout-all", status_code=204)
async def logout_all(user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    await service.logout_all(user_id=user.id)


@router.post("/password/change", status_code=204)
async def change_password(
    payload: ChangePasswordRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = UserRepository(db)
    user_row = await repo.get_by_id(user.id)
    service = AuthService(db)
    await service.change_password(
        user=user_row, current_password=payload.current_password, new_password=payload.new_password
    )
    await db.commit()


@router.post("/password/reset-request", status_code=204)
async def request_password_reset(payload: PasswordResetRequestSchema, db: AsyncSession = Depends(get_db)):
    """
    Always returns 204 regardless of whether the email exists - this is
    intentional (spec: do not expose whether an email exists). The reset
    token itself is delivered out-of-band (email), not in this response.
    """
    service = AuthService(db)
    reset_token = await service.request_password_reset(email=payload.email)
    if reset_token:
        # TODO: wire to notification/email service. Never log/return the
        # token itself - see core/notifications for the eventual integration
        # point once SMTP settings are configured.
        pass


@router.post("/password/reset-confirm", status_code=204)
async def confirm_password_reset(payload: PasswordResetConfirmSchema, db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    await service.confirm_password_reset(
        reset_token=payload.reset_token, new_password=payload.new_password
    )
    await db.commit()


@router.post("/mfa/setup", response_model=MFASetupResponse)
async def start_mfa_setup(user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    repo = UserRepository(db)
    user_row = await repo.get_by_id(user.id)
    service = AuthService(db)
    uri, secret = await service.start_mfa_setup(user=user_row)
    return MFASetupResponse(provisioning_uri=uri, secret=secret)


@router.post("/mfa/confirm", response_model=RecoveryCodesResponse)
async def confirm_mfa_setup(
    payload: MFAConfirmRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = UserRepository(db)
    user_row = await repo.get_by_id(user.id)
    service = AuthService(db)
    codes = await service.confirm_mfa_setup(user=user_row, code=payload.code)
    return RecoveryCodesResponse(codes=codes)


@router.post("/mfa/disable", status_code=204)
async def disable_mfa(user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    repo = UserRepository(db)
    user_row = await repo.get_by_id(user.id)
    service = AuthService(db)
    await service.disable_mfa(user=user_row)


@router.get("/me", response_model=CurrentUserResponse)
async def get_me(user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    repo = UserRepository(db)
    user_row = await repo.get_by_id(user.id)
    return CurrentUserResponse(
        id=user_row.id,
        email=user_row.email,
        full_name=user_row.full_name,
        locale=user_row.locale,
        permissions=sorted(user.permissions),
        roles=[r.name for r in user_row.roles],
    )
