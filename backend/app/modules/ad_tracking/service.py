"""
Ad-platform lead sync service.

Inbound leads (every platform) live in inbound.py; this module holds the
shared lookups and the outbound side:
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

from app.core.settings.config import get_settings
from app.core.users.models import User
from app.modules.ad_tracking.common import EventContext, split_name
from app.modules.ad_tracking.models import AdConversionEvent, ConversionStage, ConversionStatus, LeadAdAttribution
from app.modules.ad_tracking.platforms import ADAPTERS, LEAD_SOURCE_PLATFORM, ready_platforms
from app.modules.crm.leads.models import Lead
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
