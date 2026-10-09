from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.modules.marketing.models import AdCampaign
from app.modules.marketing.schemas import normalize_phone
from app.modules.marketing.service import parse_period, period_bounds, previous_period
from tests.conftest import create_role, create_user, seed_permissions
from app.core.permissions.registry import SEED_PERMISSIONS

PW = "StrongPass!123"


async def _admin_headers(client, db_session):
    perms = await seed_permissions(db_session)
    role = await create_role(db_session, "KpiAdmin", [p.code for p in SEED_PERMISSIONS], perms)
    await create_user(db_session, email="kpi@example.com", password=PW, roles=[role])
    r = await client.post("/api/auth/login", json={"email": "kpi@example.com", "password": PW})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_phone_normalization():
    assert normalize_phone("0533307942") == "966533307942"
    assert normalize_phone("+966 53 330 7942") == "966533307942"
    assert normalize_phone("00966533307942") == "966533307942"
    assert normalize_phone("533307942") == "966533307942"


def test_period_helpers():
    assert parse_period("2026-H2") == (2026, 2)
    assert period_bounds(2026, 2) == (date(2026, 7, 1), date(2027, 1, 1))
    assert previous_period(2026, 1) == (2025, 2)
    assert previous_period(2026, 2) == (2026, 1)


@pytest.mark.asyncio
async def test_subscriptions_crud_and_totals(client, db_session):
    h = await _admin_headers(client, db_session)
    body = {"full_name": "اختبار", "phone": "0551481113", "amount_paid": "595", "discount_amount": "255", "subscribed_at": "2026-10-06"}
    r = await client.post("/api/subscriptions", json=body, headers=h)
    assert r.status_code == 201, r.text
    assert r.json()["phone"] == "966551481113"
    assert Decimal(r.json()["list_price"]) == Decimal("850")
    # same phone twice is allowed
    r2 = await client.post("/api/subscriptions", json=body, headers=h)
    assert r2.status_code == 201
    lst = (await client.get("/api/subscriptions", headers=h)).json()
    assert lst["totals"]["count"] == 2
    assert Decimal(lst["totals"]["total_paid"]) == Decimal("1190")
    r3 = await client.patch(f"/api/subscriptions/{r.json()['id']}", json={"amount_paid": "425", "discount_amount": "425"}, headers=h)
    assert Decimal(r3.json()["list_price"]) == Decimal("850")
    assert (await client.delete(f"/api/subscriptions/{r.json()['id']}", headers=h)).status_code == 204


@pytest.mark.asyncio
async def test_kpi_summary_cac_and_platforms(client, db_session):
    h = await _admin_headers(client, db_session)
    today = date.today()
    for plat, spend, cnt, leads in [("snapchat", "1000", 100, True), ("meta", "500", 50, True), ("tiktok", "500", 9999, False)]:
        db_session.add(AdCampaign(platform=plat, name="c", spend=Decimal(spend), results_count=cnt, counts_as_leads=leads))
    await db_session.commit()
    for i in range(4):
        await client.post("/api/subscriptions", json={"full_name": f"s{i}", "phone": f"05000000{i:02d}", "amount_paid": "500", "subscribed_at": today.isoformat()}, headers=h)

    half = f"{today.year}-H{1 if today.month <= 6 else 2}"
    r = await client.get(f"/api/kpi-dashboard/summary?period={half}", headers=h)
    assert r.status_code == 200, r.text
    cur = r.json()["current"]
    assert Decimal(cur["marketing"]["total_spend"]) == Decimal("2000")
    assert cur["marketing"]["reported_leads"] == 150  # traffic campaign excluded
    assert Decimal(cur["marketing"]["cac"]) == Decimal("500")  # 2000 / 4
    assert cur["marketing"]["includes_cumulative"] is True
    assert cur["revenue"]["subscribers"] == 4
    assert cur["marketing"]["roas"] == 1.0
    assert [p["platform"] for p in cur["marketing"]["platforms"]] == ["snapchat", "meta", "tiktok"]
    # an old period carries no undated (lifetime) campaigns
    old = (await client.get("/api/kpi-dashboard/summary?period=2020-H1", headers=h)).json()["current"]
    assert Decimal(old["marketing"]["total_spend"]) == 0 and old["marketing"]["cac"] is None


@pytest.mark.asyncio
async def test_phase_settings_roundtrip(client, db_session):
    h = await _admin_headers(client, db_session)
    r = await client.get("/api/kpi-dashboard/settings", headers=h)
    assert r.json()["phase_start"] == "2026-08-01" and r.json()["phase_end_inclusive"] == "2027-07-31"
    r = await client.patch("/api/kpi-dashboard/settings", json={"subscribers": 250, "max_cac": 900, "phase_start": "2026-09-01"}, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["targets"]["subscribers"] == 250 and body["targets"]["max_cac"] == 900.0
    assert body["targets"]["min_conversion"] == 15  # untouched target keeps its default
    assert body["phase_start"] == "2026-09-01" and body["phase_end_inclusive"] == "2027-07-31"
    bad = await client.patch("/api/kpi-dashboard/settings", json={"phase_end_inclusive": "2026-01-01"}, headers=h)
    assert bad.status_code == 422


@pytest.mark.asyncio
async def test_user_without_permission_is_rejected(client, db_session):
    perms = await seed_permissions(db_session)
    role = await create_role(db_session, "Nobody", ["crm.lead.view"], perms)
    await create_user(db_session, email="nobody@example.com", password=PW, roles=[role])
    r = await client.post("/api/auth/login", json={"email": "nobody@example.com", "password": PW})
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    for path in ("/api/subscriptions", "/api/campaigns", "/api/kpi-dashboard/summary"):
        assert (await client.get(path, headers=h)).status_code == 403


def test_ratio_never_exceeds_100():
    from app.modules.marketing.service import _ratio
    assert _ratio(5, 10) == 50.0
    assert _ratio(10, 8) is None  # more subscribers than attendees: cohorts differ
    assert _ratio(1, 0) is None


def test_funnel_rates_include_no_show():
    from app.modules.marketing.service import KpiService

    rates = KpiService._funnel_rates(
        {"leads": 40, "booked": 11, "attended": 8, "not_attended": 3, "pending_attendance": 1, "subscribers": 5}
    )
    assert rates["booked_to_attended"] == pytest_approx(72.7)
    assert rates["booked_to_not_attended"] == pytest_approx(27.3)
    assert rates["booked_to_attended"] + rates["booked_to_not_attended"] == pytest_approx(100.0)


def pytest_approx(v):
    import pytest

    return pytest.approx(v, abs=0.1)


@pytest.mark.asyncio
async def test_summary_operating_quarters_and_phase_goals(client, db_session):
    h = await _admin_headers(client, db_session)
    r = await client.get("/api/kpi-dashboard/summary?period=Q1", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    # operating quarters count from the phase start (Aug-Sep-Oct for an August start)
    assert body["current"]["period"] == "Q1" and body["current"]["start"] == "2026-08-01"
    assert body["current"]["end_inclusive"] == "2026-10-31"
    assert body["previous"] is None
    keys = [p["key"] for p in body["periods"]]
    assert "Q1" in keys and "phase" in keys and "all" in keys
    f = body["current"]["funnel"]
    assert f["booked"] == f["attended"] + f["not_attended"] + f["pending_attendance"]
    goals = body["phase_goals"]
    assert goals["targets"] == {"subscribers": 100, "max_cac": 1500, "min_conversion": 15, "min_attendance": 60}
    for k in ("subscribers", "cac", "conversion", "attendance_rate", "attended", "decided", "booked"):
        assert k in goals["metrics"]
    # whole-range filters carry no previous period
    for key in ("all", "phase"):
        assert (await client.get(f"/api/kpi-dashboard/summary?period={key}", headers=h)).json()["previous"] is None
    assert (await client.get("/api/kpi-dashboard/summary?period=Q9", headers=h)).status_code == 422
    # quarters follow the phase start when it is edited
    await client.patch("/api/kpi-dashboard/settings", json={"phase_start": "2026-09-01"}, headers=h)
    q1 = (await client.get("/api/kpi-dashboard/summary?period=Q1", headers=h)).json()["current"]
    assert q1["start"] == "2026-09-01" and q1["end_inclusive"] == "2026-11-30"


def test_booked_is_attended_plus_not_attended_plus_pending():
    from app.modules.marketing.service import KpiService

    rates = KpiService._funnel_rates(
        {"leads": 100, "booked": 12, "decided": 11, "attended": 8, "not_attended": 3, "pending_attendance": 1, "subscribers": 4}
    )
    assert rates["lead_to_booked"] == 12.0
    assert rates["booked_to_attended"] == pytest_approx(72.7)  # of sessions with a recorded outcome
