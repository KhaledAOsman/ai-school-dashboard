"""
UserManagementService: Admin-facing operations for users. Distinct from
AuthService, which handles the currently-authenticated user's own auth flows.
"""
from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit.service import AuditService
from app.core.security.passwords import (
    PasswordPolicyError,
    hash_password,
    validate_password_policy,
)
from app.core.users.models import AccountStatus, Role, User
from app.core.users.repository import RoleRepository, UserRepository
from app.core.users.schemas import UserCreateRequest, UserUpdateRequest


class UserManagementService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.users = UserRepository(db)
        self.roles = RoleRepository(db)
        self.audit = AuditService(db)

    async def create_user(self, *, payload: UserCreateRequest, actor_id: uuid.UUID) -> User:
        existing = await self.users.get_by_email(payload.email)
        if existing is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "A user with this email already exists")

        try:
            validate_password_policy(payload.temporary_password)
        except PasswordPolicyError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, {"errors": exc.errors})

        role_rows: list[Role] = []
        for role_id in payload.role_ids:
            role = await self.roles.get_by_id(role_id)
            if role is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, f"Role {role_id} not found")
            role_rows.append(role)

        user = User(
            email=payload.email.lower(),
            full_name=payload.full_name,
            password_hash=hash_password(payload.temporary_password),
            status=AccountStatus.ACTIVE.value,
            locale=payload.locale,
            roles=role_rows,
        )
        self.users.add(user)
        await self.db.flush()

        await self.audit.record(
            user_id=actor_id,
            action="user.created",
            resource_type="User",
            resource_id=str(user.id),
            new_value={"email": user.email, "roles": [r.name for r in role_rows]},
        )
        await self.db.commit()
        # Re-fetch through the repository (selectinload's .roles) rather than
        # returning the in-memory `user` object directly - matches the same
        # fix applied to expenses/roles: avoids relying on relationship
        # state surviving past commit().
        return await self.users.get_by_id(user.id)

    async def update_user(
        self, *, user_id: uuid.UUID, payload: UserUpdateRequest, actor_id: uuid.UUID
    ) -> User:
        user = await self.users.get_by_id(user_id)
        if user is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

        previous = {"full_name": user.full_name, "roles": [r.name for r in user.roles]}

        if payload.full_name is not None:
            user.full_name = payload.full_name
        if payload.locale is not None:
            user.locale = payload.locale
        if payload.role_ids is not None:
            role_rows: list[Role] = []
            for role_id in payload.role_ids:
                role = await self.roles.get_by_id(role_id)
                if role is None:
                    raise HTTPException(status.HTTP_404_NOT_FOUND, f"Role {role_id} not found")
                role_rows.append(role)
            user.roles = role_rows

        await self.audit.record(
            user_id=actor_id,
            action="user.updated",
            resource_type="User",
            resource_id=str(user.id),
            previous_value=previous,
            new_value={"full_name": user.full_name, "roles": [r.name for r in user.roles]},
        )
        await self.db.commit()
        # Same re-fetch fix as create_user() above.
        return await self.users.get_by_id(user.id)

    async def disable_user(self, *, user_id: uuid.UUID, actor_id: uuid.UUID) -> None:
        user = await self.users.get_by_id(user_id)
        if user is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
        if user.id == actor_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot disable your own account")

        user.status = AccountStatus.DISABLED.value
        await self.audit.record(
            user_id=actor_id,
            action="user.disabled",
            resource_type="User",
            resource_id=str(user.id),
        )
        await self.db.commit()

    async def list_users(self) -> list[User]:
        return await self.users.list_all()
