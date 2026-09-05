"""
Repository layer for User/Role/Permission data access. Keeps raw SQLAlchemy
query construction out of the service layer.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.users.models import Permission, Role, User, role_permissions


class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_email(self, email: str) -> User | None:
        result = await self.db.execute(
            select(User).options(selectinload(User.roles)).where(User.email == email.lower())
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        result = await self.db.execute(
            select(User).options(selectinload(User.roles)).where(User.id == user_id)
        )
        return result.scalar_one_or_none()

    async def list_all(self, *, include_disabled: bool = True) -> list[User]:
        stmt = select(User).options(selectinload(User.roles))
        result = await self.db.execute(stmt)
        users = list(result.scalars().all())
        if not include_disabled:
            users = [u for u in users if u.status == "active"]
        return users

    def add(self, user: User) -> None:
        self.db.add(user)

    async def get_permissions_for_user(self, user: User) -> set[str]:
        """Flattened set of permission codes across all of the user's roles."""
        if not user.roles:
            return set()
        role_ids = [r.id for r in user.roles]
        result = await self.db.execute(
            select(Permission.code)
            .select_from(Permission)
            .join(role_permissions, role_permissions.c.permission_id == Permission.id)
            .where(role_permissions.c.role_id.in_(role_ids))
            .distinct()
        )
        return set(result.scalars().all())


class RoleRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, role_id: uuid.UUID) -> Role | None:
        result = await self.db.execute(
            select(Role)
            .options(selectinload(Role.permissions), selectinload(Role.users))
            .where(Role.id == role_id)
        )
        return result.scalar_one_or_none()

    async def get_by_name(self, name: str) -> Role | None:
        result = await self.db.execute(
            select(Role).options(selectinload(Role.permissions)).where(Role.name == name)
        )
        return result.scalar_one_or_none()

    async def list_all(self) -> list[Role]:
        result = await self.db.execute(select(Role).options(selectinload(Role.permissions)))
        return list(result.scalars().all())

    def add(self, role: Role) -> None:
        self.db.add(role)


class PermissionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_all(self) -> list[Permission]:
        result = await self.db.execute(select(Permission))
        return list(result.scalars().all())

    async def get_by_codes(self, codes: list[str]) -> list[Permission]:
        result = await self.db.execute(select(Permission).where(Permission.code.in_(codes)))
        return list(result.scalars().all())
