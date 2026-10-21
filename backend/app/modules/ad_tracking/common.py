"""Shared pieces for every ad platform adapter (Snapchat, Meta, TikTok).

Each adapter module exposes the same small interface:
    PLATFORM                     "snapchat" | "meta" | "tiktok"
    ready() -> bool              configured + enabled
    event_name(stage) -> str     the platform's event for a CRM stage ("" = don't send)
    build_event(ctx) -> dict     one event in the platform's format (None = nothing to match on)
    send_events(events, *, validate_only) -> (status_code, body)
    is_success(status_code, body) -> bool
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal


def sha256(value: str) -> str:
    return hashlib.sha256(value.strip().lower().encode("utf-8")).hexdigest()


def split_name(full_name: str | None) -> tuple[str | None, str | None]:
    parts = (full_name or "").split()
    if not parts:
        return None, None
    return parts[0], (parts[-1] if len(parts) > 1 else None)


@dataclass
class EventContext:
    event_name: str
    event_id: str
    event_time: datetime
    phone_e164: str | None = None   # digits only with country code: 9665XXXXXXXX
    email: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    external_lead_id: str | None = None  # the platform's own lead id (lead-form leads)
    value: Decimal | None = None
    currency: str | None = None
