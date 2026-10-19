"""
Async SQLAlchemy engine/session factory + FastAPI dependency.
"""
from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.settings.config import get_settings

settings = get_settings()

# Pool sized per worker: workers x (pool_size + max_overflow) must stay well
# under Postgres max_connections (100 by default) - e.g. 2 x (5 + 5) = 20.
# statement_timeout kills a runaway query instead of letting it pin a
# connection (and the single CPU) forever.
_is_pg = settings.DATABASE_URL.startswith("postgresql")
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    **(
        {
            "pool_pre_ping": True,
            "pool_size": settings.DB_POOL_SIZE,
            "max_overflow": settings.DB_MAX_OVERFLOW,
            "pool_recycle": settings.DB_POOL_RECYCLE_SECONDS,
            "pool_timeout": 10,
            "connect_args": {
                "server_settings": {
                    "statement_timeout": str(settings.DB_STATEMENT_TIMEOUT_MS),
                    "application_name": "ai-school-api",
                }
            },
        }
        if _is_pg
        else {}  # SQLite (tests) uses its own static pool
    ),
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency yielding a request-scoped DB session.
    Ensures rollback on unhandled exceptions and always closes the session.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
