"""
Ad-platform lead sync service.

Inbound  - SnapLeadIngestor.ingest(): one Snapchat lead-form webhook -> a
           CRM lead in العملاء المحتملون (source = snapchat), or, when the
           phone already belongs to a customer, a new attribution + note on
           that same customer (customers are unique by phone). Idempotent
           on Snap's lead_id, because Snap retries deliveries.
Outbound - queue_conversion(): when a customer is booked / attends /
           subscribes, writes one outbox row per ad platform the customer
           came from (Snapchat, Meta, TikTok - by lead source and lead-form
           attribution), in the CALLER's transaction. schedule_dispatch()
           sends the rows after the commit, in the background, so the
           platform's algorithm learns who really attends and pays while
           customer-service actions never wait on an ad platform.
"""
from __future__ import annotations

import asyncio
import re
import uuid
from datetime import date, datetime, time, timezone
from decimal import Decimal

import httpx
import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit.service import AuditService
from app.core.notifications.service import NotificationService
from app.core.permissions.registry import CRM_LEAD_VIEW_ALL
from app.core.settings.config import get_settings
from app.core.users.models import AccountStatus, Permission, User, role_permissions, user_roles
from app.modules.ad_tracking import snap
from app.modules.ad_tracking.common import EventContext, split_name
from app.modules.ad_tracking.models import AdConversionEvent, ConversionStage, ConversionStatus, LeadAdAttribution
from app.modules.ad_tracking.platforms import ADAPTERS, LEAD_SOURCE_PLATFORM, ready_platforms
from app.modules.crm.leads.models import Lead, LeadStage, LeadStageEvent
from app.modules.marketing.schemas import normalize_phone

logger = structlog.get_logger("app.ad_tracking")
settings = get_settings()

MAX_ATTEMPTS = 6


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def phone_key(raw: str | None) -> str | None:
    """Last 9 digits: 0501234567, 501234567, +966 50 123 4567 all match."""
    digits = re.sub(r"\D", "", raw or "")
    return digits[-9:] if len(digits) >= 9 else None


async def find_lead_by_phone(db: AsyncSession, phone: str) -> Lead | None:
    key = phone_key(phone)
    if not key:
        return None
    stmt = (
        select(Lead)
        .where(func.right(func.regexp_replace(Lead.phone, r"\D", "", "g"), 9) == key)
        .order_by(Lead.created_at)
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _user_by_email(db: AsyncSession, email: str | None) -> User | None:
    if not email or not email.strip():
        return None
    return (
        await db.execute(select(User).where(func.lower(User.email) == email.strip().lower()))
    ).scalar_one_or_none()


# ================================================================ inbound
class SnapLeadIngestor:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _system_user(self) -> User | None:
        user = await _user_by_email(self.db, settings.SNAP_LEADS_SYSTEM_USER_EMAIL)
        if user:
            return user
        return (
            await self.db.execute(
                select(User).where(User.status == AccountStatus.ACTIVE.value).order_by(User.created_at).limit(1)
            )
        ).scalar_one_or_none()

    @staticmethod
    def _summary(d: dict) -> str:
        parts = ["سناب شات"]
        if d.get("campaign_name"):
            parts.append(f"حملة: {d['campaign_name']}")
        if d.get("ad_name"):
            parts.append(f"إعلان: {d['ad_name']}")
        if d.get("form_name"):
            parts.append(f"فورم: {d['form_name']}")
        if d.get("custom"):
            parts.append(" | ".join(d["custom"].values()))
        return " — ".join(parts)[:2000]

    async def _notify(self, lead: Lead, created: bool) -> None:
        if lead.assigned_to:
            recipients = [lead.assigned_to]
        else:
            stmt = (
                select(User.id)
                .join(user_roles, user_roles.c.user_id == User.id)
                .join(role_permissions, role_permissions.c.role_id == user_roles.c.role_id)
                .join(Permission, Permission.id == role_permissions.c.permission_id)
                .where(Permission.code == CRM_LEAD_VIEW_ALL, User.status == AccountStatus.ACTIVE.value)
                .distinct()
                .limit(25)
            )
            recipients = list((await self.db.execute(stmt)).scalars().all())
        title = "عميل محتمل جديد من سناب شات" if created else "عميل حالي سجّل مرة أخرى من سناب شات"
        notifier = NotificationService(self.db)
        for uid in recipients:
            await notifier.create(
                user_id=uid, event_type="crm.lead.snapchat", title=title,
                body=f"{lead.full_name} — {lead.phone}", resource_type="Lead", resource_id=str(lead.id),
            )

    async def ingest(self, payload: dict) -> dict:
        d = snap.parse_lead(payload)
        ext_id = d["lead_id"]
        if not ext_id:
            return {"result": "ignored", "reason": "missing lead_id"}
        dup = (
            await self.db.execute(
                select(LeadAdAttribution.lead_id).where(
                    LeadAdAttribution.platform == snap.PLATFORM, LeadAdAttribution.external_lead_id == ext_id
                )
            )
        ).scalar_one_or_none()
        if dup:
            return {"result": "duplicate", "lead_id": str(dup)}
        try:
            phone = normalize_phone(d["phone"] or "")
        except ValueError:
            # a lead = name + phone; a form without a phone is not a lead
            logger.warning("snap_lead_without_phone", external_lead_id=ext_id)
            return {"result": "ignored", "reason": "missing phone"}

        system_user = await self._system_user()
        if system_user is None:
            raise RuntimeError("no active user to own webhook leads")

        now = _utcnow()
        lead = await find_lead_by_phone(self.db, phone)
        created = lead is None
        summary = self._summary(d)
        if created:
            assignee = await _user_by_email(self.db, settings.SNAP_LEADS_DEFAULT_ASSIGNEE_EMAIL)
            lead = Lead(
                full_name=(d["name"] or "عميل سناب شات")[:200],
                phone=phone,
                source=snap.PLATFORM,
                stage=LeadStage.NEW.value,
                notes=summary,
                assigned_to=assignee.id if assignee else None,
                created_by=system_user.id,
            )
            self.db.add(lead)
            await self.db.flush()
            note = f"تسجيل تلقائي من فورم سناب شات — {summary}"
        else:
            if not lead.source:
                lead.source = snap.PLATFORM
            note = f"سجّل مرة أخرى من فورم سناب شات — {summary}"
        self.db.add(LeadStageEvent(lead_id=lead.id, stage=lead.stage, performed_by=system_user.id, note=note[:2000], created_at=now))
        self.db.add(
            LeadAdAttribution(
                lead_id=lead.id, platform=snap.PLATFORM, external_lead_id=ext_id,
                form_id=d["form_id"], form_name=d["form_name"], ad_account_id=d["ad_account_id"],
                campaign_id=d["campaign_id"], campaign_name=d["campaign_name"],
                ad_squad_id=d["ad_squad_id"], ad_squad_name=d["ad_squad_name"],
                ad_id=d["ad_id"], ad_name=d["ad_name"], submitted_at=d["submitted_at"], raw=payload,
            )
        )
        await AuditService(self.db).record(
            user_id=system_user.id, action="crm_lead.snap_webhook", resource_type="Lead", resource_id=str(lead.id),
            new_value={"external_lead_id": ext_id, "created": created, "campaign": d["campaign_name"], "ad": d["ad_name"]},
        )
        await self._notify(lead, created)
        await self.db.commit()
        return {"result": "created" if created else "linked", "lead_id": str(lead.id)}


# =============================================================== outbound
async def lead_platforms(db: AsyncSession, lead: Lead) -> set[str]:
    """Ad platforms this customer came from: their CRM source plus any
    platform that delivered them through a lead form."""
    out: set[str] = set()
    if lead.source in LEAD_SOURCE_PLATFORM:
        out.add(LEAD_SOURCE_PLATFORM[lead.source])
    rows = (
        await db.execute(select(LeadAdAttribution.platform).where(LeadAdAttribution.lead_id == lead.id).distinct())
    ).scalars().all()
    out.update(p for p in rows if p in ADAPTERS)
    return out


async def queue_conversion(
    db: AsyncSession, lead: Lead | None, stage: ConversionStage, *,
    value: Decimal | None = None, ref: uuid.UUID | str | None = None, when: datetime | None = None,
) -> bool:
    """Add outbox rows (no commit - they ride on the caller's transaction).
    Never raises: a tracking problem must not fail a pipeline action.
    Returns True when at least one event was queued."""
    if lead is None:
        return False
    ready = set(ready_platforms())
    if not ready:
        return False
    queued = 0
    try:
        async with db.begin_nested():  # savepoint: a DB error here can't poison the caller's transaction
            for platform in sorted(await lead_platforms(db, lead) & ready):
                name = ADAPTERS[platform].event_name(stage.value)
                if not name:
                    continue
                event_id = f"{platform}:{stage.value}:{ref or lead.id}"
                exists = (
                    await db.execute(select(AdConversionEvent.id).where(AdConversionEvent.event_id == event_id))
                ).scalar_one_or_none()
                if exists:
                    continue
                db.add(
                    AdConversionEvent(
                        lead_id=lead.id, platform=platform, stage=stage.value, event_name=name,
                        event_id=event_id, event_time=when or _utcnow(), value=value,
                        currency=settings.DEFAULT_CURRENCY if value is not None else None,
                        status=ConversionStatus.PENDING.value, attempts=0,
                    )
                )
                queued += 1
    except Exception as err:  # noqa: BLE001
        logger.warning("ads_queue_failed", lead_id=str(lead.id), stage=stage.value, error=str(err))
        return False
    return queued > 0


def purchase_time(subscribed_at: date) -> datetime:
    today = datetime.now(timezone.utc).date()
    if subscribed_at >= today:
        return _utcnow()
    return datetime.combine(subscribed_at, time(12, 0), tzinfo=timezone.utc)


async def _latest_attribution(db: AsyncSession, lead_id: uuid.UUID, platform: str) -> LeadAdAttribution | None:
    return (
        await db.execute(
            select(LeadAdAttribution)
            .where(LeadAdAttribution.lead_id == lead_id, LeadAdAttribution.platform == platform)
            .order_by(LeadAdAttribution.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


def _matchable_phone(raw: str | None) -> str | None:
    try:
        return normalize_phone(raw or "")
    except ValueError:
        return None


async def context_for(db: AsyncSession, lead: Lead, *, platform: str, event_name: str, event_id: str,
                      event_time: datetime, value: Decimal | None = None, currency: str | None = None) -> EventContext:
    attr = await _latest_attribution(db, lead.id, platform)
    email = None
    if attr and isinstance(attr.raw, dict):
        email = (str(attr.raw.get("email") or "")).strip() or None
    first, last = split_name(lead.full_name)
    return EventContext(
        event_name=event_name, event_id=event_id, event_time=event_time,
        phone_e164=_matchable_phone(lead.phone), email=email, first_name=first, last_name=last,
        external_lead_id=attr.external_lead_id if attr else None, value=value, currency=currency,
    )


async def dispatch_pending(*, limit: int = 50) -> dict:
    """Send pending / failed outbox rows of every configured platform. Rows
    are claimed with FOR UPDATE SKIP LOCKED so two workers never send the
    same event."""
    from app.database.session import AsyncSessionLocal

    summary = {"sent": 0, "failed": 0, "gave_up": 0}
    ready = ready_platforms()
    if not ready:
        return summary
    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(AdConversionEvent)
                .where(
                    AdConversionEvent.platform.in_(ready),
                    AdConversionEvent.status.in_([ConversionStatus.PENDING.value, ConversionStatus.FAILED.value]),
                )
                .order_by(AdConversionEvent.created_at)
                .limit(limit)
                .with_for_update(skip_locked=True)
            )
        ).scalars().all()
        for row in rows:
            adapter = ADAPTERS[row.platform]
            row.attempts += 1
            lead = await db.get(Lead, row.lead_id) if row.lead_id else None
            event = None
            if lead is not None:
                ctx = await context_for(
                    db, lead, platform=row.platform, event_name=row.event_name, event_id=row.event_id,
                    event_time=row.event_time, value=row.value, currency=row.currency,
                )
                event = adapter.build_event(ctx)
            if event is None:
                row.status = ConversionStatus.GAVE_UP.value
                row.last_error = "no matchable identifier (phone/email) or lead deleted"
                summary["gave_up"] += 1
                continue
            row.payload = {"data": [event]}
            try:
                code, body = await adapter.send_events([event])
            except httpx.HTTPError as err:
                code, body = None, f"{type(err).__name__}: {err}"
            row.response_code = code
            if adapter.is_success(code, body):
                row.status = ConversionStatus.SENT.value
                row.sent_at = _utcnow()
                row.last_error = None
                summary["sent"] += 1
            else:
                row.status = (ConversionStatus.GAVE_UP if row.attempts >= MAX_ATTEMPTS else ConversionStatus.FAILED).value
                row.last_error = str(body)[:2000]
                summary["failed"] += 1
                logger.warning("ads_event_rejected", platform=row.platform, event_id=row.event_id, code=code)
        await db.commit()
    return summary


_running: set[asyncio.Task] = set()


def schedule_dispatch() -> None:
    """Fire-and-forget send of the outbox (call AFTER the commit)."""
    if not ready_platforms():
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return

    async def _run() -> None:
        try:
            await dispatch_pending()
        except Exception as err:  # noqa: BLE001
            logger.warning("ads_dispatch_failed", error=str(err))

    task = loop.create_task(_run())
    _running.add(task)
    task.add_done_callback(_running.discard)
