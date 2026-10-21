"""Ad tracking: Snapchat lead-form attribution + offline-conversion outbox.

* crm_lead_ad_attributions: one row per lead-form submission received from
  an ad platform (Snap lead_id, campaign / ad set / ad), linked to the CRM
  lead. Unique per (platform, external_lead_id) so webhook retries are no-ops.
* ad_conversion_events: outbox of conversion events reported back to the
  platform (booked / attended / purchase); event_id unique = sent once.

Revision ID: 0020_ad_tracking
Revises: 0019_performance_indexes
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0020_ad_tracking"
down_revision: Union[str, None] = "0019_performance_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "crm_lead_ad_attributions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("lead_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("crm_leads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("platform", sa.String(20), nullable=False),
        sa.Column("external_lead_id", sa.String(100), nullable=False),
        sa.Column("form_id", sa.String(100), nullable=True),
        sa.Column("form_name", sa.String(300), nullable=True),
        sa.Column("ad_account_id", sa.String(100), nullable=True),
        sa.Column("campaign_id", sa.String(100), nullable=True),
        sa.Column("campaign_name", sa.String(300), nullable=True),
        sa.Column("ad_squad_id", sa.String(100), nullable=True),
        sa.Column("ad_squad_name", sa.String(300), nullable=True),
        sa.Column("ad_id", sa.String(100), nullable=True),
        sa.Column("ad_name", sa.String(300), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("raw", postgresql.JSONB(), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("platform", "external_lead_id", name="uq_lead_ad_attr_platform_ext"),
    )
    op.create_index("ix_crm_lead_ad_attributions_lead_id", "crm_lead_ad_attributions", ["lead_id"])

    op.create_table(
        "ad_conversion_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("lead_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("crm_leads.id", ondelete="SET NULL"), nullable=True),
        sa.Column("platform", sa.String(20), nullable=False),
        sa.Column("stage", sa.String(20), nullable=False),
        sa.Column("event_name", sa.String(50), nullable=False),
        sa.Column("event_id", sa.String(150), nullable=False),
        sa.Column("event_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("value", sa.Numeric(12, 2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("response_code", sa.Integer(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payload", postgresql.JSONB(), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("event_id", name="uq_ad_conversion_events_event_id"),
    )
    op.create_index("ix_ad_conversion_events_lead_id", "ad_conversion_events", ["lead_id"])
    op.create_index("ix_ad_conversion_events_status", "ad_conversion_events", ["status"])


def downgrade() -> None:
    op.drop_index("ix_ad_conversion_events_status", table_name="ad_conversion_events")
    op.drop_index("ix_ad_conversion_events_lead_id", table_name="ad_conversion_events")
    op.drop_table("ad_conversion_events")
    op.drop_index("ix_crm_lead_ad_attributions_lead_id", table_name="crm_lead_ad_attributions")
    op.drop_table("crm_lead_ad_attributions")
