"""Add teacher zoom_link, lead call attempts, and search indexes.

Revision ID: 0005_call_attempts_and_zoom
Revises: 0004_crm_module
Create Date: 2026-01-05

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0005_call_attempts_and_zoom"
down_revision: Union[str, None] = "0004_crm_module"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("crm_teachers", sa.Column("zoom_link", sa.String(500), nullable=True))

    op.create_table(
        "crm_lead_call_attempts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("lead_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("crm_leads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("outcome", sa.String(20), nullable=False),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("performed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_crm_lead_call_attempts_lead_id", "crm_lead_call_attempts", ["lead_id"])

    op.create_index("ix_crm_leads_phone", "crm_leads", ["phone"])
    op.create_index("ix_crm_leads_created_at", "crm_leads", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_crm_leads_created_at", table_name="crm_leads")
    op.drop_index("ix_crm_leads_phone", table_name="crm_leads")
    op.drop_index("ix_crm_lead_call_attempts_lead_id", table_name="crm_lead_call_attempts")
    op.drop_table("crm_lead_call_attempts")
    op.drop_column("crm_teachers", "zoom_link")
