"""Accounting: prepaid expenses account (1300) for costs paid before the month they belong to.

Revision ID: 0017_prepaid_account
Revises: 0016_accounting_core
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0017_prepaid_account"
down_revision: Union[str, None] = "0016_accounting_core"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO ledger_accounts (id, code, name, account_type, parent_code, normal_side, is_postable, is_active, created_at, updated_at)
        SELECT gen_random_uuid(), '1300', 'مصروفات مدفوعة مقدّمًا', 'asset', '1000', 'debit', true, true, now(), now()
        WHERE NOT EXISTS (SELECT 1 FROM ledger_accounts WHERE code = '1300')
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM ledger_accounts WHERE code = '1300'")
