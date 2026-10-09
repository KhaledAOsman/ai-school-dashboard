"""Booking flow: booked-without-appointment leads join الحجوزات; attended -> مهتمون.

Data-only migration (no customer data inside):
* (old "تم الحجز" leads without an appointment are NOT bookings - they stay
  in العملاء المحتملون until someone confirms them with «تم الحجز»);
* leads whose attendance was recorded as attended move to the new
  "interested" stage (عملاء مهتمون); "did not attend" stay in الحجوزات.

Revision ID: 0013_booking_flow
Revises: 0012_legacy_booked
Create Date: 2026-10-09
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0013_booking_flow"
down_revision: Union[str, None] = "0012_legacy_booked"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE crm_leads
        SET stage = 'interested'
        WHERE attended IS TRUE AND stage = 'attendance_recorded'
        """
    )


def downgrade() -> None:
    op.execute("UPDATE crm_leads SET stage = 'attendance_recorded' WHERE stage = 'interested'")
