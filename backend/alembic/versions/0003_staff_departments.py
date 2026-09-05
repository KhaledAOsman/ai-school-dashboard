"""Convert staff role enum to user-managed departments.

Revision ID: 0003_staff_departments
Revises: 0002_budget_and_staff
Create Date: 2026-01-03

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0003_staff_departments"
down_revision: Union[str, None] = "0002_budget_and_staff"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "staff_departments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(150), nullable=False, unique=True),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_archived", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # Seed default departments matching the old enum values, so any
    # existing staff rows have somewhere valid to point to.
    op.execute(
        """
        INSERT INTO staff_departments (id, name, display_order, is_archived, created_at, updated_at)
        VALUES
            (gen_random_uuid(), 'المدرّسون', 0, false, now(), now()),
            (gen_random_uuid(), 'الموظفون الإداريون', 1, false, now(), now()),
            (gen_random_uuid(), 'أخرى', 99, false, now(), now())
        """
    )

    op.add_column("staff_members", sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=True))

    # Backfill existing rows: map old `role` enum values to the seeded
    # department names above.
    op.execute(
        """
        UPDATE staff_members sm
        SET department_id = sd.id
        FROM staff_departments sd
        WHERE
            (sm.role = 'instructor' AND sd.name = 'المدرّسون')
            OR (sm.role = 'admin_staff' AND sd.name = 'الموظفون الإداريون')
            OR (sm.role = 'other' AND sd.name = 'أخرى')
        """
    )
    # Anything unmapped (shouldn't happen, but be safe) falls back to 'أخرى'.
    op.execute(
        """
        UPDATE staff_members
        SET department_id = (SELECT id FROM staff_departments WHERE name = 'أخرى')
        WHERE department_id IS NULL
        """
    )

    op.alter_column("staff_members", "department_id", nullable=False)
    op.create_foreign_key(
        "fk_staff_members_department_id", "staff_members", "staff_departments", ["department_id"], ["id"], ondelete="RESTRICT"
    )
    op.create_index("ix_staff_members_department_id", "staff_members", ["department_id"])

    op.drop_column("staff_members", "role")


def downgrade() -> None:
    op.add_column("staff_members", sa.Column("role", sa.String(30), nullable=False, server_default="other"))
    op.drop_index("ix_staff_members_department_id", table_name="staff_members")
    op.drop_constraint("fk_staff_members_department_id", "staff_members", type_="foreignkey")
    op.drop_column("staff_members", "department_id")
    op.drop_table("staff_departments")
