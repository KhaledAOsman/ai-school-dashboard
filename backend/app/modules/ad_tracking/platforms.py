"""Which ad platform a CRM customer belongs to, and the adapter for each."""
from __future__ import annotations

from app.modules.ad_tracking import meta, snap, tiktok

ADAPTERS = {snap.PLATFORM: snap, meta.PLATFORM: meta, tiktok.PLATFORM: tiktok}

# CRM lead.source -> ad platform (organic / زيارات مباشرة has no platform)
LEAD_SOURCE_PLATFORM = {"snapchat": snap.PLATFORM, "instagram": meta.PLATFORM, "tiktok": tiktok.PLATFORM}

LABELS = {snap.PLATFORM: "سناب شات", meta.PLATFORM: "ميتا", tiktok.PLATFORM: "تيك توك"}


def ready_platforms() -> list[str]:
    return [p for p, a in ADAPTERS.items() if a.ready()]
