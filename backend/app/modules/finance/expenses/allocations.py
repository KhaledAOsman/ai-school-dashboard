"""Read-only mapping of the `expense_allocations` view (migration 0018).

One row per invoice line, already resolved to the account it is charged to
and the person it was paid to. Kept on its own MetaData so create_all() in
tests never tries to create it as a table."""
from __future__ import annotations

from sqlalchemy import Boolean, Column, Date, Integer, MetaData, Numeric, String, Table
from sqlalchemy.dialects.postgresql import UUID

expense_allocations = Table(
    "expense_allocations",
    MetaData(),
    Column("expense_id", UUID(as_uuid=True)),
    Column("line_no", Integer),
    Column("label", String),
    Column("amount", Numeric(14, 2)),
    Column("category_id", UUID(as_uuid=True)),
    Column("subcategory_id", UUID(as_uuid=True)),
    Column("staff_id", UUID(as_uuid=True)),
    Column("status", String),
    Column("is_archived", Boolean),
    Column("expense_date", Date),
    Column("period_month", String),
)
A = expense_allocations.c
TRANSFER_FEE_CODE = "5710"
