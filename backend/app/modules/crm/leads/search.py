"""
Customer search used by every CRM list (leads, bookings, interested, all).

* Phone: digits only, ignoring the stored format - "0501234567",
  "501234567", "+966 50 123 4567" and "966501234567" all find the same
  customer (the stored phone is compared digits-only too).
* Name: Arabic letter variants are folded on both sides (أ إ آ ٱ -> ا,
  ى -> ي, ة -> ه, tatweel removed) and every word must appear, so
  "احمد علي" finds "أحمد محمد علي".
"""
from __future__ import annotations

import re

from sqlalchemy import and_, func, or_

from app.modules.crm.leads.models import Lead

_FROM = "أإآٱىةـ"
_TO = "اااايه"  # the 7th char (tatweel) has no counterpart -> removed by translate()
_PY_MAP = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه", "ـ": None})


def normalize_ar(text: str) -> str:
    return (text or "").translate(_PY_MAP).lower().strip()


def _phone_core(text: str) -> str | None:
    digits = re.sub(r"\D", "", text or "")
    if len(digits) < 3:
        return None
    for prefix in ("00966", "966", "00", "0"):
        if digits.startswith(prefix) and len(digits) > len(prefix) + 2:
            digits = digits[len(prefix):]
            break
    return digits


def search_condition(search: str | None):
    """SQL condition for a free-text search box, or None for an empty one."""
    text = (search or "").strip()
    if not text:
        return None
    conds = []
    core = _phone_core(text)
    if core:
        conds.append(func.regexp_replace(Lead.phone, r"\D", "", "g").like(f"%{core}%"))
    words = [w for w in normalize_ar(re.sub(r"[\d+\-()]", " ", text)).split() if w]
    if words:
        name = func.lower(func.translate(Lead.full_name, _FROM, _TO))
        conds.append(and_(*[name.like(f"%{w}%") for w in words]))
    return or_(*conds) if conds else None
