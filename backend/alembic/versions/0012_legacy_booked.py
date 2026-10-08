"""Flag old "تم الحجز" leads that have no lecture appointment.

These customers were booked in the old customer-service sheet but there is
no teacher / time for them. They are hidden from the normal pipeline view
and only a system administrator can convert them into real bookings.

Revision ID: 0012_legacy_booked
Revises: 0011_campaign_breakdown
Create Date: 2026-10-08

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0012_legacy_booked"
down_revision: Union[str, None] = "0011_campaign_breakdown"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "crm_leads",
        sa.Column("legacy_booked", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Imported leads carrying the manual-review marker, with no appointment
    # and no attendance yet.
    op.execute(
        """
        UPDATE crm_leads SET legacy_booked = true
        WHERE attended IS NULL
          AND lecture_date IS NULL
          AND teacher_slot_id IS NULL
          AND notes LIKE '%تأجيل - يحتاج مراجعة يدوية%'
        """
    )


def downgrade() -> None:
    op.drop_column("crm_leads", "legacy_booked")
