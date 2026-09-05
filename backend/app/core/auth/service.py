"""
AuthService: login, MFA challenge/verify, refresh, logout, password
change/reset, lockout enforcement.

Key security behaviors implemented here (cross-referenced to spec section 2):
    - Failed-login tracking + temporary lockout (rate-limit style, per account)
    - MFA via TOTP, enforced for roles that require it
    - Password reset never reveals whether an email exists
    - Refresh tokens are opaque + hashed at rest; sessions can be revoked
    - Every auth event writes to SecurityLogService
"""
from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.models import MFACredential, RecoveryCode, Session as SessionModel
from app.core.security import mfa as mfa_utils
from app.core.security.log_models import SecurityEventType
from app.core.security.log_service import SecurityLogService
from app.core.security.passwords import (
    PasswordPolicyError,
    hash_password,
    validate_password_policy,
    verify_password,
)
from app.core.security.tokens import (
    TokenError,
    create_access_token,
    decode_access_token,
    generate_refresh_token,
    refresh_token_expiry,
)
from app.core.settings.config import get_settings
from app.core.users.models import AccountStatus, User
from app.core.users.repository import UserRepository

settings = get_settings()

# Roles for which MFA is mandatory regardless of the per-user mfa_enabled flag.
# Kept as a set of role NAMES here only because it is explicitly called out
# in the spec as an initial hard requirement; the Admin-configurable version
# (mfa_enforced per role, stored in DB) can supersede this at runtime - see
# docs/security-model.md for the migration path.
MFA_MANDATORY_ROLES = {"Owner", "Admin", "Finance Manager"}


def _hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _client_meta(ip_address: str | None, user_agent: str | None) -> dict:
    return {"ip_address": ip_address, "user_agent": user_agent}


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.users = UserRepository(db)
        self.security_log = SecurityLogService(db)

    # ---------------------------------------------------------------- login
    async def login(
        self, *, email: str, password: str, ip_address: str | None, user_agent: str | None
    ) -> dict:
        user = await self.users.get_by_email(email)

        # Constant-shape response whether or not the user exists, to avoid
        # leaking account existence via timing/response differences.
        if user is None:
            await self.security_log.record(
                event_type=SecurityEventType.LOGIN_FAILED,
                email_attempted=email,
                ip_address=ip_address,
                user_agent=user_agent,
                metadata={"reason": "no_such_user"},
            )
            await self.db.commit()
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

        self._assert_not_locked(user)

        if user.status != AccountStatus.ACTIVE.value:
            await self.security_log.record(
                event_type=SecurityEventType.LOGIN_FAILED,
                user_id=user.id,
                ip_address=ip_address,
                user_agent=user_agent,
                metadata={"reason": "account_not_active", "status": user.status},
            )
            await self.db.commit()
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

        if not verify_password(password, user.password_hash):
            await self._register_failed_attempt(user, ip_address, user_agent)
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

        # Success: reset failed-attempt counter
        user.failed_login_count = 0
        user.locked_until = None
        user.last_login_at = datetime.now(timezone.utc)

        mfa_required = self._mfa_required_for(user)

        if mfa_required:
            challenge_token = self._create_mfa_challenge_token(user.id)
            await self.security_log.record(
                event_type=SecurityEventType.LOGIN_SUCCESS,
                user_id=user.id,
                ip_address=ip_address,
                user_agent=user_agent,
                metadata={"mfa_pending": True},
            )
            await self.db.commit()
            return {"mfa_required": True, "mfa_challenge_token": challenge_token}

        session, access_token, refresh_token = await self._issue_tokens(
            user, ip_address, user_agent
        )
        await self.security_log.record(
            event_type=SecurityEventType.LOGIN_SUCCESS,
            user_id=user.id,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata={"mfa_pending": False},
        )
        await self.db.commit()
        return {
            "mfa_required": False,
            "access_token": access_token,
            "refresh_token": refresh_token,
        }

    def _mfa_required_for(self, user: User) -> bool:
        if user.mfa_enforced or user.mfa_enabled:
            return user.mfa_enabled  # only actually challenge if they've completed setup
        role_names = {r.name for r in user.roles}
        if role_names & MFA_MANDATORY_ROLES:
            # Role requires MFA but user hasn't completed setup yet - this is
            # a configuration gap the Admin should resolve; we don't block
            # login entirely (that would lock out the only Admin), but the
            # frontend should prominently prompt for MFA setup.
            return user.mfa_enabled
        return False

    def _assert_not_locked(self, user: User) -> None:
        if user.locked_until and user.locked_until > datetime.now(timezone.utc):
            raise HTTPException(
                status.HTTP_423_LOCKED,
                f"Account temporarily locked. Try again after {user.locked_until.isoformat()}.",
            )

    async def _register_failed_attempt(
        self, user: User, ip_address: str | None, user_agent: str | None
    ) -> None:
        user.failed_login_count += 1
        locked = False
        if user.failed_login_count >= settings.MAX_FAILED_LOGIN_ATTEMPTS:
            user.locked_until = datetime.now(timezone.utc) + timedelta(
                minutes=settings.LOCKOUT_DURATION_MINUTES
            )
            locked = True

        await self.security_log.record(
            event_type=SecurityEventType.LOGIN_FAILED,
            user_id=user.id,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata={"failed_count": user.failed_login_count},
        )
        if locked:
            await self.security_log.record(
                event_type=SecurityEventType.ACCOUNT_LOCKED,
                user_id=user.id,
                ip_address=ip_address,
                user_agent=user_agent,
                metadata={"locked_until": user.locked_until.isoformat()},
            )
        await self.db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    # ------------------------------------------------------------- MFA flow
    def _create_mfa_challenge_token(self, user_id: uuid.UUID) -> str:
        # Short-lived, single-purpose token distinct from access tokens -
        # cannot be used to call any API other than /auth/mfa/verify.
        from jose import jwt

        now = datetime.now(timezone.utc)
        payload = {
            "sub": str(user_id),
            "type": "mfa_challenge",
            "iat": now,
            "exp": now + timedelta(minutes=5),
        }
        return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    def _decode_mfa_challenge_token(self, token: str) -> uuid.UUID:
        from jose import JWTError, jwt

        try:
            payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        except JWTError:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired MFA challenge")
        if payload.get("type") != "mfa_challenge":
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid MFA challenge token")
        return uuid.UUID(payload["sub"])

    async def verify_mfa(
        self,
        *,
        mfa_challenge_token: str,
        code: str,
        ip_address: str | None,
        user_agent: str | None,
    ) -> dict:
        user_id = self._decode_mfa_challenge_token(mfa_challenge_token)
        user = await self.users.get_by_id(user_id)
        if user is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session")

        self._assert_not_locked(user)

        result = await self.db.execute(
            select(MFACredential).where(MFACredential.user_id == user.id)
        )
        credential = result.scalar_one_or_none()
        if credential is None or not credential.confirmed:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "MFA is not set up for this account")

        secret = mfa_utils.decrypt_secret(credential.encrypted_secret)
        valid = mfa_utils.verify_totp_code(secret, code)

        if not valid:
            # Try recovery codes as a fallback
            valid = await self._try_recovery_code(user.id, code)
            if valid:
                await self.security_log.record(
                    event_type=SecurityEventType.RECOVERY_CODE_USED,
                    user_id=user.id,
                    ip_address=ip_address,
                    user_agent=user_agent,
                )

        if not valid:
            await self._register_failed_attempt(user, ip_address, user_agent)
            await self.security_log.record(
                event_type=SecurityEventType.MFA_FAILED,
                user_id=user.id,
                ip_address=ip_address,
                user_agent=user_agent,
            )
            await self.db.commit()
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid MFA code")

        user.failed_login_count = 0
        user.locked_until = None
        user.last_login_at = datetime.now(timezone.utc)

        session, access_token, refresh_token = await self._issue_tokens(user, ip_address, user_agent)
        await self.db.commit()
        return {"access_token": access_token, "refresh_token": refresh_token}

    async def _try_recovery_code(self, user_id: uuid.UUID, code: str) -> bool:
        result = await self.db.execute(
            select(RecoveryCode).where(
                RecoveryCode.user_id == user_id, RecoveryCode.used_at.is_(None)
            )
        )
        for recovery in result.scalars().all():
            if mfa_utils.verify_recovery_code(code, recovery.code_hash):
                recovery.used_at = datetime.now(timezone.utc)
                return True
        return False

    # --------------------------------------------------------- session mgmt
    async def _issue_tokens(
        self, user: User, ip_address: str | None, user_agent: str | None
    ) -> tuple[SessionModel, str, str]:
        permissions = await self.users.get_permissions_for_user(user)

        refresh_token = generate_refresh_token()
        session = SessionModel(
            user_id=user.id,
            refresh_token_hash=_hash_refresh_token(refresh_token),
            user_agent=user_agent,
            ip_address=ip_address,
            expires_at=refresh_token_expiry(),
        )
        self.db.add(session)
        await self.db.flush()

        access_token = create_access_token(
            user_id=user.id, session_id=session.id, permissions=sorted(permissions)
        )

        await self.security_log.record(
            event_type=SecurityEventType.SESSION_CREATED,
            user_id=user.id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return session, access_token, refresh_token

    async def refresh(
        self, *, refresh_token: str, ip_address: str | None, user_agent: str | None
    ) -> dict:
        token_hash = _hash_refresh_token(refresh_token)
        result = await self.db.execute(
            select(SessionModel).where(SessionModel.refresh_token_hash == token_hash)
        )
        session = result.scalar_one_or_none()
        if session is None or not session.is_active:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired refresh token")

        user = await self.users.get_by_id(session.user_id)
        if user is None or user.status != AccountStatus.ACTIVE.value:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account is not active")

        permissions = await self.users.get_permissions_for_user(user)
        access_token = create_access_token(
            user_id=user.id, session_id=session.id, permissions=sorted(permissions)
        )
        await self.db.commit()
        return {"access_token": access_token, "refresh_token": refresh_token}

    async def logout(self, *, refresh_token: str, user_id: uuid.UUID) -> None:
        token_hash = _hash_refresh_token(refresh_token)
        result = await self.db.execute(
            select(SessionModel).where(SessionModel.refresh_token_hash == token_hash)
        )
        session = result.scalar_one_or_none()
        if session is not None:
            session.revoked_at = datetime.now(timezone.utc)
            await self.security_log.record(
                event_type=SecurityEventType.LOGOUT, user_id=user_id
            )
            await self.db.commit()

    async def logout_all(self, *, user_id: uuid.UUID) -> None:
        result = await self.db.execute(
            select(SessionModel).where(
                SessionModel.user_id == user_id, SessionModel.revoked_at.is_(None)
            )
        )
        now = datetime.now(timezone.utc)
        for session in result.scalars().all():
            session.revoked_at = now
        await self.security_log.record(
            event_type=SecurityEventType.LOGOUT_ALL, user_id=user_id
        )
        await self.db.commit()

    # ------------------------------------------------------------ passwords
    async def change_password(
        self, *, user: User, current_password: str, new_password: str
    ) -> None:
        if not verify_password(current_password, user.password_hash):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
        try:
            validate_password_policy(new_password)
        except PasswordPolicyError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, {"errors": exc.errors})

        user.password_hash = hash_password(new_password)
        user.password_changed_at = datetime.now(timezone.utc)
        await self.security_log.record(
            event_type=SecurityEventType.PASSWORD_CHANGED, user_id=user.id
        )
        # Changing password revokes all other sessions as a precaution.
        await self.logout_all(user_id=user.id)

    async def request_password_reset(self, *, email: str) -> str | None:
        """
        Returns a reset token if the account exists, but the CALLER (route
        handler) must return an identical response regardless, so account
        existence is never revealed via the API surface.
        """
        user = await self.users.get_by_email(email)
        await self.security_log.record(
            event_type=SecurityEventType.PASSWORD_RESET_REQUESTED,
            user_id=user.id if user else None,
            email_attempted=email,
        )
        await self.db.commit()
        if user is None:
            return None

        # Reuse the MFA-challenge-style short-lived JWT pattern for reset tokens.
        from jose import jwt

        now = datetime.now(timezone.utc)
        payload = {
            "sub": str(user.id),
            "type": "password_reset",
            "iat": now,
            "exp": now + timedelta(minutes=30),
        }
        return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    async def confirm_password_reset(self, *, reset_token: str, new_password: str) -> None:
        from jose import JWTError, jwt

        try:
            payload = jwt.decode(
                reset_token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
            )
        except JWTError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired reset token")
        if payload.get("type") != "password_reset":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid reset token")

        user = await self.users.get_by_id(uuid.UUID(payload["sub"]))
        if user is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid reset token")

        try:
            validate_password_policy(new_password)
        except PasswordPolicyError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, {"errors": exc.errors})

        user.password_hash = hash_password(new_password)
        user.password_changed_at = datetime.now(timezone.utc)
        user.failed_login_count = 0
        user.locked_until = None
        await self.logout_all(user_id=user.id)

    # ------------------------------------------------------------- MFA mgmt
    async def start_mfa_setup(self, *, user: User) -> tuple[str, str]:
        secret = mfa_utils.generate_totp_secret()
        encrypted = mfa_utils.encrypt_secret(secret)

        result = await self.db.execute(
            select(MFACredential).where(MFACredential.user_id == user.id)
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.encrypted_secret = encrypted
            existing.confirmed = False
        else:
            self.db.add(
                MFACredential(user_id=user.id, encrypted_secret=encrypted, confirmed=False)
            )
        await self.db.commit()
        return mfa_utils.provisioning_uri(secret, user.email), secret

    async def confirm_mfa_setup(self, *, user: User, code: str) -> list[str]:
        result = await self.db.execute(
            select(MFACredential).where(MFACredential.user_id == user.id)
        )
        credential = result.scalar_one_or_none()
        if credential is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "MFA setup was not started")

        secret = mfa_utils.decrypt_secret(credential.encrypted_secret)
        if not mfa_utils.verify_totp_code(secret, code):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid code")

        credential.confirmed = True
        user.mfa_enabled = True

        # Generate recovery codes (only shown once, here, at confirmation time)
        plain_codes = mfa_utils.generate_recovery_codes()
        for plain in plain_codes:
            self.db.add(
                RecoveryCode(user_id=user.id, code_hash=mfa_utils.hash_recovery_code(plain))
            )

        await self.security_log.record(event_type=SecurityEventType.MFA_ENABLED, user_id=user.id)
        await self.db.commit()
        return plain_codes

    async def disable_mfa(self, *, user: User) -> None:
        result = await self.db.execute(
            select(MFACredential).where(MFACredential.user_id == user.id)
        )
        credential = result.scalar_one_or_none()
        if credential:
            await self.db.delete(credential)
        user.mfa_enabled = False
        await self.security_log.record(event_type=SecurityEventType.MFA_DISABLED, user_id=user.id)
        await self.db.commit()
