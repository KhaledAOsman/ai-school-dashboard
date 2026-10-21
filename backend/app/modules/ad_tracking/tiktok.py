"""
TikTok Events API (v1.3) adapter.

    POST https://business-api.tiktok.com/open_api/v1.3/event/track/
    Header: Access-Token: TOKEN
    {"event_source": "web" | "crm" | "offline",
     "event_source_id": <pixel code | CRM / offline event set id>,
     "data": [{"event", "event_time", "event_id",
               "user": {"phone": sha256("+9665..."), "email": sha256},
               "properties": {"value", "currency"},
               "page": {"url"}            <- web source only
               "lead": {"lead_id", "lead_event_source"}   <- crm source only
              }],
     "test_event_code": "..."}            <- only for test events

Phone is hashed in E.164 WITH the leading "+". Success = {"code": 0}.
"""
from __future__ import annotations

from typing import Any

import httpx

from app.core.settings.config import get_settings
from app.modules.ad_tracking.common import EventContext, sha256

settings = get_settings()

PLATFORM = "tiktok"
URL = "https://business-api.tiktok.com/open_api/v1.3/event/track/"


def ready() -> bool:
    return bool(settings.TIKTOK_EVENTS_ENABLED and settings.TIKTOK_EVENT_SOURCE_ID and settings.TIKTOK_ACCESS_TOKEN)


def event_name(stage: str) -> str:
    name = {"booked": settings.TIKTOK_EVENT_BOOKED, "attended": settings.TIKTOK_EVENT_ATTENDED,
            "purchase": settings.TIKTOK_EVENT_PURCHASE}.get(stage, "")
    return (name or "").strip()


def build_event(c: EventContext) -> dict | None:
    user: dict[str, Any] = {}
    if c.phone_e164:
        user["phone"] = sha256("+" + c.phone_e164.lstrip("+"))
    if c.email:
        user["email"] = sha256(c.email)
    if not user:
        return None
    event: dict[str, Any] = {
        "event": c.event_name,
        "event_time": int(c.event_time.timestamp()),
        "event_id": c.event_id,
        "user": user,
        "properties": {},
    }
    if c.value is not None:
        event["properties"] = {"value": float(c.value), "currency": c.currency or "SAR"}
    source = (settings.TIKTOK_EVENT_SOURCE or "web").lower()
    if source == "web" and settings.TIKTOK_PAGE_URL:
        event["page"] = {"url": settings.TIKTOK_PAGE_URL}
    if source == "crm":
        lead: dict[str, Any] = {"lead_event_source": settings.ADS_LEAD_EVENT_SOURCE}
        if c.external_lead_id:
            lead["lead_id"] = c.external_lead_id
        event["lead"] = lead
    return event


def is_success(status_code: int | None, body: Any) -> bool:
    if status_code is None or not 200 <= status_code < 300:
        return False
    return isinstance(body, dict) and body.get("code") == 0


async def send_events(events: list[dict], *, validate_only: bool = False) -> tuple[int | None, Any]:
    body: dict[str, Any] = {
        "event_source": (settings.TIKTOK_EVENT_SOURCE or "web").lower(),
        "event_source_id": settings.TIKTOK_EVENT_SOURCE_ID,
        "data": events,
    }
    if validate_only:
        body["test_event_code"] = settings.TIKTOK_TEST_EVENT_CODE or "TEST00000"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(URL, headers={"Access-Token": settings.TIKTOK_ACCESS_TOKEN}, json=body)
    try:
        data = resp.json()
    except ValueError:
        data = resp.text[:2000]
    return resp.status_code, data
