"""Periodic pull of Meta lead-form leads (safety net next to the webhook).

Runs inside the API process: one background loop per worker, but a Postgres
advisory lock makes only one of them sync at a time; leads already saved are
skipped by (platform, lead id), so overlapping windows cost nothing.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import structlog
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.core.settings.config import get_settings
from app.modules.ad_tracking import meta_leads
from app.modules.ad_tracking.inbound import LeadIngestor

logger = structlog.get_logger("app.ad_tracking.sync")
settings = get_settings()

_LOCK_ID = 84512001
_SETTING_KEY = "meta_leads_last_sync"
_tasks: set[asyncio.Task] = set()


async def sync_meta_leads() -> dict:
    from app.database.session import AsyncSessionLocal
    from app.modules.marketing.models import AppSetting

    summary = {"fetched": 0, "created": 0, "linked": 0, "duplicate": 0, "ignored": 0, "errors": 0}
    if not meta_leads.leads_ready() or not settings.META_PAGE_ID:
        return {**summary, "skipped": "META_LEADS_ENABLED / META_PAGE_ID / META_PAGE_ACCESS_TOKEN not set"}
    async with AsyncSessionLocal() as db:
        if not (await db.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": _LOCK_ID})).scalar():
            return {**summary, "skipped": "another worker is syncing"}
        try:
            row = await db.get(AppSetting, _SETTING_KEY)
            last = datetime.fromisoformat(row.value) if row and row.value else None
            started = datetime.now(timezone.utc)
            leads = await meta_leads.list_recent_leads(meta_leads.default_since(last))
            summary["fetched"] = len(leads)
            for n in leads:
                try:
                    r = await LeadIngestor(db).ingest(n)
                    summary[r["result"]] = summary.get(r["result"], 0) + 1
                except IntegrityError:
                    await db.rollback()
                    summary["duplicate"] += 1
                except Exception as err:  # noqa: BLE001 - one bad lead must not stop the rest
                    await db.rollback()
                    summary["errors"] += 1
                    logger.warning("meta_lead_ingest_failed", error=str(err))
            row = await db.get(AppSetting, _SETTING_KEY)
            if row is None:
                db.add(AppSetting(key=_SETTING_KEY, value=started.isoformat()))
            else:
                row.value = started.isoformat()
            await db.commit()
        finally:
            await db.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _LOCK_ID})
            await db.commit()
    if summary["created"] or summary["linked"]:
        logger.info("meta_leads_synced", **summary)
    return summary


async def _loop() -> None:
    await asyncio.sleep(30)  # let the app finish starting
    while True:
        try:
            await sync_meta_leads()
        except Exception as err:  # noqa: BLE001
            logger.warning("meta_leads_sync_failed", error=str(err))
        await asyncio.sleep(max(settings.META_LEADS_POLL_MINUTES, 1) * 60)


def start_background_sync() -> None:
    """Called once per worker at startup; no-op unless Meta lead sync is configured."""
    if not (meta_leads.leads_ready() and settings.META_PAGE_ID and settings.META_LEADS_POLL_MINUTES > 0):
        return
    task = asyncio.get_running_loop().create_task(_loop())
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
