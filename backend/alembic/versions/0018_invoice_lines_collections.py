"""Invoice lines per account, staff department -> account link, subscription collections.

* expense_allocations (VIEW): one row per invoice line with the account it is
  charged to (line account, else the invoice's account) and the person
  (line person, else the invoice's person). Every report/total reads this so
  a transfer holding salary + bonus + transfer fee is split correctly.
* staff_departments.category_id: the expense account a department is paid
  from (filters people by account in the expense form).
* finance_revenues.fees_amount: gateway/bank fees withheld on a deposit
  (finance_revenues now records money collected into the bank account).
* ledger account 1200: subscriptions paid but not yet deposited by the gateway.

Revision ID: 0018_invoice_lines_collections
Revises: 0017_prepaid_account
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0018_invoice_lines_collections"
down_revision: Union[str, None] = "0017_prepaid_account"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

VIEW = """
CREATE OR REPLACE VIEW expense_allocations AS
SELECT
    e.id AS expense_id,
    COALESCE(l.ord, 1)::int AS line_no,
    l.item ->> 'label' AS label,
    CASE WHEN l.item IS NULL THEN e.amount ELSE (l.item ->> 'amount')::numeric(14, 2) END AS amount,
    CASE WHEN acc.id IS NULL THEN e.category_id
         WHEN acc.parent_id IS NULL THEN acc.id
         ELSE acc.parent_id END AS category_id,
    CASE WHEN acc.id IS NULL THEN e.subcategory_id
         WHEN acc.parent_id IS NULL THEN NULL
         ELSE acc.id END AS subcategory_id,
    COALESCE(NULLIF(l.item ->> 'staff_id', '')::uuid, e.staff_id) AS staff_id,
    e.status,
    e.is_archived,
    e.expense_date,
    e.period_month
FROM expenses e
LEFT JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(e.breakdown) = 'array' THEN e.breakdown ELSE '[]'::jsonb END
) WITH ORDINALITY AS l(item, ord) ON true
LEFT JOIN expense_categories acc ON acc.id = NULLIF(l.item ->> 'account_id', '')::uuid
"""


def upgrade() -> None:
    op.execute(VIEW)
    op.add_column(
        "staff_departments",
        sa.Column("category_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("expense_categories.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        "finance_revenues",
        sa.Column("fees_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
    )
    op.execute(
        """
        INSERT INTO ledger_accounts (id, code, name, account_type, parent_code, normal_side, is_postable, is_active, created_at, updated_at)
        SELECT gen_random_uuid(), '1200', 'مستحق من بوابات الدفع (اشتراكات تحت التحصيل)', 'asset', '1000', 'debit', true, true, now(), now()
        WHERE NOT EXISTS (SELECT 1 FROM ledger_accounts WHERE code = '1200')
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM ledger_accounts WHERE code = '1200'")
    op.drop_column("finance_revenues", "fees_amount")
    op.drop_column("staff_departments", "category_id")
    op.execute("DROP VIEW IF EXISTS expense_allocations")
