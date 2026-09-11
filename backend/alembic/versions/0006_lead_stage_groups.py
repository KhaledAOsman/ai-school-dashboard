"""Restructure lead pipeline into three UI groups (leads/bookings/interested).

Splits the old single "contacted" starting stage into "new" (default for
new leads) plus "not_answered"/"unreachable" (now real stage values a
lead moves into after a call attempt, instead of being derived from the
call-attempts history at read time). Existing rows previously at
"contacted" are migrated to "new" so they land in the right UI section.

Revision ID: 0006_lead_stage_groups
Revises: 0005_call_attempts_and_zoom
Create Date: 2026-01-06

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0006_lead_stage_groups"
down_revision: Union[str, None] = "0005_call_attempts_and_zoom"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE crm_leads SET stage = 'new' WHERE stage = 'contacted'")
    op.execute("UPDATE crm_lead_stage_events SET stage = 'new' WHERE stage = 'contacted'")


def downgrade() -> None:
    op.execute("UPDATE crm_leads SET stage = 'contacted' WHERE stage = 'new'")
    op.execute("UPDATE crm_lead_stage_events SET stage = 'contacted' WHERE stage = 'new'")
