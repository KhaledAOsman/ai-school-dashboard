"""Initial schema: users, roles, permissions, sessions, MFA, audit/security
logs, notifications, and the finance module (categories, expenses, versions,
approvals, attachments).

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-01-01

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')

    # ---- users ----
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending_activation"),
        sa.Column("mfa_enabled", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("mfa_enforced", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("failed_login_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("locale", sa.String(10), nullable=False, server_default="ar"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # ---- roles ----
    op.create_table(
        "roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False, unique=True),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("is_system_role", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # ---- permissions ----
    op.create_table(
        "permissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(150), nullable=False, unique=True),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("category", sa.String(100), nullable=False),
    )
    op.create_index("ix_permissions_code", "permissions", ["code"])

    # ---- user_roles ----
    op.create_table(
        "user_roles",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("assigned_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )

    # ---- role_permissions ----
    op.create_table(
        "role_permissions",
        sa.Column("role_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("permission_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
    )

    # ---- sessions ----
    op.create_table(
        "sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("refresh_token_hash", sa.String(255), nullable=False, unique=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])

    # ---- mfa_credentials ----
    op.create_table(
        "mfa_credentials",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("encrypted_secret", sa.String(500), nullable=False),
        sa.Column("confirmed", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # ---- recovery_codes ----
    op.create_table(
        "recovery_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code_hash", sa.String(255), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_recovery_codes_user_id", "recovery_codes", ["user_id"])

    # ---- audit_logs (append-only) ----
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(150), nullable=False),
        sa.Column("resource_type", sa.String(100), nullable=False),
        sa.Column("resource_id", sa.String(100), nullable=True),
        sa.Column("request_id", sa.String(100), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("previous_value", postgresql.JSONB, nullable=True),
        sa.Column("new_value", postgresql.JSONB, nullable=True),
        sa.Column("log_metadata", postgresql.JSONB, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
    )
    op.create_index("ix_audit_logs_timestamp", "audit_logs", ["timestamp"])
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_resource_type", "audit_logs", ["resource_type"])
    op.create_index("ix_audit_logs_resource_id", "audit_logs", ["resource_id"])

    # ---- security_logs (append-only, separate from audit) ----
    op.create_table(
        "security_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("email_attempted", sa.String(320), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("log_metadata", postgresql.JSONB, nullable=True),
    )
    op.create_index("ix_security_logs_timestamp", "security_logs", ["timestamp"])
    op.create_index("ix_security_logs_event_type", "security_logs", ["event_type"])
    op.create_index("ix_security_logs_user_id", "security_logs", ["user_id"])

    # ---- notifications ----
    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.Text, nullable=True),
        sa.Column("resource_type", sa.String(100), nullable=True),
        sa.Column("resource_id", sa.String(100), nullable=True),
        sa.Column("is_read", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])

    # ---- expense_categories (hierarchical, soft-delete) ----
    op.create_table(
        "expense_categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("name_ar", sa.String(150), nullable=True),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("expense_categories.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_archived", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # ---- expenses ----
    op.create_table(
        "expenses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="SAR"),
        sa.Column("expense_date", sa.Date, nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("expense_categories.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("subcategory_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("expense_categories.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("vendor", sa.String(200), nullable=True),
        sa.Column("invoice_number", sa.String(100), nullable=True),
        sa.Column("payment_method", sa.String(50), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="draft"),
        sa.Column("current_version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text, nullable=True),
        sa.Column("is_archived", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_expenses_status", "expenses", ["status"])

    # ---- expense_versions (append-only) ----
    op.create_table(
        "expense_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("expense_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_number", sa.Integer, nullable=False),
        sa.Column("snapshot", postgresql.JSONB, nullable=False),
        sa.Column("change_reason", sa.String(500), nullable=True),
        sa.Column("restored_from_version", sa.Integer, nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_expense_versions_expense_id", "expense_versions", ["expense_id"])

    # ---- expense_approvals (append-only) ----
    op.create_table(
        "expense_approvals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("expense_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action", sa.String(30), nullable=False),
        sa.Column("from_status", sa.String(30), nullable=False),
        sa.Column("to_status", sa.String(30), nullable=False),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("performed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_expense_approvals_expense_id", "expense_approvals", ["expense_id"])

    # ---- expense_attachments ----
    op.create_table(
        "expense_attachments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("expense_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("storage_key", sa.String(500), nullable=False, unique=True),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.BigInteger, nullable=False),
        sa.Column("checksum_sha256", sa.String(64), nullable=False),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("is_deleted", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("deleted_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_expense_attachments_expense_id", "expense_attachments", ["expense_id"])

    # ---- Defense-in-depth: application DB role cannot UPDATE/DELETE
    # append-only log tables. Adjust role name to match your deployment.
    # Wrapped in a DO block so it's a no-op if the role doesn't exist yet
    # (e.g. first-time local dev setups using the Postgres superuser).
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
                REVOKE UPDATE, DELETE ON audit_logs FROM app_user;
                REVOKE UPDATE, DELETE ON security_logs FROM app_user;
                REVOKE UPDATE, DELETE ON expense_versions FROM app_user;
                REVOKE UPDATE, DELETE ON expense_approvals FROM app_user;
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.drop_table("expense_attachments")
    op.drop_table("expense_approvals")
    op.drop_table("expense_versions")
    op.drop_table("expenses")
    op.drop_table("expense_categories")
    op.drop_table("notifications")
    op.drop_table("security_logs")
    op.drop_table("audit_logs")
    op.drop_table("recovery_codes")
    op.drop_table("mfa_credentials")
    op.drop_table("sessions")
    op.drop_table("role_permissions")
    op.drop_table("user_roles")
    op.drop_table("permissions")
    op.drop_table("roles")
    op.drop_table("users")
