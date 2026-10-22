"""
Ad-platform integration endpoints.

Public (called by the platforms, no login) - leads land in العملاء المحتملون:
    POST /api/integrations/snap/webhook/{SNAP_WEBHOOK_TOKEN}      Snapchat lead forms
    GET|POST /api/integrations/meta/webhook                       Meta lead ads (Page "leadgen")
    POST /api/integrations/leads/{platform}/{ADS_LEADS_WEBHOOK_TOKEN}
                                                                  any platform via Zapier / Make
                                                                  (TikTok lead forms), flexible JSON
Secrets: unknown path token -> 404; Snap / Meta signatures are checked
when their secret is configured.

Admin (settings.manage) - every platform (snapchat / meta / tiktok):
    GET  /api/integrations/ads/status        configuration + outbox health
    POST /api/integrations/ads/dispatch      send / retry the outbox now
    POST /api/integrations/ads/test-event    one TEST event to a platform
                                             (Snap /validate, Meta & TikTok test_event_code)
    POST /api/integrations/ads/sync-leads    pull Meta lead-form leads now (also runs every few minutes)
"""
from __future__ import annotations

import hmac
import json
import uuid
from datetime import datetime, timezone
from typing import Literal

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import SETTINGS_MANAGE
from app.core.settings.config import get_settings
from app.database.session import get_db
from app.modules.ad_tracking import meta_leads, snap
from app.modules.ad_tracking.inbound import LeadIngestor, NormalizedLead, from_generic, from_snap
from app.modules.ad_tracking.sync import sync_meta_leads
from app.modules.ad_tracking.common import EventContext
from app.modules.ad_tracking.models import AdConversionEvent, ConversionStage, ConversionStatus, LeadAdAttribution
from app.modules.ad_tracking.platforms import ADAPTERS, LABELS
from app.modules.ad_tracking.service import (
    _matchable_phone,
    context_for,
    dispatch_pending,
    schedule_dispatch,
)
from app.modules.crm.leads.models import Lead

logger = structlog.get_logger("app.ad_tracking.routes")
settings = get_settings()

router = APIRouter(prefix="/integrations/snap", tags=["integrations-snap"])
meta_router = APIRouter(prefix="/integrations/meta", tags=["integrations-meta"])
leads_router = APIRouter(prefix="/integrations/leads", tags=["integrations-leads"])
ads_router = APIRouter(prefix="/integrations/ads", tags=["integrations-ads"])


async def _ingest_all(db: AsyncSession, leads: list[NormalizedLead]) -> tuple[list[dict], int]:
    """Save every lead; a duplicate delivery is a no-op, one bad lead never blocks the rest."""
    results, errors = [], 0
    for n in leads:
        try:
            results.append(await LeadIngestor(db).ingest(n))
        except IntegrityError:  # the same lead delivered twice at the same moment
            await db.rollback()
            results.append({"result": "duplicate"})
        except Exception as err:  # noqa: BLE001
            await db.rollback()
            errors += 1
            logger.exception("lead_ingest_failed", platform=n.platform, error=str(err))
            results.append({"result": "error"})
    return results, errors


def _check_token(token: str) -> None:
    expected = settings.SNAP_WEBHOOK_TOKEN
    if not expected or not hmac.compare_digest(token.encode(), expected.encode()):
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/webhook/{token}", include_in_schema=False)
async def webhook_check(token: str):
    _check_token(token)
    return {"ok": True}


@router.post("/webhook/{token}", include_in_schema=False)
async def snap_lead_webhook(token: str, request: Request, db: AsyncSession = Depends(get_db)):
    _check_token(token)
    body = await request.body()
    if settings.SNAP_WEBHOOK_HMAC_SECRET:
        verdict = snap.verify_signature(request.headers, body, settings.SNAP_WEBHOOK_HMAC_SECRET)
        if verdict is False:
            logger.warning("snap_webhook_bad_signature")
            raise HTTPException(status_code=401, detail="Invalid signature")
        if verdict is None:
            logger.info("snap_webhook_unsigned")
    try:
        payload = json.loads(body or b"{}")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    results, errors = await _ingest_all(db, [from_snap(item) for item in snap.extract_leads(payload)])
    schedule_dispatch()  # also retries any earlier failed conversion events
    if errors:
        # a 5xx makes Snap retry; leads already saved are skipped as duplicates
        raise HTTPException(status_code=500, detail="Some leads could not be saved")
    logger.info("snap_webhook_ok", results=[r.get("result") for r in results])
    return {"received": len(results), "results": results}


# ------------------------------------------------------------------ meta
@meta_router.get("/webhook", include_in_schema=False)
async def meta_webhook_verify(
    mode: str | None = Query(default=None, alias="hub.mode"),
    verify_token: str | None = Query(default=None, alias="hub.verify_token"),
    challenge: str | None = Query(default=None, alias="hub.challenge"),
):
    expected = settings.META_WEBHOOK_VERIFY_TOKEN
    if mode == "subscribe" and expected and verify_token and hmac.compare_digest(verify_token, expected):
        return PlainTextResponse(challenge or "")
    raise HTTPException(status_code=403, detail="Verification failed")


@meta_router.post("/webhook", include_in_schema=False)
async def meta_lead_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.body()
    verdict = meta_leads.verify_signature(request.headers, body)
    if verdict is False:
        logger.warning("meta_webhook_bad_signature")
        raise HTTPException(status_code=401, detail="Invalid signature")
    if verdict is None and not settings.META_WEBHOOK_VERIFY_TOKEN:
        raise HTTPException(status_code=404, detail="Not found")
    try:
        payload = json.loads(body or b"{}")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    leads = []
    for leadgen_id in meta_leads.webhook_lead_ids(payload):
        try:
            leads.append(await meta_leads.fetch_lead(leadgen_id))
        except Exception as err:  # noqa: BLE001 - the periodic sync picks it up later
            logger.warning("meta_lead_fetch_failed", leadgen_id=leadgen_id, error=str(err))
    results, _ = await _ingest_all(db, leads)
    # always 200: a lead that failed here is retried by the periodic sync, not by Meta
    return {"received": len(results), "results": results}


# ------------------------------------------------------- generic (TikTok via Zapier / Make)
@leads_router.post("/{platform}/{token}", include_in_schema=False)
async def generic_lead_webhook(platform: str, token: str, request: Request, db: AsyncSession = Depends(get_db)):
    expected = settings.ADS_LEADS_WEBHOOK_TOKEN
    if not expected or not hmac.compare_digest(token.encode(), expected.encode()):
        raise HTTPException(status_code=404, detail="Not found")
    if platform not in ("tiktok", "meta", "snapchat"):
        raise HTTPException(status_code=404, detail="Unknown platform")
    try:
        payload = json.loads(await request.body() or b"{}")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    items = payload if isinstance(payload, list) else (payload.get("leads") if isinstance(payload, dict) and isinstance(payload.get("leads"), list) else [payload])
    results, errors = await _ingest_all(db, [from_generic(i, platform) for i in items if isinstance(i, dict)])
    if errors:
        raise HTTPException(status_code=500, detail="Some leads could not be saved")
    return {"received": len(results), "results": results}


# ------------------------------------------------------------------ admin
@ads_router.get("/status")
async def ads_status(
    user: CurrentUser = Depends(require_permission(SETTINGS_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    counts: dict[str, dict[str, int]] = {p: {s.value: 0 for s in ConversionStatus} for p in ADAPTERS}
    for platform, st, n in (
        await db.execute(
            select(AdConversionEvent.platform, AdConversionEvent.status, func.count(AdConversionEvent.id))
            .group_by(AdConversionEvent.platform, AdConversionEvent.status)
        )
    ).all():
        counts.setdefault(platform, {})[st] = n
    leads_by_platform = dict(
        (await db.execute(select(LeadAdAttribution.platform, func.count(LeadAdAttribution.id)).group_by(LeadAdAttribution.platform))).all()
    )
    last_lead = (await db.execute(select(func.max(LeadAdAttribution.created_at)))).scalar()
    recent = (
        await db.execute(select(AdConversionEvent).order_by(AdConversionEvent.created_at.desc()).limit(30))
    ).scalars().all()
    return {
        "inbound": {
            "snapchat_webhook": {"configured": bool(settings.SNAP_WEBHOOK_TOKEN), "signature_check": bool(settings.SNAP_WEBHOOK_HMAC_SECRET)},
            "meta": {"webhook": bool(settings.META_WEBHOOK_VERIFY_TOKEN), "signature_check": bool(settings.META_APP_SECRET),
                     "sync": meta_leads.leads_ready() and bool(settings.META_PAGE_ID), "poll_minutes": settings.META_LEADS_POLL_MINUTES},
            "generic_webhook": bool(settings.ADS_LEADS_WEBHOOK_TOKEN),
            "leads_received": leads_by_platform,
            "last_lead_at": last_lead,
        },
        "platforms": [
            {
                "platform": p, "label": LABELS[p], "ready": a.ready(),
                "events": {s.value: a.event_name(s.value) or None for s in ConversionStage},
                "outbox": counts.get(p, {}),
            }
            for p, a in ADAPTERS.items()
        ],
        "recent_events": [
            {
                "platform": r.platform, "event_id": r.event_id, "stage": r.stage, "event_name": r.event_name,
                "status": r.status, "attempts": r.attempts, "response_code": r.response_code,
                "last_error": r.last_error, "created_at": r.created_at, "sent_at": r.sent_at,
            }
            for r in recent
        ],
    }


@ads_router.post("/dispatch")
async def ads_dispatch(
    retry_gave_up: bool = False,
    user: CurrentUser = Depends(require_permission(SETTINGS_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    if retry_gave_up:
        await db.execute(
            update(AdConversionEvent)
            .where(AdConversionEvent.status == ConversionStatus.GAVE_UP.value)
            .values(status=ConversionStatus.FAILED.value, attempts=0)
        )
        await db.commit()
    return await dispatch_pending(limit=200)


class TestEventRequest(BaseModel):
    platform: Literal["snapchat", "meta", "tiktok"]
    stage: ConversionStage = ConversionStage.ATTENDED
    lead_id: uuid.UUID | None = None
    phone: str | None = None


@ads_router.post("/test-event")
async def ads_test_event(
    payload: TestEventRequest,
    user: CurrentUser = Depends(require_permission(SETTINGS_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Sends ONE test event and returns the platform's answer - use it to
    confirm the token, pixel and event names before going live. Snap:
    /events/validate; Meta / TikTok: test_event_code (shows only under
    "Test events", never counted in reporting). Nothing is stored here."""
    adapter = ADAPTERS[payload.platform]
    name = adapter.event_name(payload.stage.value)
    if not name:
        raise HTTPException(status_code=409, detail=f"No event name configured for {payload.stage.value}")
    now = datetime.now(timezone.utc)
    event_id = f"test:{uuid.uuid4()}"
    value = 1 if payload.stage == ConversionStage.PURCHASE else None
    if payload.lead_id:
        lead = await db.get(Lead, payload.lead_id)
        if lead is None:
            raise HTTPException(status_code=404, detail="Lead not found")
        ctx = await context_for(db, lead, platform=payload.platform, event_name=name, event_id=event_id,
                                event_time=now, value=value, currency=settings.DEFAULT_CURRENCY)
    else:
        ctx = EventContext(event_name=name, event_id=event_id, event_time=now,
                           phone_e164=_matchable_phone(payload.phone or "0500000000"),
                           value=value, currency=settings.DEFAULT_CURRENCY)
    event = adapter.build_event(ctx)
    try:
        code, body = await adapter.send_events([event], validate_only=True)
    except httpx.HTTPError as err:
        raise HTTPException(status_code=502, detail=f"Could not reach {payload.platform}: {err}")
    return {"ok": adapter.is_success(code, body), "status_code": code, "response": body, "event_sent": event}


@ads_router.post("/sync-leads")
async def ads_sync_leads(user: CurrentUser = Depends(require_permission(SETTINGS_MANAGE))):
    """Pull Meta lead-form leads now (the same job runs every META_LEADS_POLL_MINUTES)."""
    return await sync_meta_leads()
