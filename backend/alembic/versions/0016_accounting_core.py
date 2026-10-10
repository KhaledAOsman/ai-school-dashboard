"""Accounting core: ledger accounts, subscription revenue, manual journal entries.

* ledger_accounts - the non-expense part of the chart of accounts (assets,
  liabilities, equity, revenue) plus one catch-all expense account. Expense
  accounts themselves stay in expense_categories (same code space, 5xxx).
* finance_revenues - student subscription income (what the school earns).
* journal_entries / journal_lines - manual (adjusting) entries. Everything
  else in the journal is generated from expenses, funding and revenues.

Revision ID: 0016_accounting_core
Revises: 0015_finance_invoices
Create Date: 2026-10-10
"""
from __future__ import annotations

import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0016_accounting_core"
down_revision: Union[str, None] = "0015_finance_invoices"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# code, name, type, parent, normal side, postable
ACCOUNTS = [
    ("1000", "الأصول", "asset", None, "debit", False),
    ("1100", "النقدية والبنوك", "asset", "1000", "debit", False),
    ("1110", "حساب التشغيل (البنك / الخزينة)", "asset", "1100", "debit", True),
    ("2000", "الخصوم", "liability", None, "credit", False),
    ("2100", "المستحقات", "liability", "2000", "credit", False),
    ("2110", "أجور الفريق المستحقة", "liability", "2100", "credit", True),
    ("2120", "مصروفات مستحقة أخرى", "liability", "2100", "credit", True),
    ("2200", "مستحق للشركاء (مدفوعات بالنيابة عن المشروع)", "liability", "2000", "credit", True),
    ("2300", "إيرادات مقدّمة (اشتراكات)", "liability", "2000", "credit", True),
    ("3000", "حقوق الملكية", "equity", None, "credit", False),
    ("3100", "تمويل الشركاء (رأس المال)", "equity", "3000", "credit", True),
    ("4000", "الإيرادات", "revenue", None, "credit", False),
    ("4100", "إيرادات اشتراكات الطلاب", "revenue", "4000", "credit", True),
    ("4900", "خصومات ومرتجعات الاشتراكات", "revenue", "4000", "debit", True),
    ("5999", "مصروفات غير مصنّفة", "expense", None, "debit", True),
]


def upgrade() -> None:
    ts = lambda: [  # noqa: E731
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]
    accounts = op.create_table(
        "ledger_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(20), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("account_type", sa.String(20), nullable=False),
        sa.Column("parent_code", sa.String(20), nullable=True),
        sa.Column("normal_side", sa.String(6), nullable=False),
        sa.Column("is_postable", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *ts(),
    )
    op.bulk_insert(
        accounts,
        [
            {"id": uuid.uuid4(), "code": c, "name": n, "account_type": t, "parent_code": p,
             "normal_side": s, "is_postable": post, "is_active": True}
            for c, n, t, p, s, post in ACCOUNTS
        ],
    )

    op.create_table(
        "finance_revenues",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("revenue_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("discount_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="SAR"),
        sa.Column("revenue_type", sa.String(30), nullable=False, server_default="subscription"),
        sa.Column("customer_name", sa.String(200), nullable=True),
        sa.Column("package_name", sa.String(200), nullable=True),
        sa.Column("invoice_number", sa.String(100), nullable=True),
        sa.Column("invoice_url", sa.Text(), nullable=True),
        sa.Column("payment_method", sa.String(50), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("source", sa.String(40), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        *ts(),
    )
    op.create_index("ix_finance_revenues_date", "finance_revenues", ["revenue_date"])
    op.create_index("ix_finance_revenues_source", "finance_revenues", ["source"])

    op.create_table(
        "journal_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("memo", sa.Text(), nullable=False),
        sa.Column("reference", sa.String(100), nullable=True),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("void_reason", sa.Text(), nullable=True),
        sa.Column("source", sa.String(40), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        *ts(),
    )
    op.create_index("ix_journal_entries_date", "journal_entries", ["entry_date"])
    op.create_table(
        "journal_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("entry_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False),
        sa.Column("line_no", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("account_code", sa.String(20), nullable=False),
        sa.Column("debit", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("credit", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("party", sa.String(200), nullable=True),
        sa.CheckConstraint("debit >= 0 AND credit >= 0 AND (debit = 0 OR credit = 0)", name="ck_journal_line_one_side"),
    )
    op.create_index("ix_journal_lines_entry", "journal_lines", ["entry_id"])
    op.create_index("ix_journal_lines_account", "journal_lines", ["account_code"])


def downgrade() -> None:
    op.drop_table("journal_lines")
    op.drop_table("journal_entries")
    op.drop_table("finance_revenues")
    op.drop_table("ledger_accounts")
