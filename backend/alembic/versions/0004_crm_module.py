"""Add CRM module: teachers, teacher slots, leads, lead stage events.

Revision ID: 0004_crm_module
Revises: 0003_staff_departments
Create Date: 2026-01-04

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0004_crm_module"
down_revision: Union[str, None] = "0003_staff_departments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "crm_teachers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "crm_teacher_slots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("teacher_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("crm_teachers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("slot_date", sa.Date, nullable=False),
        sa.Column("slot_time", sa.Time, nullable=False),
        sa.Column("is_booked", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("booked_lead_id", postgresql.UUID(as_uuid=True), nullable=True),  # FK added after crm_leads exists
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_crm_teacher_slots_teacher_id", "crm_teacher_slots", ["teacher_id"])
    op.create_index("ix_crm_teacher_slots_is_booked", "crm_teacher_slots", ["is_booked"])

    op.create_table(
        "crm_leads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("phone", sa.String(30), nullable=False),
        sa.Column("source", sa.String(100), nullable=True),
        sa.Column("stage", sa.String(30), nullable=False, server_default="contacted"),
        sa.Column("teacher_slot_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("crm_teacher_slots.id", ondelete="SET NULL"), nullable=True),
        sa.Column("teacher_name", sa.String(200), nullable=True),
        sa.Column("lecture_date", sa.Date, nullable=True),
        sa.Column("lecture_time", sa.Time, nullable=True),
        sa.Column("zoom_link", sa.String(500), nullable=True),
        sa.Column("attended", sa.Boolean, nullable=True),
        sa.Column("is_converted", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("is_lost", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("lost_reason", sa.Text, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("assigned_to", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_crm_leads_stage", "crm_leads", ["stage"])
    op.create_index("ix_crm_leads_assigned_to", "crm_leads", ["assigned_to"])

    # Now that crm_leads exists, add the FK from crm_teacher_slots.booked_lead_id.
    op.create_foreign_key(
        "fk_crm_teacher_slots_booked_lead_id", "crm_teacher_slots", "crm_leads", ["booked_lead_id"], ["id"], ondelete="SET NULL"
    )

    op.create_table(
        "crm_lead_stage_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("lead_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("crm_leads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stage", sa.String(30), nullable=False),
        sa.Column("performed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_crm_lead_stage_events_lead_id", "crm_lead_stage_events", ["lead_id"])


def downgrade() -> None:
    op.drop_table("crm_lead_stage_events")
    op.drop_constraint("fk_crm_teacher_slots_booked_lead_id", "crm_teacher_slots", type_="foreignkey")
    op.drop_index("ix_crm_leads_assigned_to", table_name="crm_leads")
    op.drop_index("ix_crm_leads_stage", table_name="crm_leads")
    op.drop_table("crm_leads")
    op.drop_index("ix_crm_teacher_slots_is_booked", table_name="crm_teacher_slots")
    op.drop_index("ix_crm_teacher_slots_teacher_id", table_name="crm_teacher_slots")
    op.drop_table("crm_teacher_slots")
    op.drop_table("crm_teachers")
