"""Separate bookings table: one customer (phone) can hold many bookings.

* creates crm_bookings (one row per lecture booking);
* backfills it from the existing booking data on crm_leads (every lead that
  is in الحجوزات or has lecture / attendance data becomes one booking).

Revision ID: 0014_bookings_table
Revises: 0013_booking_flow
Create Date: 2026-10-09
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0014_bookings_table"
down_revision: Union[str, None] = "0013_booking_flow"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "crm_bookings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("lead_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("crm_leads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("teacher_slot_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("crm_teacher_slots.id", ondelete="SET NULL"), nullable=True),
        sa.Column("teacher_name", sa.String(200), nullable=True),
        sa.Column("lecture_date", sa.Date(), nullable=True),
        sa.Column("lecture_time", sa.Time(), nullable=True),
        sa.Column("zoom_link", sa.String(500), nullable=True),
        sa.Column("attended", sa.Boolean(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_crm_bookings_lead_id", "crm_bookings", ["lead_id"])
    op.create_index("ix_crm_bookings_attended", "crm_bookings", ["attended"])
    op.execute(
        """
        INSERT INTO crm_bookings (id, lead_id, teacher_slot_id, teacher_name, lecture_date, lecture_time, zoom_link, attended)
        SELECT gen_random_uuid(), id, teacher_slot_id, teacher_name, lecture_date, lecture_time, zoom_link, attended
        FROM crm_leads
        WHERE stage IN ('booked','confirmed_whatsapp','confirmed_call','zoom_sent','attendance_recorded')
           OR lecture_date IS NOT NULL OR attended IS NOT NULL OR teacher_slot_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_crm_bookings_attended", table_name="crm_bookings")
    op.drop_index("ix_crm_bookings_lead_id", table_name="crm_bookings")
    op.drop_table("crm_bookings")
