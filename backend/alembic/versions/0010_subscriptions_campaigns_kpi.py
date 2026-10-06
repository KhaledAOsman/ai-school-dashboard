"""Subscriptions, ad campaigns and app settings for the half-yearly KPI dashboard.

Seeds the 10 current paid subscribers (each pays a different price; list
price 850 = paid + discount) and the ad-account figures for the three
platforms (lifetime totals, no dates). Subscription dates are placeholders
(the real dates were not available) and are flagged in notes so management
edits them from the UI.

Revision ID: 0010_subs_campaigns_kpi
Revises: 0009_whatsapp_ts_default
Create Date: 2026-10-06

"""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0010_subs_campaigns_kpi"
down_revision: Union[str, None] = "0009_whatsapp_ts_default"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SEED_DATE = date(2026, 10, 6)
PERIOD_LABEL = "تراكمي حتى 2026-10-06"

SUBSCRIBERS = [
    ("باسل يحيى موسى الزهراني", "966533307942", "595", "255"),
    ("امنيه عبدالله فيصل القرشي", "966551481113", "425", "425"),
    ("فيصل عبدالله فيصل القرشي", "966551481113", "595", "255"),
    ("هيفاء وليد الحكير", "966559222000", "595", "255"),
    ("اياد فهد الساعدي", "966550545905", "595", "255"),
    ("مؤيد الحربي", "966503169233", "722.50", "127.50"),
    ("فهد محمد الماضي", "966590500022", "595", "255"),
    ("كادي الغانمي", "966506920991", "425", "425"),
    ("قصي محمد", "966506626446", "595", "255"),
    ("ماجد نائف الشمري", "966533353107", "595", "255"),
]

# (platform, name, objective, spend, results_count, results_label, counts_as_leads, clicks)
CAMPAIGNS = [
    ("snapchat", "سناب - عملاء محتملون", "عملاء محتملون", "3453.19", 210, "عميل محتمل", True, None),
    ("snapchat", "سناب - تسجيل اشتراك (1)", "تسجيل اشتراك", "233.42", 2, "تسجيل", True, None),
    ("snapchat", "سناب - تسجيل اشتراك (2)", "تسجيل اشتراك", "359.47", 4, "تسجيل", True, None),
    ("snapchat", "سناب - تسجيل اشتراك (3)", "تسجيل اشتراك", "3031.67", 47, "تسجيل", True, None),
    ("snapchat", "سناب - وعي وتفاعل", "وعي وتفاعل", "400.00", 773, "نقرة", False, 773),
    ("snapchat", "سناب - زيارات", "زيارات", "1399.72", 702, "مشاهدة صفحة", False, None),
    ("meta", "B_Leads", "Leads", "3381.57", 262, "ليد", True, None),
    ("meta", "A_Leads", "Leads", "94.37", 1, "ليد", True, None),
    ("meta", "CBO on_Leads (1)", "Leads", "3182.17", 49, "ليد", True, None),
    ("meta", "CBO on_Leads (2)", "Leads", "839.30", 55, "تواصل عبر الموقع", True, None),
    ("meta", "CBO on_Leads (3)", "Leads", "211.99", None, "بلا نتيجة", False, None),
    ("meta", "CBO off_Traffic (1)", "Traffic", "1406.89", 2381, "زيارة بروفايل انستجرام", False, None),
    ("meta", "CBO on_Leads (4)", "Leads", "376.13", 4, "ليد عبر الموقع", True, None),
    ("meta", "CBO off_Traffic (2)", "Traffic", "1339.04", 3671, "مشاهدة صفحة هبوط", False, None),
    ("tiktok", "Lead generation", "Lead generation", "1003.98", 22, "تحويل ليد", True, None),
    ("tiktok", "Community interaction", "Community interaction", "404.10", 0, "تفاعل", False, None),
    ("tiktok", "Traffic", "Traffic", "802.48", 6792, "تحويل", False, 7202),
    ("tiktok", "Reach-Test", "Reach", "144.74", 0, "وصول", False, None),
]


def upgrade() -> None:
    op.create_table(
        "subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("phone", sa.String(30), nullable=False),
        sa.Column("amount_paid", sa.Numeric(12, 2), nullable=False),
        sa.Column("discount_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("subscribed_at", sa.Date(), nullable=False),
        sa.Column("source", sa.String(20), nullable=True),
        sa.Column("lead_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("crm_leads.id", ondelete="SET NULL"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_subscriptions_phone", "subscriptions", ["phone"])
    op.create_index("ix_subscriptions_subscribed_at", "subscriptions", ["subscribed_at"])

    op.create_table(
        "ad_campaigns",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("platform", sa.String(20), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("objective", sa.String(100), nullable=True),
        sa.Column("spend", sa.Numeric(12, 2), nullable=False),
        sa.Column("results_count", sa.Integer(), nullable=True),
        sa.Column("results_label", sa.String(100), nullable=True),
        sa.Column("counts_as_leads", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("impressions", sa.Integer(), nullable=True),
        sa.Column("clicks", sa.Integer(), nullable=True),
        sa.Column("period_start", sa.Date(), nullable=True),
        sa.Column("period_end", sa.Date(), nullable=True),
        sa.Column("period_label", sa.String(100), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_ad_campaigns_platform", "ad_campaigns", ["platform"])

    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("value", sa.Text(), nullable=True),
    )

    subs = sa.table(
        "subscriptions",
        sa.column("id", postgresql.UUID(as_uuid=True)), sa.column("full_name", sa.String),
        sa.column("phone", sa.String), sa.column("amount_paid", sa.Numeric),
        sa.column("discount_amount", sa.Numeric), sa.column("subscribed_at", sa.Date),
        sa.column("notes", sa.Text),
    )
    op.bulk_insert(subs, [
        {
            "id": uuid.uuid4(), "full_name": n, "phone": p,
            "amount_paid": Decimal(paid), "discount_amount": Decimal(disc),
            "subscribed_at": SEED_DATE,
            "notes": "تاريخ الاشتراك والمصدر مؤقتان - يرجى التعديل",
        }
        for n, p, paid, disc in SUBSCRIBERS
    ])

    camps = sa.table(
        "ad_campaigns",
        sa.column("id", postgresql.UUID(as_uuid=True)), sa.column("platform", sa.String),
        sa.column("name", sa.String), sa.column("objective", sa.String),
        sa.column("spend", sa.Numeric), sa.column("results_count", sa.Integer),
        sa.column("results_label", sa.String), sa.column("counts_as_leads", sa.Boolean),
        sa.column("clicks", sa.Integer), sa.column("period_label", sa.String),
    )
    op.bulk_insert(camps, [
        {
            "id": uuid.uuid4(), "platform": plat, "name": name, "objective": obj,
            "spend": Decimal(spend), "results_count": cnt, "results_label": label,
            "counts_as_leads": leads, "clicks": clicks, "period_label": PERIOD_LABEL,
        }
        for plat, name, obj, spend, cnt, label, leads, clicks in CAMPAIGNS
    ])


def downgrade() -> None:
    op.drop_table("app_settings")
    op.drop_index("ix_ad_campaigns_platform", table_name="ad_campaigns")
    op.drop_table("ad_campaigns")
    op.drop_index("ix_subscriptions_subscribed_at", table_name="subscriptions")
    op.drop_index("ix_subscriptions_phone", table_name="subscriptions")
    op.drop_table("subscriptions")
