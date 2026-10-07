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
SETTING_KEYS = ("project_start_date", "full_launch_date")


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

def parse_period(period: str | None) -> tuple[int, int]:
    """'2026-H2' -> (2026, 2). Defaults to the current half-year."""
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
        raise HTTPException(status_code=422, detail="صيغة الفترة غير صحيحة، المثال: 2026-H2")


def period_bounds(year: int, half: int) -> tuple[date, date]:
    """Inclusive start, EXCLUSIVE end."""
    return (date(year, 1, 1), date(year, 7, 1)) if half == 1 else (date(year, 7, 1), date(year + 1, 1, 1))


def previous_period(year: int, half: int) -> tuple[int, int]:
    return (year, 1) if half == 2 else (year - 1, 2)


# Management targets for the 6-month test phase.
TEST_PHASE_TARGETS = {
    "subscribers": 100,        # customers (paid subscribers) to reach
    "max_cac": 1500,           # acquisition cost per customer must stay below (SAR)
    "min_conversion": 15,      # % of those who ATTENDED the lecture that subscribe
    "min_attendance": 60,      # % of booked leads that attend the lecture
}


def _ratio(a: int | Decimal, b: int | Decimal) -> float | None:
    """Percentage a/b, or None when undefined. A step can never convert more
    than 100% of the previous one; a higher figure only means the two counts
    come from different cohorts (e.g. subscriptions entered for people who
    were never logged as leads), so we report no rate instead of a wrong one."""
    if not b:
        return None
    value = float(a) / float(b) * 100
    return round(value, 1) if value <= 100 else None


class KpiService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_settings(self) -> dict[str, str | None]:
        rows = (await self.db.execute(select(AppSetting).where(AppSetting.key.in_(SETTING_KEYS)))).scalars().all()
        found = {r.key: r.value for r in rows}
        return {k: found.get(k) for k in SETTING_KEYS}

    async def update_settings(self, values: dict[str, str | None]) -> dict[str, str | None]:
        for key, val in values.items():
            if key not in SETTING_KEYS:
                continue
            row = await self.db.get(AppSetting, key)
            if row is None:
                self.db.add(AppSetting(key=key, value=val or None))
            else:
                row.value = val or None
        await self.db.commit()
        return await self.get_settings()

    async def _period_metrics(self, year: int, half: int) -> dict:
        start, end = period_bounds(year, half)
        data = await self._range_metrics(start, end)
        data.update({"year": year, "half": half, "period": f"{year}-H{half}"})
        return data

    async def _range_metrics(self, start: date, end: date, include_undated: bool | None = None) -> dict:
        """Funnel / revenue / marketing metrics for [start, end)."""
        start_dt = datetime(start.year, start.month, start.day, tzinfo=timezone.utc)
        end_dt = datetime(end.year, end.month, end.day, tzinfo=timezone.utc)

        # ---- CRM funnel: cohort of leads created in the period
        in_period = (Lead.created_at >= start_dt, Lead.created_at < end_dt)
        leads = (await self.db.execute(select(func.count(Lead.id)).where(*in_period))).scalar_one()
        booked = (
            await self.db.execute(
                select(func.count(Lead.id)).where(
                    *in_period, or_(Lead.lecture_date.isnot(None), Lead.teacher_slot_id.isnot(None))
                )
            )
        ).scalar_one()
        attended = (
            await self.db.execute(select(func.count(Lead.id)).where(*in_period, Lead.attended.is_(True)))
        ).scalar_one()
        # attended=False is an explicit "did not attend" record; NULL on a
        # booked lead means attendance was not recorded yet (or postponed).
        not_attended = (
            await self.db.execute(select(func.count(Lead.id)).where(*in_period, Lead.attended.is_(False)))
        ).scalar_one()
        pending_attendance = max(booked - attended - not_attended, 0)

        # ---- Subscribers & revenue
        sub_row = (
            await self.db.execute(
                select(
                    func.count(Subscription.id),
                    func.coalesce(func.sum(Subscription.amount_paid), 0),
                    func.coalesce(func.sum(Subscription.discount_amount), 0),
                ).where(Subscription.subscribed_at >= start, Subscription.subscribed_at < end)
            )
        ).one()
        subscribers, revenue, discounts = int(sub_row[0]), Decimal(sub_row[1]), Decimal(sub_row[2])

        # ---- Marketing. Campaigns with explicit dates are matched by
        # overlap; undated (lifetime) campaigns belong to the CURRENT half
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
        reported_leads = sum(p.leads for p in platforms)

        # ---- Reconciliation: what the ad platforms report vs. what is
        # actually recorded as a lead (with a phone number) in the CRM.
        src_rows = (
            await self.db.execute(select(Lead.source, func.count(Lead.id)).where(*in_period).group_by(Lead.source))
        ).all()
        by_src = {(r[0] or "other"): int(r[1]) for r in src_rows}
        crm_platform = {"instagram": "meta", "snapchat": "snapchat", "tiktok": "tiktok"}
        recorded = {p: 0 for p in PLATFORMS}
        for src, n in by_src.items():
            if src in crm_platform:
                recorded[crm_platform[src]] += n
        recon_rows = []
        for p in platforms:
            rec = recorded[p.platform]
            recon_rows.append({
                "platform": p.platform,
                "spend": p.spend,
                "reported": p.leads,
                "form_leads": p.form_leads,
                "website_leads": p.website_leads,
                "messaging_conversations": p.messaging_conversations,
                "recorded": rec,
                "capture_rate": round(rec / p.leads * 100, 1) if p.leads else None,
                "gap": p.leads - rec,
                "real_cpl": (p.spend / rec).quantize(Decimal("0.01")) if rec else None,
            })
        reconciliation = {
            "platforms": recon_rows,
            "other_channels": {"website": by_src.get("website", 0), "organic": by_src.get("organic", 0)},
            "total_recorded": sum(by_src.values()),
        }

        return {
            "start": start,
            "end_inclusive": date.fromordinal(end.toordinal() - 1),
            "funnel": {
                "leads": leads,
                "booked": booked,
                "attended": attended,
                "not_attended": not_attended,
                "pending_attendance": pending_attendance,
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

    @staticmethod
    def _funnel_rates(f: dict) -> dict:
        return {
            "lead_to_booked": _ratio(f["booked"], f["leads"]),
            "booked_to_attended": _ratio(f["attended"], f["booked"]),
            "booked_to_not_attended": _ratio(f["not_attended"], f["booked"]),
            "attended_to_subscriber": _ratio(f["subscribers"], f["attended"]),
            "overall": _ratio(f["subscribers"], f["leads"]),
        }

    async def summary(self, period: str | None) -> dict:
        year, half = parse_period(period)
        current = await self._period_metrics(year, half)
        py, ph = previous_period(year, half)
        previous = await self._period_metrics(py, ph)
        current["funnel_rates"] = self._funnel_rates(current["funnel"])
        previous["funnel_rates"] = self._funnel_rates(previous["funnel"])

        settings = await self.get_settings()
        phases = build_phases(settings)
        return {
            "current": current,
            "previous": previous,
            "phases": phases,
            "test_phase": await self._test_phase(phases, (year, half)),
        }

    async def _test_phase(self, phases: dict, selected: tuple[int, int]) -> dict:
        """Cumulative results over the whole test phase vs. management targets.
        Uses project_start_date .. +6 months; when the start date is not set
        yet it falls back to the selected half-year and says so."""
        start, end = phases["project_start_date"], phases["test_end_date"]
        configured = bool(start and end)
        if not configured:
            start, end = period_bounds(*selected)
        today = date.today()
        m = await self._range_metrics(start, end, include_undated=start <= today)
        rates = self._funnel_rates(m["funnel"])
        f = m["funnel"]
        return {
            "configured": configured,
            "start": start,
            "end_inclusive": date.fromordinal(end.toordinal() - 1),
            "includes_cumulative": m["marketing"]["includes_cumulative"],
            "targets": TEST_PHASE_TARGETS,
            "metrics": {
                "subscribers": f["subscribers"],
                "cac": m["marketing"]["cac"],
                "total_spend": m["marketing"]["total_spend"],
                "conversion": rates["attended_to_subscriber"],  # subscribers / attended
                "attendance_rate": rates["booked_to_attended"],  # attended / booked
                "attended": f["attended"],
                "booked": f["booked"],
            },
        }


def build_phases(settings: dict[str, str | None]) -> dict:
    """Test phase = first 6 months from project start; full ramp-up starts at
    full_launch_date (summer holidays). Dates are optional until management
    provides them - the UI shows a prompt when missing."""
    def _d(v: str | None) -> date | None:
        try:
            return date.fromisoformat(v) if v else None
        except ValueError:
            return None

    start = _d(settings.get("project_start_date"))
    launch = _d(settings.get("full_launch_date"))
    test_end = None
    if start:
        m = start.month - 1 + 6
        y, mo = start.year + m // 12, m % 12 + 1
        day = min(start.day, 28)
        test_end = date(y, mo, day)
    today = date.today()
    current = None
    if start:
        if launch and today >= launch:
            current = "full_launch"
        elif today >= start:
            current = "test"
        else:
            current = "not_started"
    return {
        "project_start_date": start,
        "test_end_date": test_end,
        "full_launch_date": launch,
        "current_phase": current,
        "configured": bool(start and launch),
    }
