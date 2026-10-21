"""
Snapchat: lead-form webhook parsing + signature check, and the Conversions
API v3 adapter used to report CRM progress back to Snap.

Webhook (Snap -> us): Snap POSTs one flat JSON object per lead-form
submission. Always present: lead_id, form_id, form_name, ad_account_id,
campaign_id/_name, ad_squad_id/_name, ad_id/_name, create_time (ms, as a
string). Present when the form asks for them: first_name, last_name,
phone_number, email, custom_field_1..8, ... All values are strings.
Signature: HMAC-SHA256(hmacSecret, "<t header>.<raw body>") in a
Signature header (hmacSecret is returned when the webhook integration is
created and is shared by every integration of the ad account).

Conversions API (us -> Snap):
    POST https://tr.snapchat.com/v3/{PIXEL_ID}/events?access_token=TOKEN
    {"data": [{"event_name", "action_source": "OFFLINE", "event_time",
               "event_id", "user_data": {"ph": [sha256]}, "custom_data"}]}
    POST .../events/validate  -> same payload, validated only (test).
"""
from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timezone
from typing import Any, Mapping

import httpx

from app.core.settings.config import get_settings
from app.modules.ad_tracking.common import EventContext, sha256

settings = get_settings()

CAPI_BASE = "https://tr.snapchat.com/v3"
PLATFORM = "snapchat"

_SIG_HEADERS = ("x-snap-signature", "x-snapchat-signature", "snap-signature", "signature", "x-signature")
_TS_HEADERS = ("t", "x-snap-timestamp", "x-snapchat-timestamp", "timestamp", "x-timestamp")

_FIELDS = (
    "lead_id", "form_id", "form_name", "ad_account_id", "campaign_id", "campaign_name",
    "ad_squad_id", "ad_squad_name", "ad_id", "ad_name", "first_name", "last_name",
    "email", "phone_number", "create_time",
)


# --------------------------------------------------------------- webhook
def verify_signature(headers: Mapping[str, str], body: bytes, secret: str) -> bool | None:
    """True = valid, False = signature present but wrong (or no timestamp),
    None = the request carries no signature header at all."""
    sig = next((headers.get(h) for h in _SIG_HEADERS if headers.get(h)), None)
    if not sig:
        return None
    ts = next((headers.get(h) for h in _TS_HEADERS if headers.get(h)), None)
    candidates = [sig.strip()]
    if "," in sig and "t=" in sig:  # "t=<ts>,v1=<hex>" style header
        parts = dict(p.strip().split("=", 1) for p in sig.split(",") if "=" in p)
        ts = parts.pop("t", ts)
        candidates = list(parts.values())
    if not ts:
        return False
    expected = hmac.new(secret.encode("utf-8"), ts.encode("utf-8") + b"." + body, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, c.strip().lower()) for c in candidates)


def extract_leads(payload: Any) -> list[dict]:
    """The webhook body is one flat lead object; also accept a list of them
    or a {"data"/"leads": ...} wrapper so a format change doesn't drop leads."""
    if isinstance(payload, list):
        return [p for p in payload if isinstance(p, dict)]
    if isinstance(payload, dict):
        for key in ("leads", "data"):
            inner = payload.get(key)
            if isinstance(inner, (list, dict)) and "lead_id" not in payload:
                return extract_leads(inner)
        return [payload]
    return []


def _s(p: dict, key: str) -> str | None:
    v = p.get(key)
    if v is None:
        return None
    v = str(v).strip()
    return v or None


def parse_lead(p: dict) -> dict:
    name = " ".join(x for x in (_s(p, "first_name"), _s(p, "last_name")) if x) or _s(p, "full_name") or _s(p, "name")
    submitted = None
    ts = _s(p, "create_time")
    if ts and ts.isdigit():
        v = int(ts)
        submitted = datetime.fromtimestamp(v / 1000 if v > 10**11 else v, tz=timezone.utc)
    custom = {k: _s(p, k) for k in sorted(p) if k.startswith("custom_field") and _s(p, k)}
    out = {k: _s(p, k) for k in _FIELDS}
    out.update({"name": name, "phone": _s(p, "phone_number") or _s(p, "phone"), "submitted_at": submitted, "custom": custom})
    return out


# ------------------------------------------------------- adapter interface
def ready() -> bool:
    return settings.snap_capi_ready()


def event_name(stage: str) -> str:
    name = {"booked": settings.SNAP_EVENT_BOOKED, "attended": settings.SNAP_EVENT_ATTENDED,
            "purchase": settings.SNAP_EVENT_PURCHASE}.get(stage, "")
    return (name or "").strip().upper()


def build_event(c: EventContext) -> dict | None:
    user_data: dict[str, Any] = {}
    if c.phone_e164:
        user_data["ph"] = [sha256(c.phone_e164)]
    if c.email:
        user_data["em"] = [sha256(c.email)]
    if not user_data:
        return None
    if c.external_lead_id and settings.SNAP_CAPI_SEND_LEAD_ID:
        user_data["lead_id"] = c.external_lead_id
    event: dict[str, Any] = {
        "event_name": c.event_name,
        "action_source": "OFFLINE",
        "event_time": int(c.event_time.timestamp()),
        "event_id": c.event_id,
        "user_data": user_data,
    }
    if c.value is not None:
        event["custom_data"] = {"currency": c.currency or "SAR", "value": f"{c.value:.2f}"}
    return event


def is_success(status_code: int | None, body: Any) -> bool:
    if status_code is None or not 200 <= status_code < 300:
        return False
    if isinstance(body, dict) and str(body.get("status", "")).upper() in ("INVALID", "FAILED", "ERROR"):
        return False
    return True


async def send_events(events: list[dict], *, validate_only: bool = False) -> tuple[int | None, Any]:
    url = f"{CAPI_BASE}/{settings.SNAP_PIXEL_ID}/events" + ("/validate" if validate_only else "")
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, params={"access_token": settings.SNAP_CAPI_TOKEN}, json={"data": events})
    try:
        body = resp.json()
    except ValueError:
        body = resp.text[:2000]
    return resp.status_code, body
