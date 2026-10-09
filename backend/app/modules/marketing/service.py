from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit.service import AuditService
from app.modules.crm.leads.models import Lead
from app.modules.marketing.models import AdCampaign, AppSetting, Subscription
from app.modules.marketing.schemas import (
    CampaignCreateRequest,
    CampaignListResponse,
    CampaignResponse,
    CampaignUpdateRequest,
    PlatformTotals,
    SubscriptionCreateRequest,
    SubscriptionListResponse,
    SubscriptionResponse,
    SubscriptionTotals,
    SubscriptionUpdateRequest,
)

ZERO = Decimal("0")
PLATFORMS = ("snapchat", "meta", "tiktok")
SETTING_KEYS = (
    "project_start_date", "full_launch_date",  # legacy
    "phase_start", "phase_end",
    "target_subscribers", "target_max_cac", "target_min_conversion", "target_min_attendance",
)


def _not_found(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} غير موجود")


class SubscriptionService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.audit = AuditService(db)

    async def list(self) -> SubscriptionListResponse:
        rows = (
            await self.db.execute(
                select(Subscription).order_by(Subscription.subscribed_at.desc(), Subscription.created_at.desc())
            )
        ).scalars().all()
        paid = sum((r.amount_paid for r in rows), ZERO)
        disc = sum((r.discount_amount for r in rows), ZERO)
        return SubscriptionListResponse(
            items=[SubscriptionResponse.model_validate(r) for r in rows],
            totals=SubscriptionTotals(
                count=len(rows), total_paid=paid, total_discount=disc, total_list_price=paid + disc
            ),
        )

    async def create(self, payload: SubscriptionCreateRequest, user_id: uuid.UUID) -> Subscription:
        sub = Subscription(**payload.model_dump(), created_by=user_id)
        self.db.add(sub)
        await self.db.flush()
        await self.audit.record(
            user_id=user_id, action="subscription.create", resource_type="subscription",
            resource_id=str(sub.id), new_value={"full_name": sub.full_name, "amount_paid": str(sub.amount_paid)},
        )
        await self.db.commit()
        await self.db.refresh(sub)
        return sub

    async def update(self, sub_id: uuid.UUID, payload: SubscriptionUpdateRequest, user_id: uuid.UUID) -> Subscription:
        sub = await self.db.get(Subscription, sub_id)
        if sub is None:
            raise _not_found("الاشتراك")
        data = payload.model_dump(exclude_unset=True)
        for k, v in data.items():
            if k in ("full_name", "phone", "amount_paid", "discount_amount", "subscribed_at") and v is None:
                continue
            setattr(sub, k, v)
        await self.audit.record(
            user_id=user_id, action="subscription.update", resource_type="subscription",
            resource_id=str(sub.id), new_value={k: str(v) for k, v in data.items()},
        )
        await self.db.commit()
        await self.db.refresh(sub)
        return sub

    async def delete(self, sub_id: uuid.UUID, user_id: uuid.UUID) -> None:
        sub = await self.db.get(Subscription, sub_id)
        if sub is None:
            raise _not_found("الاشتراك")
        await self.audit.record(
            user_id=user_id, action="subscription.delete", resource_type="subscription",
            resource_id=str(sub.id), previous_value={"full_name": sub.full_name, "amount_paid": str(sub.amount_paid)},
        )
        await self.db.delete(sub)
        await self.db.commit()


class CampaignService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.audit = AuditService(db)

    async def list(self) -> CampaignListResponse:
        rows = (
            await self.db.execute(select(AdCampaign).order_by(AdCampaign.platform, AdCampaign.spend.desc()))
        ).scalars().all()
        platforms = platform_totals(rows)
        return CampaignListResponse(
            items=[CampaignResponse.model_validate(r) for r in rows],
            platforms=platforms,
            total_spend=sum((p.spend for p in platforms), ZERO),
        )

    async def create(self, payload: CampaignCreateRequest, user_id: uuid.UUID) -> AdCampaign:
        c = AdCampaign(**payload.model_dump(), created_by=user_id)
        self.db.add(c)
        await self.db.flush()
        await self.audit.record(
            user_id=user_id, action="campaign.create", resource_type="ad_campaign",
            resource_id=str(c.id), new_value={"platform": c.platform, "name": c.name, "spend": str(c.spend)},
        )
        await self.db.commit()
        await self.db.refresh(c)
        return c

    async def update(self, cid: uuid.UUID, payload: CampaignUpdateRequest, user_id: uuid.UUID) -> AdCampaign:
        c = await self.db.get(AdCampaign, cid)
        if c is None:
            raise _not_found("الحملة")
        data = payload.model_dump(exclude_unset=True)
        for k, v in data.items():
            if k in ("platform", "name", "spend", "counts_as_leads") and v is None:
                continue
            setattr(c, k, v)
        await self.audit.record(
            user_id=user_id, action="campaign.update", resource_type="ad_campaign",
            resource_id=str(c.id), new_value={k: str(v) for k, v in data.items()},
        )
        await self.db.commit()
        await self.db.refresh(c)
        return c

    async def delete(self, cid: uuid.UUID, user_id: uuid.UUID) -> None:
        c = await self.db.get(AdCampaign, cid)
        if c is None:
            raise _not_found("الحملة")
        await self.audit.record(
            user_id=user_id, action="campaign.delete", resource_type="ad_campaign",
            resource_id=str(c.id), previous_value={"platform": c.platform, "name": c.name, "spend": str(c.spend)},
        )
        await self.db.delete(c)
        await self.db.commit()


def platform_totals(campaigns) -> list[PlatformTotals]:
    spend: dict[str, Decimal] = defaultdict(lambda: ZERO)
    leads: dict[str, int] = defaultdict(int)
    count: dict[str, int] = defaultdict(int)
    split: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0])
    for c in campaigns:
        spend[c.platform] += c.spend
        count[c.platform] += 1
        split[c.platform][0] += c.form_leads or 0
        split[c.platform][1] += c.website_leads or 0
        split[c.platform][2] += c.messaging_conversations or 0
        if c.counts_as_leads and c.results_count:
            leads[c.platform] += c.results_count
    out = []
    for p in PLATFORMS:
        s, l = spend[p], leads[p]
        out.append(
            PlatformTotals(
                platform=p, spend=s, leads=l, campaigns=count[p],
                cost_per_lead=(s / l).quantize(Decimal("0.01")) if l else None,
                form_leads=split[p][0], website_leads=split[p][1], messaging_conversations=split[p][2],
            )
        )
    return out


# --------------------------------------------------------------------- KPIs

# The project went live on this date. Registrations made earlier (pre-launch
# website sign-ups that still attended a lecture) are absorbed by the first
# period, otherwise bookings would not match the attendance sheet.
LAUNCH_PERIOD_START = date(2026, 7, 1)

# Year-1 phase defaults (editable by the system administrator).
DEFAULT_PHASE_START = date(2026, 8, 1)
DEFAULT_PHASE_END = date(2027, 9, 1)  # exclusive (phase runs through August 2027)

# Management targets for the phase (editable).
TEST_PHASE_TARGETS = {
    "subscribers": 100,        # customers (paid subscribers) to reach
    "max_cac": 1500,           # acquisition cost per customer must stay below (SAR)
    "min_conversion": 15,      # % of those who ATTENDED the lecture that subscribe
    "min_attendance": 60,      # % of recorded sessions that attended
}
_TARGET_KEYS = {
    "target_subscribers": ("subscribers", int),
    "target_max_cac": ("max_cac", float),
    "target_min_conversion": ("min_conversion", float),
    "target_min_attendance": ("min_attendance", float),
}

_AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]
_AR_QUARTER = {1: "الأول", 2: "الثاني", 3: "الثالث", 4: "الرابع"}
FAR_FUTURE = date(2100, 1, 1)


def _quarter_bounds(year: int, q: int) -> tuple[date, date]:
    """Inclusive start, EXCLUSIVE end of calendar quarter q (1-4)."""
    start = date(year, 3 * (q - 1) + 1, 1)
    end = date(year + 1, 1, 1) if q == 4 else date(year, 3 * q + 1, 1)
    return start, end


def _quarter_label(year: int, q: int) -> str:
    s, e = _quarter_bounds(year, q)
    last = date.fromordinal(e.toordinal() - 1)
    return f"الربع {_AR_QUARTER[q]} {year} ({_AR_MONTHS[s.month - 1]} – {_AR_MONTHS[last.month - 1]})"


def _month_label(d: date) -> str:
    return f"{_AR_MONTHS[d.month - 1]} {d.year}"


def parse_period(period: str | None) -> tuple[int, int]:
    """Legacy half-year parser: '2026-H2' -> (2026, 2)."""
    if not period:
        today = date.today()
        return today.year, 1 if today.month <= 6 else 2
    try:
        year_s, half_s = period.upper().split("-H")
        year, half = int(year_s), int(half_s)
        if half not in (1, 2):
            raise ValueError
        return year, half
    except ValueError:
        raise HTTPException(status_code=422, detail="صيغة الفترة غير صحيحة، المثال: 2026-Q4")


def period_bounds(year: int, half: int) -> tuple[date, date]:
    """Inclusive start, EXCLUSIVE end of a half-year."""
    return (date(year, 1, 1), date(year, 7, 1)) if half == 1 else (date(year, 7, 1), date(year + 1, 1, 1))


def previous_period(year: int, half: int) -> tuple[int, int]:
    return (year, 1) if half == 2 else (year - 1, 2)


def _ratio(a: int | Decimal, b: int | Decimal) -> float | None:
    """Percentage a/b, or None when undefined. A step can never convert more
    than 100% of the previous one; a higher figure only means the two counts
    come from different cohorts (e.g. subscriptions entered for people who
    were never logged as leads), so we report no rate instead of a wrong one."""
    if not b:
        return None
    value = float(a) / float(b) * 100
    return round(value, 1) if value <= 100 else None


def _d(v: str | None) -> date | None:
    try:
        return date.fromisoformat(v) if v else None
    except ValueError:
        return None


class KpiService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------ settings
    async def _raw_settings(self) -> dict[str, str | None]:
        rows = (await self.db.execute(select(AppSetting).where(AppSetting.key.in_(SETTING_KEYS)))).scalars().all()
        found = {r.key: r.value for r in rows}
        return {k: found.get(k) for k in SETTING_KEYS}

    async def get_settings(self) -> dict:
        """Phase window + targets (defaults when never edited)."""
        raw = await self._raw_settings()
        start = _d(raw.get("phase_start")) or DEFAULT_PHASE_START
        end = _d(raw.get("phase_end")) or DEFAULT_PHASE_END  # exclusive
        if end <= start:
            end = DEFAULT_PHASE_END if DEFAULT_PHASE_END > start else date(start.year + 1, start.month, 1)
        targets = dict(TEST_PHASE_TARGETS)
        for key, (name, cast) in _TARGET_KEYS.items():
            v = raw.get(key)
            if v not in (None, ""):
                try:
                    targets[name] = cast(float(v)) if cast is int else cast(v)
                except ValueError:
                    pass
        return {
            "phase_start": start,
            "phase_end_inclusive": date.fromordinal(end.toordinal() - 1),
            "targets": targets,
            "_phase_end": end,
        }

    async def update_settings(self, values: dict) -> dict:
        """values: phase_start / phase_end_inclusive (dates) and
        subscribers / max_cac / min_conversion / min_attendance."""
        mapping: dict[str, str | None] = {}
        if "phase_start" in values:
            v = values["phase_start"]
            mapping["phase_start"] = v.isoformat() if v else None
        if "phase_end_inclusive" in values:
            v = values["phase_end_inclusive"]
            mapping["phase_end"] = date.fromordinal(v.toordinal() + 1).isoformat() if v else None
        for key, (name, _cast) in _TARGET_KEYS.items():
            if name in values:
                mapping[key] = None if values[name] is None else str(values[name])
        for key, val in mapping.items():
            row = await self.db.get(AppSetting, key)
            if row is None:
                self.db.add(AppSetting(key=key, value=val or None))
            else:
                row.value = val or None
        await self.db.commit()
        out = await self.get_settings()
        out.pop("_phase_end", None)
        return out

    # ------------------------------------------------------------- periods
    def period_options(self, settings: dict) -> list[dict]:
        today = date.today()
        opts: list[dict] = []
        y, q = LAUNCH_PERIOD_START.year, (LAUNCH_PERIOD_START.month - 1) // 3 + 1
        cy, cq = today.year, (today.month - 1) // 3 + 1
        while (y, q) <= (cy, cq):
            opts.append({"key": f"{y}-Q{q}", "label": _quarter_label(y, q), "group": "quarter"})
            q += 1
            if q == 5:
                y, q = y + 1, 1
        opts.reverse()
        opts.append({"key": "phase", "label": f"المرحلة الأولى ({_AR_MONTHS[settings['phase_start'].month - 1]} {settings['phase_start'].year} – {_AR_MONTHS[settings['phase_end_inclusive'].month - 1]} {settings['phase_end_inclusive'].year})", "group": "range"})
        opts.append({"key": "all", "label": "كل الفترات", "group": "range"})
        return opts

    def resolve_period(self, period: str | None, settings: dict) -> dict:
        """-> key,label,start,end(exclusive), prev (dict|None)."""
        today = date.today()
        key = (period or "").strip()
        if not key:
            key = f"{today.year}-Q{(today.month - 1) // 3 + 1}"
        low = key.lower()
        if low == "all":
            return {"key": "all", "label": "كل الفترات", "start": LAUNCH_PERIOD_START, "end": FAR_FUTURE, "prev": None}
        if low == "phase":
            return {"key": "phase", "label": "المرحلة الأولى", "start": settings["phase_start"], "end": settings["_phase_end"], "prev": None}
        up = key.upper()
        if "-Q" in up:
            try:
                ys, qs = up.split("-Q")
                year, q = int(ys), int(qs)
                if q not in (1, 2, 3, 4):
                    raise ValueError
            except ValueError:
                raise HTTPException(status_code=422, detail="صيغة الفترة غير صحيحة، المثال: 2026-Q4")
            s, e = _quarter_bounds(year, q)
            py, pq = (year, q - 1) if q > 1 else (year - 1, 4)
            ps, pe = _quarter_bounds(py, pq)
            return {"key": f"{year}-Q{q}", "label": _quarter_label(year, q), "start": s, "end": e,
                    "prev": {"key": f"{py}-Q{pq}", "label": _quarter_label(py, pq), "start": ps, "end": pe}}
        year, half = parse_period(key)  # legacy half-year
        s, e = period_bounds(year, half)
        py, ph = previous_period(year, half)
        ps, pe = period_bounds(py, ph)
        return {"key": f"{year}-H{half}", "label": f"{'النصف الأول' if half == 1 else 'النصف الثاني'} {year}", "start": s, "end": e,
                "prev": {"key": f"{py}-H{ph}", "label": f"{'النصف الأول' if ph == 1 else 'النصف الثاني'} {py}", "start": ps, "end": pe}}

    # ------------------------------------------------------------- metrics
    async def _range_metrics(self, start: date, end: date, absorb_until: date, include_undated: bool | None = None, detail: bool = False) -> dict:
        """Funnel / revenue / marketing metrics for [start, end)."""
        start_dt = datetime(start.year, start.month, start.day, tzinfo=timezone.utc)
        end_dt = datetime(min(end, FAR_FUTURE).year, min(end, FAR_FUTURE).month, min(end, FAR_FUTURE).day, tzinfo=timezone.utc)

        # CRM funnel: cohort of leads created in the period. A range that
        # starts at launch (up to the phase start) also owns earlier
        # registrations; a range that ends at/before launch has none.
        cohort_start, cohort_end = start_dt, end_dt
        if LAUNCH_PERIOD_START <= start <= max(absorb_until, LAUNCH_PERIOD_START):
            cohort_start = datetime(2000, 1, 1, tzinfo=timezone.utc)
        elif end <= LAUNCH_PERIOD_START:
            cohort_end = cohort_start
        in_period = (Lead.created_at >= cohort_start, Lead.created_at < cohort_end)

        rows = (
            await self.db.execute(
                select(Lead.created_at, Lead.source, Lead.attended, Lead.lecture_date, Lead.teacher_slot_id).where(*in_period)
            )
        ).all()
        leads = attended = not_attended = pending = 0
        by_source: dict[str, dict[str, int]] = defaultdict(lambda: {"leads": 0, "booked": 0, "attended": 0, "not_attended": 0, "pending": 0})
        by_month: dict[date, dict[str, int]] = defaultdict(lambda: {"leads": 0, "booked": 0, "attended": 0, "subscribers": 0, "revenue": 0})
        for created_at, source, att, lec_date, slot in rows:
            leads += 1
            src = source or "other"
            bucket = by_source[src]
            bucket["leads"] += 1
            # month bucket (registrations before the range start fall in its first month)
            m = date(created_at.year, created_at.month, 1)
            if m < date(start.year, start.month, 1):
                m = date(start.year, start.month, 1)
            by_month[m]["leads"] += 1
            # someone with an attendance record was necessarily booked, even
            # when their lecture date was never captured
            is_booked = lec_date is not None or slot is not None or att is not None
            if not is_booked:
                continue
            bucket["booked"] += 1
            by_month[m]["booked"] += 1
            if att is True:
                attended += 1
                bucket["attended"] += 1
                by_month[m]["attended"] += 1
            elif att is False:
                not_attended += 1
                bucket["not_attended"] += 1
            else:
                pending += 1
                bucket["pending"] += 1
        # Bookings = attended + did not attend + awaiting a status change.
        booked = attended + not_attended + pending
        decided = attended + not_attended  # sessions with a recorded outcome

        # ---- Subscribers & revenue
        sub_rows = (
            await self.db.execute(
                select(Subscription.subscribed_at, Subscription.amount_paid, Subscription.discount_amount).where(
                    Subscription.subscribed_at >= start, Subscription.subscribed_at < end
                )
            )
        ).all()
        subscribers = len(sub_rows)
        revenue = sum((Decimal(r[1] or 0) for r in sub_rows), ZERO)
        discounts = sum((Decimal(r[2] or 0) for r in sub_rows), ZERO)
        for sub_at, paid, _disc in sub_rows:
            m = date(sub_at.year, sub_at.month, 1)
            by_month[m]["subscribers"] += 1
            by_month[m]["revenue"] += int(Decimal(paid or 0))

        # ---- Marketing. Campaigns with explicit dates are matched by
        # overlap; undated (lifetime) campaigns belong to the CURRENT period
        # only - we never guess a historical split.
        today = date.today()
        is_current = (start <= today < end) if include_undated is None else include_undated
        campaigns = (await self.db.execute(select(AdCampaign))).scalars().all()
        used, cumulative = [], False
        for c in campaigns:
            if c.period_start is None and c.period_end is None:
                if is_current:
                    used.append(c)
                    cumulative = True
            else:
                c_start = c.period_start or c.period_end
                c_end = c.period_end or c.period_start
                if c_start < end and c_end >= start:
                    used.append(c)
        platforms = platform_totals(used)
        spend = sum((p.spend for p in platforms), ZERO)

        # Leads per platform come from the CRM (a lead = a person whose name
        # and phone were registered), not from the ad account's results.
        crm_platform = {"instagram": "meta", "snapchat": "snapchat", "tiktok": "tiktok"}
        recorded = {p: 0 for p in PLATFORMS}
        for src, b in by_source.items():
            if src in crm_platform:
                recorded[crm_platform[src]] += b["leads"]
        account = {p.platform: p for p in platforms}
        platforms = [
            p.model_copy(update={
                "leads": recorded[p.platform],
                "cost_per_lead": (p.spend / recorded[p.platform]).quantize(Decimal("0.01")) if recorded[p.platform] else None,
            })
            for p in platforms
        ]
        reported_leads = sum(p.leads for p in platforms)
        recon_rows = []
        for p in platforms:
            acc = account[p.platform]
            rec = p.leads
            recon_rows.append({
                "platform": p.platform,
                "spend": p.spend,
                "reported": acc.leads,
                "form_leads": acc.form_leads,
                "website_leads": acc.website_leads,
                "messaging_conversations": acc.messaging_conversations,
                "recorded": rec,
                "capture_rate": round(rec / acc.leads * 100, 1) if acc.leads else None,
                "gap": acc.leads - rec,
                "real_cpl": p.cost_per_lead,
            })
        reconciliation = {
            "platforms": recon_rows,
            "other_channels": {"website": by_source.get("website", {}).get("leads", 0), "organic": by_source.get("organic", {}).get("leads", 0)},
            "total_recorded": leads,
        }

        out = {
            "start": start,
            "end_inclusive": date.fromordinal(min(end, FAR_FUTURE).toordinal() - 1) if end < FAR_FUTURE else today,
            "funnel": {
                "leads": leads,
                "booked": booked,
                "decided": decided,
                "attended": attended,
                "not_attended": not_attended,
                "pending_attendance": pending,
                "subscribers": subscribers,
            },
            "revenue": {
                "subscribers": subscribers,
                "total_paid": revenue,
                "total_discount": discounts,
                "total_list_price": revenue + discounts,
                "avg_paid": (revenue / subscribers).quantize(Decimal("0.01")) if subscribers else None,
            },
            "marketing": {
                "total_spend": spend,
                "reported_leads": reported_leads,
                "cac": (spend / subscribers).quantize(Decimal("0.01")) if subscribers else None,
                "cost_per_lead": (spend / reported_leads).quantize(Decimal("0.01")) if reported_leads else None,
                "roas": round(float(revenue) / float(spend), 2) if spend else None,
                "includes_cumulative": cumulative,
                "platforms": platforms,
                "reconciliation": reconciliation,
            },
        }
        if detail:
            out["sources"] = [{"source": s, **v} for s, v in sorted(by_source.items(), key=lambda kv: -kv[1]["leads"])]
            # monthly series from range start up to the current month
            last_month = date(today.year, today.month, 1)
            first = date(start.year, start.month, 1)
            limit = date(end.year, end.month, 1) if end < FAR_FUTURE else last_month
            months, m = [], first
            while m <= min(limit, max(last_month, first)) and len(months) < 60:
                if m < end:
                    b = by_month.get(m, {"leads": 0, "booked": 0, "attended": 0, "subscribers": 0, "revenue": 0})
                    months.append({"month": m.isoformat(), "label": _month_label(m), **b})
                m = date(m.year + (m.month == 12), m.month % 12 + 1, 1)
            out["series"] = months
        return out

    @staticmethod
    def _funnel_rates(f: dict) -> dict:
        decided = f.get("decided", f["attended"] + f["not_attended"])
        return {
            "lead_to_booked": _ratio(f["booked"], f["leads"]),
            "booked_to_attended": _ratio(f["attended"], decided),      # of sessions with a recorded outcome
            "booked_to_not_attended": _ratio(f["not_attended"], decided),
            "attended_to_subscriber": _ratio(f["subscribers"], f["attended"]),
            "overall": _ratio(f["subscribers"], f["leads"]),
        }

    async def summary(self, period: str | None) -> dict:
        settings = await self.get_settings()
        sel = self.resolve_period(period, settings)
        absorb = settings["phase_start"]
        current = await self._range_metrics(sel["start"], sel["end"], absorb, detail=True)
        current.update({"period": sel["key"], "label": sel["label"]})
        current["funnel_rates"] = self._funnel_rates(current["funnel"])
        previous = None
        if sel["prev"]:
            p = sel["prev"]
            previous = await self._range_metrics(p["start"], p["end"], absorb)
            previous.update({"period": p["key"], "label": p["label"]})
            previous["funnel_rates"] = self._funnel_rates(previous["funnel"])
        goals = await self._phase_goals(settings)
        public = {k: v for k, v in settings.items() if not k.startswith("_")}
        return {
            "current": current,
            "previous": previous,
            "periods": self.period_options(settings),
            "selected": sel["key"],
            "settings": public,
            "phase_goals": goals,
        }

    async def _phase_goals(self, settings: dict) -> dict:
        """Cumulative results over the whole phase window vs. the targets."""
        start, end = settings["phase_start"], settings["_phase_end"]
        today = date.today()
        m = await self._range_metrics(start, end, settings["phase_start"], include_undated=start <= today)
        rates = self._funnel_rates(m["funnel"])
        f = m["funnel"]
        return {
            "start": start,
            "end_inclusive": settings["phase_end_inclusive"],
            "includes_cumulative": m["marketing"]["includes_cumulative"],
            "targets": settings["targets"],
            "metrics": {
                "subscribers": f["subscribers"],
                "cac": m["marketing"]["cac"],
                "total_spend": m["marketing"]["total_spend"],
                "conversion": rates["attended_to_subscriber"],   # subscribers / attended
                "attendance_rate": rates["booked_to_attended"],  # attended / recorded sessions
                "attended": f["attended"],
                "decided": f["decided"],
                "booked": f["booked"],
            },
        }
