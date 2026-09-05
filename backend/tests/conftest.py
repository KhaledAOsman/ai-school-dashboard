"""
Shared pytest fixtures: an isolated in-memory SQLite database per test
(async), a test client, and helpers for creating users/roles/permissions
so individual tests stay short and focused.

Using SQLite rather than Postgres keeps tests fast and dependency-free;
JSONB/UUID-specific behaviors are covered separately where they matter
(the ORM models use SQLAlchemy's cross-dialect UUID/JSONB types).
"""
from __future__ import annotations

import os

# Set required environment variables BEFORE any app module is imported,
# since app.core.settings.config.get_settings() reads them at import time.
# Never reuse these values outside tests.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-at-least-32-characters-long")
os.environ.setdefault("ENVIRONMENT", "development")

from typing import AsyncGenerator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.database.session import get_db
from app.core.users.models import Permission, Role, User, AccountStatus
from app.core.permissions.registry import SEED_PERMISSIONS
from app.core.security.passwords import hash_password


@pytest_asyncio.fixture
async def engine():
    test_engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield test_engine
    await test_engine.dispose()


@pytest_asyncio.fixture
async def db_session(engine) -> AsyncGenerator[AsyncSession, None]:
    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def app(engine):
    from app.main import app as fastapi_app

    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)

    async def _override_get_db():
        async with session_factory() as session:
            yield session

    fastapi_app.dependency_overrides[get_db] = _override_get_db
    yield fastapi_app
    fastapi_app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def client(app) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


async def seed_permissions(session: AsyncSession) -> dict[str, Permission]:
    perms = {}
    for perm_def in SEED_PERMISSIONS:
        perm = Permission(code=perm_def.code, description=perm_def.description, category=perm_def.category)
        session.add(perm)
        perms[perm_def.code] = perm
    await session.flush()
    return perms


async def create_role(session: AsyncSession, name: str, permission_codes: list[str], perms_by_code: dict) -> Role:
    role = Role(
        name=name,
        is_system_role=True,
        permissions=[perms_by_code[c] for c in permission_codes],
    )
    session.add(role)
    await session.flush()
    return role


async def create_user(
    session: AsyncSession, *, email: str, password: str, roles: list[Role], status: str = AccountStatus.ACTIVE.value
) -> User:
    user = User(
        email=email,
        full_name="Test User",
        password_hash=hash_password(password),
        status=status,
        roles=roles,
    )
    session.add(user)
    await session.flush()
    await session.commit()
    return user
