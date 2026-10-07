"""Ad campaign result breakdown (form leads / website leads / messaging).

Platform "Results" mix different event types: instant-form leads (which
produce an exportable row with a phone number), website/pixel leads and
messaging conversations (no row in the lead export). Storing the split lets
the KPI dashboard reconcile platform numbers with the leads actually
recorded in the CRM.

Revision ID: 0011_campaign_breakdown
Revises: 0010_subs_campaigns_kpi
Create Date: 2026-10-07

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0011_campaign_breakdown"
down_revision: Union[str, None] = "0010_subs_campaigns_kpi"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLS = ("form_leads", "website_leads", "messaging_conversations")


def upgrade() -> None:
    for c in COLS:
        op.add_column("ad_campaigns", sa.Column(c, sa.Integer(), nullable=True))
    # Meta campaign "CBO on_Leads (1)": 49 results = 36 instant-form leads +
    # 13 website leads, plus 24 messaging conversations (figures read from
    # Ads Manager on 2026-10-07). Matches only that exact seeded row.
    op.execute(
        "UPDATE ad_campaigns SET form_leads = 36, website_leads = 13, messaging_conversations = 24 "
        "WHERE platform = 'meta' AND name = 'CBO on_Leads (1)' AND results_count = 49"
    )


def downgrade() -> None:
    for c in reversed(COLS):
        op.drop_column("ad_campaigns", c)
