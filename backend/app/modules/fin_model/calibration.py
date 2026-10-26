"""
Live actuals from the platform's own data, used to (a) calibrate the model's
"auto" assumptions and (b) feed the actual-vs-plan comparison.

Sources: crm_leads / crm_bookings (funnel), subscriptions (sales, discount,
renewals), expense_allocations + chart-of-accounts codes (spend by type),
staff_members (current fixed payroll), finance_funding (owners' money).
Every calibrated value carries its basis (sample size, window) so the
analyst can judge it; values with too little data are left to the defaults.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# chart-of-accounts prefixes (see finance import): 51 tools/admin, 52 content,
# 53 marketing team, 54 customer service, 55 teachers, 56 marketing spend, 57 other
SPEND_GROUPS = {
    "51": "tools", "52": "content", "53": "marketing_team", "54": "customer_service",
    "55": "teachers", "56": "marketing", "57": "other",
}
COMMISSION_CODES = {"5420"}  # sales commission per subscription (direct cost)
MIN_SAMPLE = 20
# bump when the way actuals are measured is corrected; calibrations frozen before it are refreshed
CAL_VERSION = 2


def _f(x) -> float:
    if x is None:
        return 0.0
    return float(x) if not isinstance(x, Decimal) else float(x)


async def _rows(db: AsyncSession, sql: str, **params):
    return (await db.execute(text(sql), params)).mappings().all()


async def monthly_actuals(db: AsyncSession) -> dict[str, dict]:
    """month 'YYYY-MM' -> actual figures."""
    out: dict[str, dict] = {}

    def row(m):
        return out.setdefault(m, {"month": m, "leads": 0, "leads_organic": 0, "trials": 0, "attended": 0,
                                  "decided": 0, "new_subs": 0, "renewals": 0, "sales_paid": 0.0,
                                  "sales_discount": 0.0, "spend": {}, "spend_total": 0.0,
                                  "commissions": 0.0, "funding": 0.0, "collections": 0.0, "gateway_fees": 0.0})

    for r in await _rows(db, """
        SELECT to_char(created_at, 'YYYY-MM') m, count(*) n,
               count(*) FILTER (WHERE coalesce(source, '') IN ('organic', 'website', 'direct', 'referral')) org
        FROM crm_leads GROUP BY 1"""):
        row(r["m"]).update(leads=int(r["n"]), leads_organic=int(r["org"]))
    for r in await _rows(db, """
        SELECT to_char(lecture_date, 'YYYY-MM') m, count(*) n,
               count(*) FILTER (WHERE attended IS TRUE) att, count(*) FILTER (WHERE attended IS NOT NULL) dec
        FROM crm_bookings WHERE lecture_date IS NOT NULL GROUP BY 1"""):
        row(r["m"]).update(trials=int(r["n"]), attended=int(r["att"]), decided=int(r["dec"]))
    for r in await _rows(db, """
        WITH s AS (
          SELECT subscribed_at, amount_paid, discount_amount,
                 row_number() OVER (PARTITION BY right(regexp_replace(phone, '\\D', '', 'g'), 9) ORDER BY subscribed_at, created_at) rn
          FROM subscriptions)
        SELECT to_char(subscribed_at, 'YYYY-MM') m,
               count(*) FILTER (WHERE rn = 1) new_subs, count(*) FILTER (WHERE rn > 1) renewals,
               coalesce(sum(amount_paid), 0) paid, coalesce(sum(discount_amount), 0) disc
        FROM s GROUP BY 1"""):
        row(r["m"]).update(new_subs=int(r["new_subs"]), renewals=int(r["renewals"]),
                           sales_paid=_f(r["paid"]), sales_discount=_f(r["disc"]))
    for r in await _rows(db, """
        SELECT coalesce(a.period_month, to_char(a.expense_date, 'YYYY-MM')) m,
               coalesce(sub.code, cat.code, '') code, sum(a.amount) amt
        FROM expense_allocations a
        LEFT JOIN expense_categories cat ON cat.id = a.category_id
        LEFT JOIN expense_categories sub ON sub.id = a.subcategory_id
        WHERE a.status <> 'cancelled' AND NOT a.is_archived
        GROUP BY 1, 2"""):
        if not r["m"]:
            continue
        rr = row(r["m"])
        code = str(r["code"] or "")
        amt = _f(r["amt"])
        if code in COMMISSION_CODES:
            rr["commissions"] += amt
            grp = "commissions"
        else:
            grp = SPEND_GROUPS.get(code[:2], "other")
        rr["spend"][grp] = rr["spend"].get(grp, 0.0) + amt
        rr["spend_total"] += amt
    for r in await _rows(db, "SELECT to_char(funding_date, 'YYYY-MM') m, sum(amount) a FROM finance_funding GROUP BY 1"):
        row(r["m"])["funding"] = _f(r["a"])
    for r in await _rows(db, """SELECT to_char(revenue_date, 'YYYY-MM') m, sum(amount) a, sum(coalesce(fees_amount, 0)) f
                                FROM finance_revenues GROUP BY 1"""):
        row(r["m"]).update(collections=_f(r["a"]), gateway_fees=_f(r["f"]))
    return dict(sorted(out.items()))


async def calibrate(db: AsyncSession, today: date | None = None) -> dict:
    today = today or date.today()
    current = today.strftime("%Y-%m")
    months = await monthly_actuals(db)
    values: dict[str, float] = {}
    basis: dict[str, str] = {}

    # funnel window: complete months with ad spend and leads
    # only months in which free-lecture bookings were tracked: before that, leads were not fully recorded
    # in the CRM and the cost per lead would be overstated
    win = [m for m, r in months.items() if m < current and r["spend"].get("marketing", 0) > 0 and r["leads"] > 0 and r["trials"] > 0]
    spend = sum(months[m]["spend"].get("marketing", 0) for m in win)
    leads = sum(months[m]["leads"] for m in win)
    organic = sum(months[m]["leads_organic"] for m in win)
    paid_leads = leads - organic
    trials = sum(months[m]["trials"] for m in win)
    att = sum(months[m]["attended"] for m in win)
    dec = sum(months[m]["decided"] for m in win)
    new_subs = sum(months[m]["new_subs"] for m in win)
    wtxt = f"{win[0]} → {win[-1]}" if win else ""
    if paid_leads >= MIN_SAMPLE and spend > 0:
        values["markets.ksa.cpl"] = spend / paid_leads
        basis["markets.ksa.cpl"] = f"{spend:,.0f} ريال إعلانات ÷ {paid_leads} ليد مدفوع ({wtxt})"
    if leads >= MIN_SAMPLE:
        values["markets.ksa.organic_share"] = organic / leads
        basis["markets.ksa.organic_share"] = f"{organic} ليد مباشر من {leads} ({wtxt})"
        if trials:
            values["markets.ksa.lead_to_trial"] = min(trials / leads, 1.0)
            basis["markets.ksa.lead_to_trial"] = f"{trials} محاضرة تجريبية من {leads} ليد ({wtxt})"
    # conversion is measured on all recorded trial lectures to date: new subscribers / lectures attended
    all_trials = sum(r["trials"] for r in months.values())
    all_att = sum(r["attended"] for r in months.values())
    all_dec = sum(r["decided"] for r in months.values())
    cust_all = (await _rows(db, "SELECT count(DISTINCT right(regexp_replace(phone, '\\D', '', 'g'), 9)) c FROM subscriptions"))[0]["c"]
    cust_all = int(cust_all or 0)
    if all_dec >= MIN_SAMPLE:
        values["markets.ksa.show_rate"] = all_att / all_dec
        basis["markets.ksa.show_rate"] = f"{all_att} حضروا من {all_dec} محاضرة مجانية سُجّلت نتيجتها"
    if all_att >= 10 and cust_all:
        values["markets.ksa.trial_to_paid"] = min(cust_all / all_att, 1.0)
        basis["markets.ksa.trial_to_paid"] = f"{cust_all} مشترك جديد من {all_att} محاضرة مجانية تم حضورها"
    elif all_trials >= MIN_SAMPLE and cust_all:
        # attendance not recorded yet: take the show rate as assumed and back out the rest
        show = 0.6
        values["markets.ksa.trial_to_paid"] = min(cust_all / (all_trials * show), 1.0)
        basis["markets.ksa.trial_to_paid"] = f"{cust_all} مشترك جديد من {all_trials} محاضرة محجوزة × حضور مفترض 60%"

    # sales: discount and renewal
    s = (await _rows(db, """SELECT count(*) n, coalesce(sum(amount_paid), 0) paid, coalesce(sum(discount_amount), 0) disc,
                                   count(DISTINCT right(regexp_replace(phone, '\\D', '', 'g'), 9)) customers
                            FROM subscriptions"""))[0]
    n, paid, disc, customers = int(s["n"]), _f(s["paid"]), _f(s["disc"]), int(s["customers"])
    if n and paid + disc > 0:
        values["streams.core_b2c.avg_discount"] = disc / (paid + disc)
        basis["streams.core_b2c.avg_discount"] = f"خصم {disc:,.0f} من قيمة قائمة {paid + disc:,.0f} ({n} اشتراك)"
    # monthly content-team and tools cost: average of the last 3 complete months with spend in that group
    done = [m for m in months if m < current]
    for grp, path, label in (("content", "opex.content.monthly", "تطوير المحتوى"), ("tools", "opex.tools.monthly", "الاشتراكات الشهرية")):
        seen = [m for m in done if months[m]["spend"].get(grp, 0) > 0][-3:]
        if seen:
            avg = sum(months[m]["spend"][grp] for m in seen) / len(seen)
            values[path] = round(avg, 2)
            basis[path] = f"متوسط مصروف {label} الفعلي ({seen[0]} → {seen[-1]}): {avg:,.0f} ريال شهريًا"

    # renewal = repeat subscriptions / customers (e.g. 13 subscriptions from 12 customers = 1 / 12)
    renewals = n - customers
    if customers:
        values["streams.core_b2c.renewal_rate"] = min(renewals / customers, 0.95)
        basis["streams.core_b2c.renewal_rate"] = f"{renewals} تجديد من {customers} عميل ({n} اشتراك)"

    # current salaried team by function (Finance > staff, grouped by department name)
    staff = await _rows(db, """
        SELECT coalesce(d.name, '') dep, count(*) n, coalesce(sum(s.base_salary), 0) s
        FROM staff_members s LEFT JOIN staff_departments d ON d.id = s.department_id
        WHERE s.is_active AND s.base_salary > 0 GROUP BY 1""")
    if staff:
        mkt = cs = adm = 0.0
        cs_n = heads = 0
        for r in staff:
            name = str(r["dep"]).lower()
            amt, heads_n = _f(r["s"]), int(r["n"])
            heads += heads_n
            if "تسويق" in name or "market" in name or "جرافيك" in name:
                mkt += amt
            elif "خدمة" in name or "support" in name or "customer" in name:
                cs += amt
                cs_n += heads_n
            elif "معلم" in name or "teacher" in name or "محتوى" in name or "content" in name:
                continue  # paid per lecture / per piece: costed elsewhere in the model
            else:
                adm += amt
        values["team.marketing_payroll"] = mkt
        values["team.admin_payroll"] = adm
        values["team.base_headcount"] = heads
        basis["team.marketing_payroll"] = f"رواتب قسم التسويق في المالية: {mkt:,.0f} ريال"
        basis["team.admin_payroll"] = f"رواتب الأقسام الأخرى في المالية: {adm:,.0f} ريال"
        basis["team.base_headcount"] = f"{heads} موظف براتب ثابت (الموظفون في المالية)"
        if cs_n:
            values["team.cs_current_agents"] = cs_n
            values["team.cs_salary"] = cs / cs_n
            basis["team.cs_current_agents"] = f"{cs_n} موظف في قسم خدمة العملاء"
            basis["team.cs_salary"] = f"متوسط راتب خدمة العملاء: {cs / cs_n:,.0f} ريال"

    # money in / out so far
    funding = await _rows(db, "SELECT to_char(funding_date, 'YYYY-MM') m, sum(amount) a FROM finance_funding GROUP BY 1 ORDER BY 1")
    invested = sum(_f(r["a"]) for r in funding)
    sales_cash = paid  # subscriptions paid (held by the gateway or already in the bank)
    spent = sum(r["spend_total"] for r in months.values())
    if invested or spent:
        values["financing.owner_invested_to_date"] = invested
        values["financing.opening_cash"] = invested + sales_cash - spent
        basis["financing.owner_invested_to_date"] = f"تمويل الملاك المسجل في المالية ({len(funding)} دفعة)"
        basis["financing.opening_cash"] = f"تمويل {invested:,.0f} + مبيعات {sales_cash:,.0f} − مصروفات {spent:,.0f}"

    return {
        "cal_version": CAL_VERSION,
        "as_of": today.isoformat(),
        "values": values,
        "basis": basis,
        "window": win,
        "funding_history": [{"month": r["m"], "amount": _f(r["a"])} for r in funding],
        "totals": {"invested": invested, "sales_paid": paid, "sales_discount": disc, "subscriptions": n,
                   "customers": customers, "renewals": renewals, "spent": spent},
        "months": list(months.values()),
    }
