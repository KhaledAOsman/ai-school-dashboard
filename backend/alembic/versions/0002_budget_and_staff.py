"""Add budget lines, staff members, and link expenses to both.

Revision ID: 0002_budget_and_staff
Revises: 0001_initial_schema
Create Date: 2026-01-02

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0002_budget_and_staff"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- staff_members ----
    op.create_table(
        "staff_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("role", sa.String(30), nullable=False, server_default="instructor"),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("phone", sa.String(30), nullable=True),
        sa.Column("base_salary", sa.Numeric(14, 2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="SAR"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # ---- budget_lines ----
    op.create_table(
        "budget_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("kind", sa.String(20), nullable=False, server_default="fixed"),
        sa.Column("period", sa.String(20), nullable=False, server_default="monthly"),
        sa.Column("budgeted_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="SAR"),
        sa.Column("period_start", sa.Date, nullable=True),
        sa.Column("period_end", sa.Date, nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="draft"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text, nullable=True),
        sa.Column("is_archived", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_budget_lines_status", "budget_lines", ["status"])

    # ---- budget_line_categories (many-to-many) ----
    op.create_table(
        "budget_line_categories",
        sa.Column("budget_line_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("budget_lines.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("expense_categories.id", ondelete="RESTRICT"), primary_key=True),
    )

    # ---- budget_line_approvals (append-only) ----
    op.create_table(
        "budget_line_approvals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("budget_line_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("budget_lines.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action", sa.String(30), nullable=False),
        sa.Column("from_status", sa.String(30), nullable=False),
        sa.Column("to_status", sa.String(30), nullable=False),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("performed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_budget_line_approvals_budget_line_id", "budget_line_approvals", ["budget_line_id"])

    # ---- link expenses to budget_lines and staff_members ----
    op.add_column(
        "expenses",
        sa.Column("budget_line_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("budget_lines.id", ondelete="RESTRICT"), nullable=True),
    )
    op.add_column(
        "expenses",
        sa.Column("staff_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("staff_members.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_expenses_budget_line_id", "expenses", ["budget_line_id"])
    op.create_index("ix_expenses_staff_id", "expenses", ["staff_id"])

    # Defense-in-depth: append-only budget approval log protected the same
    # way as expense_approvals/audit_logs/security_logs (see 0001).
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
                REVOKE UPDATE, DELETE ON budget_line_approvals FROM app_user;
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.drop_index("ix_expenses_staff_id", table_name="expenses")
    op.drop_index("ix_expenses_budget_line_id", table_name="expenses")
    op.drop_column("expenses", "staff_id")
    op.drop_column("expenses", "budget_line_id")
    op.drop_table("budget_line_approvals")
    op.drop_table("budget_line_categories")
    op.drop_table("budget_lines")
    op.drop_table("staff_members")
