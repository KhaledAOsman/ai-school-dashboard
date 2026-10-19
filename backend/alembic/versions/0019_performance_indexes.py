"""Performance indexes for the paged lists, the search boxes and the reports.

* expenses: the list is always "not archived, newest first" -> one partial
  composite index serves the ORDER BY + LIMIT/OFFSET without a sort; the
  account filters and the expense_date range used by every report.
* crm_leads: section tabs filter by stage and sort by created_at; the
  search box does ILIKE '%...%' on name / phone -> trigram GIN indexes
  (a plain b-tree cannot serve a leading-wildcard LIKE).
* crm_bookings: "pending attendance" lookups (attended IS NULL) by lead.
* subscriptions / call attempts / stage events / versions: the orderings
  the screens use.

All are IF NOT EXISTS so the migration is safe to re-run; tables are small
enough today that a plain (locking) CREATE INDEX finishes in milliseconds.

Revision ID: 0019_performance_indexes
Revises: 0018_invoice_lines_collections
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0019_performance_indexes"
down_revision: Union[str, None] = "0018_invoice_lines_collections"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEXES = [
    ("ix_expenses_active_date", "expenses", "(expense_date DESC, created_at DESC) WHERE is_archived = false"),
    ("ix_expenses_category_id", "expenses", "(category_id)"),
    ("ix_expenses_subcategory_id", "expenses", "(subcategory_id)"),
    ("ix_expenses_paid_by", "expenses", "(paid_by) WHERE paid_by IS NOT NULL"),
    ("ix_crm_leads_stage_created", "crm_leads", "(stage, created_at DESC)"),
    ("ix_crm_leads_source", "crm_leads", "(source)"),
    ("ix_crm_leads_open", "crm_leads", "(stage, created_at DESC) WHERE is_converted = false AND is_lost = false"),
    ("ix_crm_leads_name_trgm", "crm_leads", "USING gin (full_name gin_trgm_ops)"),
    ("ix_crm_leads_phone_trgm", "crm_leads", "USING gin (phone gin_trgm_ops)"),
    ("ix_crm_bookings_pending", "crm_bookings", "(lead_id) WHERE attended IS NULL"),
    ("ix_subscriptions_order", "subscriptions", "(subscribed_at DESC, created_at DESC)"),
    ("ix_security_logs_ts_desc", "security_logs", "(timestamp DESC)"),
]


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    for name, table, spec in INDEXES:
        op.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {table} {spec}")
    for table in ("expenses", "crm_leads", "crm_bookings", "subscriptions"):
        op.execute(f"ANALYZE {table}")


def downgrade() -> None:
    for name, _table, _spec in reversed(INDEXES):
        op.execute(f"DROP INDEX IF EXISTS {name}")
