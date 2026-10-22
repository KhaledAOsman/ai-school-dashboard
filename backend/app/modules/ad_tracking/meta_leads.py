"""
Meta (Facebook / Instagram) lead ads -> CRM.

Two ways in, both idempotent on Meta's lead id:

1. Webhook (real time): a Meta app subscribed to the Page's "leadgen"
   field calls  POST /api/integrations/meta/webhook  with
       {"object": "page", "entry": [{"changes": [{"field": "leadgen",
         "value": {"leadgen_id", "page_id", "form_id", "ad_id", "adgroup_id", "created_time"}}]}]}
   signed with X-Hub-Signature-256: sha256=HMAC(app secret, raw body).
   Meta verifies the URL first with GET ?hub.mode=subscribe&hub.verify_token=..&hub.challenge=..
   The notification carries only ids, so the lead is read with
       GET /{leadgen_id}?fields=...field_data  (Page access token, leads_retrieval).

2. Sync (safety net / no app needed): every few minutes every lead form of
   the Page is read with  GET /{form_id}/leads  filtered on time_created, so a
   missed webhook (or no webhook at all) still lands every lead.
"""
from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping

import httpx
import structlog

from app.core.settings.config import get_settings
from app.modules.ad_tracking.inbound import NormalizedLead, _s, parse_time, split_answers

logger = structlog.get_logger("app.ad_tracking.meta_leads")
settings = get_settings()

PLATFORM = "meta"
_FULL_FIELDS = "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform,field_data"
_BASIC_FIELDS = "id,created_time,ad_id,form_id,field_data"


def leads_ready() -> bool:
    return bool(settings.META_LEADS_ENABLED and settings.META_PAGE_ACCESS_TOKEN)


def _graph(path: str) -> str:
    return f"https://graph.facebook.com/{settings.META_API_VERSION}/{path.lstrip('/')}"


def verify_signature(headers: Mapping[str, str], body: bytes) -> bool | None:
    """True / False, or None when no app secret is configured."""
    if not settings.META_APP_SECRET:
        return None
    sig = headers.get("x-hub-signature-256") or ""
    if not sig.startswith("sha256="):
        return False
    expected = hmac.new(settings.META_APP_SECRET.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig[7:].strip().lower())


def webhook_lead_ids(payload: Any) -> list[str]:
    ids: list[str] = []
    for entry in (payload or {}).get("entry", []) if isinstance(payload, dict) else []:
        for change in entry.get("changes", []) or []:
            if change.get("field") == "leadgen":
                lid = _s((change.get("value") or {}).get("leadgen_id"))
                if lid:
                    ids.append(lid)
    return ids


def parse_lead(d: dict) -> NormalizedLead:
    answers = {}
    for f in d.get("field_data") or []:
        k, vals = _s(f.get("name")), f.get("values") or []
        v = _s(vals)
        if k and v:
            answers[k] = v
    name, phone, email, rest = split_answers(answers)
    return NormalizedLead(
        platform=PLATFORM, external_lead_id=_s(d.get("id")), name=name, phone=phone, email=email,
        form_id=_s(d.get("form_id")), form_name=_s(d.get("form_name")),
        campaign_id=_s(d.get("campaign_id")), campaign_name=_s(d.get("campaign_name")),
        adset_id=_s(d.get("adset_id")), adset_name=_s(d.get("adset_name")),
        ad_id=_s(d.get("ad_id")), ad_name=_s(d.get("ad_name")),
        submitted_at=parse_time(d.get("created_time")), answers=rest, raw=d,
    )


async def _get(client: httpx.AsyncClient, path: str, params: dict) -> dict:
    resp = await client.get(_graph(path), params={**params, "access_token": settings.META_PAGE_ACCESS_TOKEN})
    data = resp.json() if resp.content else {}
    if resp.status_code >= 400 or "error" in data:
        raise RuntimeError(f"Meta API {resp.status_code}: {json.dumps(data.get('error', data), ensure_ascii=False)[:500]}")
    return data


async def fetch_lead(leadgen_id: str) -> NormalizedLead:
    async with httpx.AsyncClient(timeout=20) as client:
        try:
            data = await _get(client, leadgen_id, {"fields": _FULL_FIELDS})
        except RuntimeError:  # some ad fields need extra permissions - the lead itself is what matters
            data = await _get(client, leadgen_id, {"fields": _BASIC_FIELDS})
    return parse_lead(data)


async def list_recent_leads(since: datetime) -> list[NormalizedLead]:
    """Every lead of every form of the Page created after `since`."""
    out: list[NormalizedLead] = []
    if not settings.META_PAGE_ID:
        return out
    flt = json.dumps([{"field": "time_created", "operator": "GREATER_THAN", "value": int(since.timestamp())}])
    async with httpx.AsyncClient(timeout=30) as client:
        forms = (await _get(client, f"{settings.META_PAGE_ID}/leadgen_forms", {"fields": "id,name", "limit": 100})).get("data", [])
        for form in forms:
            fields = _FULL_FIELDS
            url_params = {"fields": fields, "filtering": flt, "limit": 100}
            try:
                page = await _get(client, f"{form['id']}/leads", url_params)
            except RuntimeError:
                page = await _get(client, f"{form['id']}/leads", {**url_params, "fields": _BASIC_FIELDS})
            while True:
                for d in page.get("data", []):
                    n = parse_lead(d)
                    n.form_id = n.form_id or form["id"]
                    n.form_name = n.form_name or form.get("name")
                    out.append(n)
                nxt = (page.get("paging") or {}).get("next")
                if not nxt:
                    break
                resp = await client.get(nxt)
                page = resp.json()
    return out


def default_since(last: datetime | None) -> datetime:
    """Overlap the previous run by an hour (dedup makes it free); first run
    looks back META_LEADS_BACKFILL_DAYS days."""
    if last:
        return last - timedelta(hours=1)
    return datetime.now(timezone.utc) - timedelta(days=max(settings.META_LEADS_BACKFILL_DAYS, 0))
