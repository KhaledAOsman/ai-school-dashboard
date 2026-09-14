"""Add WhatsApp templates and message log tables.

Revision ID: 0008_whatsapp
Revises: 0007_follow_up_count
Create Date: 2026-01-08

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0008_whatsapp"
down_revision: Union[str, None] = "0007_follow_up_count"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "whatsapp_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("trigger", sa.String(30), nullable=False, server_default="manual"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "whatsapp_message_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("lead_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("crm_leads.id", ondelete="SET NULL"), nullable=True),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("whatsapp_templates.id", ondelete="SET NULL"), nullable=True),
        sa.Column("phone", sa.String(30), nullable=False),
        sa.Column("rendered_body", sa.Text, nullable=False),
        sa.Column("success", sa.Boolean, nullable=False),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("sent_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_whatsapp_message_log_lead_id", "whatsapp_message_log", ["lead_id"])


def downgrade() -> None:
    op.drop_index("ix_whatsapp_message_log_lead_id", table_name="whatsapp_message_log")
    op.drop_table("whatsapp_message_log")
    op.drop_table("whatsapp_templates")
