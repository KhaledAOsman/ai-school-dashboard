"""Add missing server_default now() for whatsapp_templates timestamps.

The columns were created without a DB-level default in 0008_whatsapp,
so every insert that didn't set created_at/updated_at explicitly hit a
NOT NULL violation. This adds the default at the DB level and backfills
any existing NULL rows.

Revision ID: 0009_whatsapp_ts_default
Revises: 0008_whatsapp
Create Date: 2026-09-20

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0009_whatsapp_ts_default"
down_revision: Union[str, None] = "0008_whatsapp"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE whatsapp_templates SET created_at = now() WHERE created_at IS NULL")
    op.execute("UPDATE whatsapp_templates SET updated_at = now() WHERE updated_at IS NULL")
    op.alter_column("whatsapp_templates", "created_at", server_default=sa.text("now()"))
    op.alter_column("whatsapp_templates", "updated_at", server_default=sa.text("now()"))


def downgrade() -> None:
    op.alter_column("whatsapp_templates", "created_at", server_default=None)
    op.alter_column("whatsapp_templates", "updated_at", server_default=None)
