"""
Core identity models: User, Role, Permission, and their associations.

RBAC design:
    User <-> Role   (many-to-many, via user_roles)
    Role <-> Permission (many-to-many, via role_permissions)

Business logic must NEVER branch on role name (e.g. `if role == "Admin"`).
Always check for a specific permission string (e.g. `finance.expense.approve`).
This keeps the system extensible: new roles can be created by an Admin at
runtime without touching backend code.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Table, Column, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, new_uuid


class AccountStatus(str, Enum):
    ACTIVE = "active"
    DISABLED = "disabled"
    LOCKED = "locked"
    PENDING_ACTIVATION = "pending_activation"


# ---- Association tables ----

user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("assigned_at", DateTime(timezone=True), server_default="now()"),
    Column("assigned_by", UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
)

role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", UUID(as_uuid=True), ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    status: Mapped[str] = mapped_column(
        String(30), default=AccountStatus.PENDING_ACTIVATION.value, nullable=False
    )

    # MFA
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mfa_enforced: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        doc="Whether MFA is mandatory for this user (driven by role policy, but stored per-user for override)",
    )

    # Failed login tracking / lockout
    failed_login_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Preferred locale (Arabic/English), for RTL support
    locale: Mapped[str] = mapped_column(String(10), default="ar", nullable=False)

    roles: Mapped[list["Role"]] = relationship(
        secondary=user_roles, back_populates="users", foreign_keys=[user_roles.c.user_id, user_roles.c.role_id]
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<User {self.email}>"


class Role(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "roles"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_system_role: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        doc="System roles (Owner/Admin/etc seeded at install) cannot be deleted, only edited.",
    )

    users: Mapped[list["User"]] = relationship(
        secondary=user_roles, back_populates="roles", foreign_keys=[user_roles.c.user_id, user_roles.c.role_id]
    )
    permissions: Mapped[list["Permission"]] = relationship(
        secondary=role_permissions, back_populates="roles"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Role {self.name}>"


class Permission(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "permissions"

    code: Mapped[str] = mapped_column(
        String(150), unique=True, nullable=False, index=True,
        doc="Dot-notation permission code, e.g. finance.expense.approve",
    )
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    category: Mapped[str] = mapped_column(
        String(100), nullable=False,
        doc="Grouping for UI display, e.g. 'finance', 'users', 'audit'",
    )

    roles: Mapped[list["Role"]] = relationship(secondary=role_permissions, back_populates="permissions")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Permission {self.code}>"
