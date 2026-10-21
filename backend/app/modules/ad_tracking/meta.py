"""
Meta (Facebook / Instagram) Conversions API adapter - CRM lead events.

    POST https://graph.facebook.com/{version}/{PIXEL_ID}/events?access_token=TOKEN
    {"data": [{"event_name", "event_time", "event_id",
               "action_source": "system_generated",
               "user_data": {"ph": [sha256], "fn", "ln", "country", "lead_id"},
               "custom_data": {"event_source": "crm", "lead_event_source": ...,
                               "value", "currency"}}],
     "test_event_code": "..."}            <- only for test events

action_source "system_generated" + custom_data.event_source "crm" is how
Meta recognises CRM lead-stage events (what Conversion Leads optimisation
learns from). Identifiers are SHA-256 of the normalised value; phone =
digits with country code, no "+".
"""
from __future__ import annotations

from typing import Any

import httpx

from app.core.settings.config import get_settings
from app.modules.ad_tracking.common import EventContext, sha256

settings = get_settings()

PLATFORM = "meta"


def ready() -> bool:
    return bool(settings.META_CAPI_ENABLED and settings.META_PIXEL_ID and settings.META_CAPI_TOKEN)


def event_name(stage: str) -> str:
    name = {"booked": settings.META_EVENT_BOOKED, "attended": settings.META_EVENT_ATTENDED,
            "purchase": settings.META_EVENT_PURCHASE}.get(stage, "")
    return (name or "").strip()


def build_event(c: EventContext) -> dict | None:
    user_data: dict[str, Any] = {}
    if c.phone_e164:
        user_data["ph"] = [sha256(c.phone_e164)]
    if c.email:
        user_data["em"] = [sha256(c.email)]
    if not user_data:
        return None
    if c.first_name:
        user_data["fn"] = [sha256(c.first_name)]
    if c.last_name:
        user_data["ln"] = [sha256(c.last_name)]
    user_data["country"] = [sha256("sa")]
    if c.external_lead_id and c.external_lead_id.isdigit():
        user_data["lead_id"] = int(c.external_lead_id)
    custom: dict[str, Any] = {"event_source": "crm", "lead_event_source": settings.ADS_LEAD_EVENT_SOURCE}
    if c.value is not None:
        custom.update(value=float(c.value), currency=c.currency or "SAR")
    return {
        "event_name": c.event_name,
        "event_time": int(c.event_time.timestamp()),
        "event_id": c.event_id,
        "action_source": "system_generated",
        "user_data": user_data,
        "custom_data": custom,
    }


def is_success(status_code: int | None, body: Any) -> bool:
    if status_code is None or not 200 <= status_code < 300:
        return False
    if isinstance(body, dict):
        try:
            return int(body.get("events_received", 0)) >= 1
        except (TypeError, ValueError):
            return False
    return False


async def send_events(events: list[dict], *, validate_only: bool = False) -> tuple[int | None, Any]:
    url = f"https://graph.facebook.com/{settings.META_API_VERSION}/{settings.META_PIXEL_ID}/events"
    body: dict[str, Any] = {"data": events}
    if validate_only:
        body["test_event_code"] = settings.META_TEST_EVENT_CODE or "TEST00000"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, params={"access_token": settings.META_CAPI_TOKEN}, json=body)
    try:
        data = resp.json()
    except ValueError:
        data = resp.text[:2000]
    return resp.status_code, data
