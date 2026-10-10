"""Finance: invoice details on expenses, coded chart of accounts, partner funding.

* expense_categories.code - account code shown in the chart of accounts;
* expenses: invoice_date, invoice_url, paid_by, period_month, breakdown
  (itemised lines that must add up to the amount), source (import marker);
* finance_funding - money transferred into the project by partners.

Revision ID: 0015_finance_invoices
Revises: 0014_bookings_table
Create Date: 2026-10-10
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0015_finance_invoices"
down_revision: Union[str, None] = "0014_bookings_table"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("expense_categories", sa.Column("code", sa.String(20), nullable=True))
    op.create_index("ix_expense_categories_code", "expense_categories", ["code"])

    op.add_column("expenses", sa.Column("invoice_date", sa.Date(), nullable=True))
    op.add_column("expenses", sa.Column("invoice_url", sa.Text(), nullable=True))
    op.add_column("expenses", sa.Column("paid_by", sa.String(100), nullable=True))
    op.add_column("expenses", sa.Column("period_month", sa.String(7), nullable=True))
    op.add_column("expenses", sa.Column("breakdown", postgresql.JSONB(), nullable=True))
    op.add_column("expenses", sa.Column("source", sa.String(40), nullable=True))
    op.create_index("ix_expenses_period_month", "expenses", ["period_month"])
    op.create_index("ix_expenses_source", "expenses", ["source"])

    op.create_table(
        "finance_funding",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("funding_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="SAR"),
        sa.Column("source_name", sa.String(200), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("source", sa.String(40), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_finance_funding_date", "finance_funding", ["funding_date"])


def downgrade() -> None:
    op.drop_table("finance_funding")
    op.drop_index("ix_expenses_source", table_name="expenses")
    op.drop_index("ix_expenses_period_month", table_name="expenses")
    for col in ("source", "breakdown", "period_month", "paid_by", "invoice_url", "invoice_date"):
        op.drop_column("expenses", col)
    op.drop_index("ix_expense_categories_code", table_name="expense_categories")
    op.drop_column("expense_categories", "code")
