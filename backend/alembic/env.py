"""
Alembic environment configuration - async engine aware.

The actual DATABASE_URL comes from application settings (env vars), not
from alembic.ini, so migrations always run against whichever database the
app itself is configured to use.
"""
from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.settings.config import get_settings
from app.database.base import Base

# Import all models so Base.metadata is fully populated for autogenerate.
from app.core.users.models import User, Role, Permission  # noqa: F401
from app.core.auth.models import Session, MFACredential, RecoveryCode  # noqa: F401
from app.core.audit.models import AuditLog  # noqa: F401
from app.core.security.log_models import SecurityLog  # noqa: F401
from app.core.notifications.models import Notification  # noqa: F401
from app.modules.finance.categories.models import ExpenseCategory  # noqa: F401
from app.modules.finance.expenses.models import Expense, ExpenseVersion, ExpenseApproval  # noqa: F401
from app.modules.finance.attachments.models import ExpenseAttachment  # noqa: F401
from app.modules.finance.budget.models import BudgetLine, BudgetLineApproval  # noqa: F401
from app.modules.finance.staff.models import StaffMember, StaffDepartment  # noqa: F401
from app.modules.crm.teachers.models import CRMTeacher, TeacherSlot  # noqa: F401
from app.modules.crm.leads.models import Lead, LeadStageEvent  # noqa: F401

config = context.config
settings = get_settings()
# configparser (which alembic.config.Config wraps) treats "%" as the
# start of interpolation syntax (e.g. "%(foo)s"). A DATABASE_URL whose
# password contains a URL-encoded character like "%40" (an escaped "@")
# would otherwise raise "invalid interpolation syntax". Escaping "%" as
# "%%" here tells configparser to treat it as a literal percent sign.
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL.replace("%", "%%"))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
