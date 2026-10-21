"""One direct channel: website sign-ups become "organic" (زيارات مباشرة).

Management treats walk-ins, organic social and website sign-ups as a single
source. The value "website" is no longer offered anywhere; existing rows are
folded into "organic" so lists, filters and KPIs show one channel.

Revision ID: 0021_unify_direct_source
Revises: 0020_ad_tracking
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0021_unify_direct_source"
down_revision: Union[str, None] = "0020_ad_tracking"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE crm_leads SET source = 'organic' WHERE source IN ('website', 'web', 'direct')")


def downgrade() -> None:
    # the original split cannot be recovered
    pass
