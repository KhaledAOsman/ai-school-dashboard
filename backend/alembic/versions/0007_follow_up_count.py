"""Add follow_up_count to crm_leads.

Revision ID: 0007_follow_up_count
Revises: 0006_lead_stage_groups
Create Date: 2026-01-07

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0007_follow_up_count"
down_revision: Union[str, None] = "0006_lead_stage_groups"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("crm_leads", sa.Column("follow_up_count", sa.Integer(), nullable=False, server_default="0"))
    op.alter_column("crm_leads", "follow_up_count", server_default=None)


def downgrade() -> None:
    op.drop_column("crm_leads", "follow_up_count")
