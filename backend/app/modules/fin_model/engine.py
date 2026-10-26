"""
Investor financial model - pure calculation engine (no database access).

compute(assumptions, scenario) -> dict with monthly and annual statements,
KPIs, unit economics, financing and valuation. Everything is derived from
the assumptions dict (see defaults.py), so the same inputs always produce
the same numbers, and the analyst can change anything without code.

Accounting conventions (kept simple, but every statement reconciles - see
``checks`` in the result):
* Billing happens when a customer enrols (or renews). The amount billed is
  what the customer pays; once the company is VAT registered that amount
  includes VAT, so revenue is the amount / (1 + VAT).
* Revenue is recognised as lessons are delivered (deferred revenue holds
  what is billed but not yet taught). Cash arrives `payment_lag_months`
  after billing (receivables hold the gap).
* Teachers are paid per scheduled lesson, whether or not the student shows
  up; trial lectures are paid per booking.
* Zakat is accrued at the end of each model year and paid
  `zakat_pay_lag_months` later.
* Balance sheet: cash + receivables + net fixed assets
  = deferred revenue + VAT payable + zakat payable + loan + equity.
"""
from __future__ import annotations

import copy
import math
import random
from typing import Any

SCENARIOS = ("conservative", "base", "optimistic")


# --------------------------------------------------------------- helpers
# bump when the calculation changes so cached results are recomputed
ENGINE_VERSION = 9

def ym_index(ym: str | None, start: str) -> int | None:
    if not ym:
        return None
    y, m = (int(x) for x in ym.split("-")[:2])
    sy, sm = (int(x) for x in start.split("-")[:2])
    return (y * 12 + m) - (sy * 12 + sm)


def idx_ym(i: int, start: str) -> str:
    sy, sm = (int(x) for x in start.split("-")[:2])
    t = sy * 12 + (sm - 1) + i
    return f"{t // 12:04d}-{t % 12 + 1:02d}"


def cal_month(i: int, start: str) -> int:
    return int(idx_ym(i, start)[5:7])


def ramp(start: float, target: float, months: float, t: int) -> float:
    if t < 0:
        return start
    if not months or months <= 0:
        return target
    return start + (target - start) * min(t / months, 1.0)


def get_path(d: dict, path: str):
    """'markets.ksa.cpl' -> list items are matched by their 'id'."""
    cur: Any = d
    for part in path.split("."):
        if isinstance(cur, list):
            cur = next((x for x in cur if str(x.get("id")) == part), None)
        elif isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
        if cur is None:
            return None
    return cur


def set_path(d: dict, path: str, value) -> bool:
    parts = path.split(".")
    cur: Any = d
    for part in parts[:-1]:
        if isinstance(cur, list):
            cur = next((x for x in cur if str(x.get("id")) == part), None)
        elif isinstance(cur, dict):
            cur = cur.get(part)
        if cur is None:
            return False
    if isinstance(cur, dict):
        cur[parts[-1]] = value
        return True
    return False


_PROFILE_CACHE: dict[tuple, tuple[list[float], list[float]]] = {}


def teacher_capacity_lessons(team: dict) -> float:
    """Lectures one teacher can give per month (60-80)."""
    cap = float(team.get("teacher_capacity_lessons", 70) or 0)
    return cap if cap > 0 else 70.0


# expense categories shown to the board; every cost line of the model maps to exactly one
EXPENSE_CATEGORIES = (
    "teachers", "content", "marketing_team", "ads", "marketing_extra", "cs", "quality", "tools",
    "commissions", "payment_fees", "admin", "launch",
)


def seasonality_norm(mk: dict) -> dict[int, float]:
    """Calendar-month factors rescaled to average 1 (a year = 12 x the monthly figure)."""
    raw = {m: float((mk.get("seasonality") or {}).get(str(m), 1.0)) for m in range(1, 13)}
    avg = sum(raw.values()) / 12 or 1.0
    return {m: v / avg for m, v in raw.items()}


def delivery_profile(service_weeks: float, weeks_per_month: float) -> tuple[list[float], list[float]]:
    """(share of the service delivered in month k, share of renewals falling in month k)
    for customers starting uniformly during month 0."""
    key = (round(service_weeks, 4), round(weeks_per_month, 4))
    if key in _PROFILE_CACHE:
        return _PROFILE_CACHE[key]
    W, M = max(service_weeks, 1e-9), weeks_per_month
    n = int(math.ceil(W / M)) + 2
    deliver = [0.0] * n
    renew = [0.0] * n
    samples = 400
    for j in range(samples):
        s = (j + 0.5) / samples * M
        e = s + W
        for k in range(n):
            a, b = k * M, (k + 1) * M
            ov = max(0.0, min(b, e) - max(a, s))
            deliver[k] += ov / W / samples
        renew[min(int(e // M), n - 1)] += 1 / samples
    while len(deliver) > 1 and deliver[-1] < 1e-12 and renew[-1] < 1e-12:
        deliver.pop()
        renew.pop()
    _PROFILE_CACHE[key] = (deliver, renew)
    return deliver, renew


# --------------------------------------------------------------- scenario
def apply_scenario(a: dict, name: str) -> dict:
    a = copy.deepcopy(a)
    sc = (a.get("scenarios") or {}).get(name) or {}
    conv = float(sc.get("conversion", 1.0))
    cplm = float(sc.get("cpl", 1.0))
    ren = float(sc.get("renewal", 1.0))
    vol = float(sc.get("growth_volume", 1.0))
    tvol = float(sc.get("trials_volume", 1.0))
    price = float(sc.get("price", 1.0))
    delay = int(sc.get("delay_months", 0) or 0)
    start = a["general"]["start_month"]
    for mk in a.get("markets", []):
        mk["cpl"] = mk["cpl"] * cplm
        mk["trials_by_year"] = [float(v) * tvol for v in (mk.get("trials_by_year") or [0])]
        for f in ("trial_to_paid", "trial_to_paid_target"):
            mk[f] = min(mk[f] * conv, 1.0)
        if delay and (ym_index(mk.get("start_month"), start) or 0) > 0:
            mk["start_month"] = idx_ym(ym_index(mk["start_month"], start) + delay, start)
    for s in a.get("streams", []):
        s["list_price"] = s["list_price"] * price
        for f in ("renewal_rate", "renewal_rate_target"):
            s[f] = min(s[f] * ren, 0.95)
        if s.get("driver") == "growth":
            s["initial_monthly"] = s["initial_monthly"] * vol
            s["max_monthly"] = s["max_monthly"] * vol
        if delay and (ym_index(s.get("start_month"), start) or 0) > 0:
            s["start_month"] = idx_ym(ym_index(s["start_month"], start) + delay, start)
    return a


# --------------------------------------------------------------- core run
def _run(a: dict, loan_amount: float) -> dict:
    g = a["general"]
    start = g["start_month"]
    H = int(g.get("horizon_months", 60))
    M = float(g.get("weeks_per_month", 4.345))
    tax, pay, team, fin = a["tax"], a["payments"], a["team"], a["financing"]
    vat_rate = float(tax.get("vat_rate", 0.15))
    billing_basis = g.get("revenue_basis", "billing") != "delivery"

    markets = {m["id"]: m for m in a.get("markets", [])}
    streams = [s for s in a.get("streams", []) if s.get("enabled", True)]

    # ---- 1. marketing funnels
    funnel = {}
    for mid, mk in markets.items():
        ms = ym_index(mk.get("start_month"), start) or 0
        rows = []
        for i in range(H):
            y = i // 12
            if i < ms or not any(s.get("driver") == "funnel" and s.get("market") == mid
                                 and i >= (ym_index(s.get("start_month"), start) or 0) for s in streams):
                rows.append({"spend": 0.0, "leads": 0.0, "trials": 0.0, "attended": 0.0, "paid": 0.0, "trial_cost": 0.0})
                continue
            tby = mk.get("trials_by_year") or [0]
            season = seasonality_norm(mk)[cal_month(i, start)]
            t = i - ms
            rm = float(mk.get("ramp_months", 12))
            trials = float(tby[min(y, len(tby) - 1)]) * season
            l2t = ramp(mk["lead_to_trial"], mk["lead_to_trial_target"], rm, t)
            leads = trials / l2t if l2t > 0 else 0.0
            # organic / referral / direct-visit leads cost nothing; the rest come from paid ads
            org = min(ramp(float(mk.get("organic_share", 0)), float(mk.get("organic_share_target", mk.get("organic_share", 0))), rm, t), 0.9)
            cpl = float(mk["cpl"]) * (1 + float(mk.get("cpl_growth_yoy", 0))) ** y
            spend = leads * (1 - org) * cpl
            att = trials * ramp(mk["show_rate"], mk["show_rate_target"], rm, t)
            paid = att * ramp(mk["trial_to_paid"], mk["trial_to_paid_target"], rm, t)
            rows.append({"spend": spend, "leads": leads, "trials": trials, "attended": att, "paid": paid,
                         "trial_cost": trials * float(mk.get("trial_cost", 0))})
        funnel[mid] = rows

    # ---- 2. enrolments, billing, delivery per stream
    S = {}
    for s in streams:
        sid = s["id"]
        st = ym_index(s.get("start_month"), start) or 0
        lessons = float(s.get("lessons", 0) or 0)
        lpw = float(s.get("lessons_per_week", 1) or 1)
        weeks = lessons / lpw if lessons > 0 else float(s.get("service_months", 1)) * M
        deliver, renew_prof = delivery_profile(weeks, M)
        net_price = float(s["list_price"]) * (1 - float(s.get("avg_discount", 0)))
        new = [0.0] * H
        if s.get("driver") == "funnel":
            mid = s.get("market")
            for i in range(H):
                if i < st or mid not in funnel:
                    continue
                act = [x for x in streams if x.get("driver") == "funnel" and x.get("market") == mid
                       and i >= (ym_index(x.get("start_month"), start) or 0)]
                tot = sum(float(x.get("funnel_share", 0)) for x in act) or 1.0
                new[i] = funnel[mid][i]["paid"] * float(s.get("funnel_share", 0)) / tot
        else:
            active = set(int(x) for x in (s.get("active_months") or range(1, 13)))
            n_active = 0
            for i in range(H):
                if i < st or cal_month(i, start) not in active:
                    continue
                v = float(s["initial_monthly"]) * (1 + float(s.get("monthly_growth", 0))) ** n_active
                new[i] = min(v, float(s.get("max_monthly", v)))
                n_active += 1
        total = [0.0] * H
        renewals = [0.0] * H
        for i in range(H):
            r = ramp(float(s.get("renewal_rate", 0)), float(s.get("renewal_rate_target", 0)),
                     float(s.get("renewal_ramp_months", 12)), i - st)
            carry = sum(renew_prof[k] * total[i - k] for k in range(1, len(renew_prof)) if i - k >= 0)
            denom = 1 - r * renew_prof[0]
            total[i] = (new[i] + r * carry) / denom if denom > 0 else new[i]
            renewals[i] = total[i] - new[i]
        S[sid] = {"s": s, "new": new, "renewals": renewals, "total": total, "deliver": deliver,
                  "net_price": net_price, "weeks": weeks, "lessons": lessons, "lpw": lpw}

    # ---- 3. VAT registration month
    billed_all = [sum(S[k]["total"][i] * S[k]["net_price"] for k in S) for i in range(H)]
    mode = tax.get("vat_mode", "auto")
    vat_from = None
    if mode == "month":
        vat_from = ym_index(tax.get("vat_from_month"), start)
    elif mode == "auto":
        thr = float(tax.get("vat_threshold", 375000))
        for i in range(H):
            if sum(billed_all[max(0, i - 11): i + 1]) > thr:
                vat_from = i + 1
                break
    registered = [vat_from is not None and i >= vat_from for i in range(H)]

    # ---- 4. per-stream money
    gfp, gff = float(pay.get("gateway_fee_pct", 0)), float(pay.get("gateway_fee_fixed", 0))
    for sid, d in S.items():
        s = d["s"]
        lag = int(s.get("payment_lag_months", 0) or 0)
        gross = [d["total"][i] * d["net_price"] for i in range(H)]
        net = [gross[i] / (1 + vat_rate) if registered[i] else gross[i] for i in range(H)]
        vat = [gross[i] - net[i] for i in range(H)]
        # lessons physically taught each month (capacity, active students)
        stud_lessons = [sum(d["deliver"][k] * d["total"][i - k] for k in range(len(d["deliver"])) if i - k >= 0) * d["lessons"]
                        for i in range(H)]
        grp = max(float(s.get("group_size", 1) or 1), 1.0)
        if billing_basis:
            # revenue = subscriptions paid in the month; the lessons they buy are costed in the same month
            rev = list(net)
            teacher = [d["total"][i] * d["lessons"] / grp * float(s.get("teacher_cost_per_lesson", 0)) for i in range(H)]
        else:
            rev = [sum(d["deliver"][k] * net[i - k] for k in range(len(d["deliver"])) if i - k >= 0) for i in range(H)]
            teacher = [x / grp * float(s.get("teacher_cost_per_lesson", 0)) for x in stud_lessons]
        coll = [gross[i - lag] if i - lag >= 0 else 0.0 for i in range(H)]
        coll_n = [d["total"][i - lag] if i - lag >= 0 else 0.0 for i in range(H)]
        gw = [(coll[i] * gfp + coll_n[i] * gff) if s.get("uses_gateway") else 0.0 for i in range(H)]
        comm = [d["total"][i] * float(s.get("commission_per_enrolment", 0)) for i in range(H)]
        if d["lessons"] > 0:
            active = [x / (d["lpw"] * M) for x in stud_lessons]
        else:
            sm_ = int(s.get("service_months", 12) or 12)
            active = [sum(d["total"][max(0, i - sm_ + 1): i + 1]) for i in range(H)]
        st = ym_index(s.get("start_month"), start) or 0
        launch = [float(s.get("launch_cost", 0)) if i == st else 0.0 for i in range(H)]
        d.update(gross=gross, net=net, vat=vat, revenue=rev, student_lessons=stud_lessons,
                 group_lessons=[x / grp for x in stud_lessons], teacher=teacher, collections=coll,
                 gateway=gw, commission=comm, active=active, launch=launch)

    # ---- 5. team & capacity
    raise_m = int(team.get("raise_month", 1))
    raise_f = []
    n = 0
    for i in range(H):
        if i > 0 and cal_month(i, start) == raise_m:
            n += 1
        raise_f.append((1 + float(team.get("annual_raise", 0))) ** n)
    trials_all = [sum(funnel[m][i]["trials"] for m in funnel) for i in range(H)]
    teach_lessons = [sum(S[k]["group_lessons"][i] for k in S) + trials_all[i] for i in range(H)]
    cap = teacher_capacity_lessons(team)
    teachers = [math.ceil(x / cap - 1e-9) for x in teach_lessons]
    active_all = [sum(S[k]["active"][i] for k in S) for i in range(H)]

    spend_all = [sum(funnel[m][i]["spend"] for m in funnel) for i in range(H)]
    subs_all = [sum(S[k]["total"][i] for k in S) for i in range(H)]
    payroll, onboarding, headcount, pay_cat = [], [], [], []
    max_teachers = 0
    oncost = (1 + float(team.get("employer_oncost", 0))) * (1 + float(team.get("intl_transfer_fee_pct", 0)))

    def budget(key: str, y: int) -> float:
        """Monthly cost of a team in model year y (index 0 = year 1), as set by management."""
        arr = team.get(key) or [0.0]
        return float(arr[min(y, len(arr) - 1)])

    for i in range(H):
        y = i // 12
        # salaried teams follow the monthly budgets per year (actual salaries, raises included);
        # only teachers scale with volume, through the lectures they give
        cat = {"marketing_team": budget("marketing_team_monthly_by_year", y),
               "cs": budget("cs_monthly_by_year", y),
               "quality": budget("quality_monthly_by_year", y),
               "admin": float(team.get("admin_payroll", 0)) * raise_f[i], "content": 0.0}
        hires_n = 0
        for h in team.get("hires", []):
            hi = ym_index(h.get("month"), start)
            if hi is not None and i >= hi:
                c = h.get("category") or "admin"
                c = "marketing_team" if c == "marketing" else c
                c = c if c in cat else "admin"
                # planned hires get the yearly raise from their start
                cat[c] += float(h.get("salary", 0)) * float(h.get("count", 1)) * raise_f[i] / raise_f[hi]
                hires_n += int(h.get("count", 1))
        cat = {k: v * oncost for k, v in cat.items()}
        pay_cat.append(cat)
        payroll.append(sum(cat.values()))
        new_t = max(0, teachers[i] - max_teachers)
        max_teachers = max(max_teachers, teachers[i])
        onboarding.append(new_t * float(team.get("teacher_onboarding_cost", 0)) if i > 0 else 0.0)
        headcount.append({"fixed": int(team.get("base_headcount", 0)) + hires_n, "teachers": teachers[i]})

    # ---- 6. other opex & capex
    opex_lines = {}
    for o in a.get("opex", []):
        st = ym_index(o.get("start_month"), start) or 0
        en = ym_index(o.get("end_month"), start)
        opex_lines[o["id"]] = [float(o.get("monthly", 0)) * (1 + float(o.get("growth_yoy", 0))) ** (i // 12)
                               if i >= st and (en is None or i <= en) else 0.0 for i in range(H)]
    capex = [0.0] * H
    dep = [0.0] * H
    for c in a.get("capex", []):
        ci = ym_index(c.get("month"), start)
        if ci is None or ci >= H or ci < 0:
            continue
        amt = float(c.get("amount", 0))
        life = max(int(c.get("life_months", 36) or 36), 1)
        capex[ci] += amt
        for i in range(ci, min(H, ci + life)):
            dep[i] += amt / life

    # ---- 7. loan schedule
    i_m = float(fin.get("loan_rate", 0)) / 12
    draw_i = ym_index(fin.get("loan_draw_month"), start) or 0
    grace = int(fin.get("loan_grace_months", 0))
    tenor = int(fin.get("loan_tenor_months", 48))
    n_amort = max(tenor - grace, 1)
    pmt = loan_amount * i_m / (1 - (1 + i_m) ** -n_amort) if i_m > 0 else loan_amount / n_amort
    loan_draw, interest, principal, loan_bal, fee = [0.0] * H, [0.0] * H, [0.0] * H, [0.0] * H, [0.0] * H
    bal = 0.0
    for i in range(H):
        if loan_amount > 0 and i == draw_i:
            loan_draw[i] = loan_amount
            fee[i] = loan_amount * float(fin.get("loan_upfront_fee", 0))
            bal = loan_amount
        elif bal > 1e-6 and i > draw_i:
            k = i - draw_i  # months since draw
            interest[i] = bal * i_m
            if k > grace:
                principal[i] = min(bal, pmt - interest[i])
                bal -= principal[i]
        loan_bal[i] = bal
    equity_in = [0.0] * H
    for e in fin.get("equity_injections", []) or []:
        ei = ym_index(e.get("month"), start)
        if ei is not None and 0 <= ei < H:
            equity_in[ei] += float(e.get("amount", 0))

    # ---- 8. statements
    months = []
    cash = float(fin.get("opening_cash", 0))
    equity = cash
    ar = deferred = vat_pay = zakat_pay = nfa = 0.0
    cum_ni_year = 0.0
    zakat_due: dict[int, float] = {}
    zl = int(tax.get("zakat_pay_lag_months", 4))
    checks_ok = True
    max_diff = 0.0
    prev_vat = 0.0
    for i in range(H):
        rev = sum(S[k]["revenue"][i] for k in S)
        teacher = sum(S[k]["teacher"][i] for k in S)
        trials_cost = sum(funnel[m][i]["trial_cost"] for m in funnel)
        comm = sum(S[k]["commission"][i] for k in S)
        gw = sum(S[k]["gateway"][i] for k in S)
        cogs = teacher + trials_cost + comm + gw
        gp = rev - cogs
        mkt = spend_all[i]
        launch = sum(S[k]["launch"][i] for k in S)
        other = sum(v[i] for v in opex_lines.values())
        opex = mkt + payroll[i] + onboarding[i] + other + launch
        ebitda = gp - opex
        ebit = ebitda - dep[i]
        fin_cost = interest[i] + fee[i]
        ebt = ebit - fin_cost
        # zakat accrued in the last month of each model year
        cum_ni_year += ebt
        zakat = 0.0
        if (i + 1) % 12 == 0 or i == H - 1:
            nfa_end = nfa + capex[i] - dep[i]
            base_profit = cum_ni_year
            base_equity = (equity + ebt) + loan_bal[i] - nfa_end
            zbase = max(0.0, base_profit, base_equity)
            zakat = zbase * float(tax.get("zakat_rate", 0.025))
            if zakat > 0:
                zakat_due[i + zl] = zakat_due.get(i + zl, 0.0) + zakat
            cum_ni_year = 0.0
        ni = ebt - zakat
        exp = {c: 0.0 for c in EXPENSE_CATEGORIES}
        exp["teachers"] = teacher + trials_cost + onboarding[i]
        exp["ads"] = mkt
        exp["commissions"] = comm
        exp["payment_fees"] = gw
        exp["launch"] = launch
        for c, v in pay_cat[i].items():
            exp[c] += v
        for o in a.get("opex", []):
            c = o.get("category") or "admin"
            exp[c if c in exp else "admin"] += opex_lines[o["id"]][i]
        # balance-sheet movements
        billed_gross = sum(S[k]["gross"][i] for k in S)
        billed_net = sum(S[k]["net"][i] for k in S)
        vat_out = sum(S[k]["vat"][i] for k in S)
        collections = sum(S[k]["collections"][i] for k in S)
        ar += billed_gross - collections
        deferred += billed_net - rev
        vat_paid = prev_vat
        vat_pay += vat_out - vat_paid
        prev_vat = vat_out
        zakat_paid = zakat_due.get(i, 0.0)
        zakat_pay += zakat - zakat_paid
        nfa += capex[i] - dep[i]
        cfo = collections - gw - (teacher + trials_cost + comm) - opex - vat_paid - zakat_paid
        cfi = -capex[i]
        cff = loan_draw[i] - fee[i] - interest[i] - principal[i] + equity_in[i]
        net_cf = cfo + cfi + cff
        cash += net_cf
        equity += ni + equity_in[i]
        assets = cash + ar + nfa
        liab = deferred + vat_pay + zakat_pay + loan_bal[i]
        diff = assets - (liab + equity)
        max_diff = max(max_diff, abs(diff))
        if abs(diff) > 0.5:
            checks_ok = False
        months.append({
            "i": i, "month": idx_ym(i, start), "year": i // 12 + 1,
            "vat_registered": registered[i],
            "revenue": rev, "revenue_by_stream": {k: S[k]["revenue"][i] for k in S},
            "billed_gross": billed_gross, "collections": collections,
            "new_customers": sum(S[k]["new"][i] for k in S),
            "renewals": sum(S[k]["renewals"][i] for k in S),
            "enrolments_by_stream": {k: S[k]["total"][i] for k in S},
            "new_by_stream": {k: S[k]["new"][i] for k in S},
            "active_students": active_all[i],
            "leads": sum(funnel[m][i]["leads"] for m in funnel),
            "trials": trials_all[i],
            "attended": sum(funnel[m][i]["attended"] for m in funnel),
            "teacher_cost": teacher, "trial_cost": trials_cost, "commissions": comm, "gateway_fees": gw,
            "cogs": cogs, "gross_profit": gp,
            "marketing": mkt, "payroll": payroll[i], "teacher_onboarding": onboarding[i],
            "launch_costs": launch, "other_opex": other,
            "opex_by_line": {k: v[i] for k, v in opex_lines.items()},
            "opex": opex, "ebitda": ebitda, "depreciation": dep[i], "ebit": ebit,
            "interest": interest[i], "loan_fees": fee[i], "ebt": ebt, "zakat": zakat, "net_income": ni,
            "cfo": cfo, "capex": capex[i], "loan_draw": loan_draw[i], "loan_principal": principal[i],
            "equity_injection": equity_in[i], "vat_paid": vat_paid, "zakat_paid": zakat_paid,
            "net_cash_flow": net_cf, "cash": cash,
            "receivables": ar, "deferred_revenue": deferred, "vat_payable": vat_pay, "zakat_payable": zakat_pay,
            "fixed_assets": nfa, "loan_balance": loan_bal[i], "equity": equity,
            "teacher_lessons": teach_lessons[i], "headcount": headcount[i],
            "subscriptions": subs_all[i], "expense_by_category": exp,
        })
    return {"months": months, "streams": S, "funnel": funnel, "vat_from": vat_from,
            "checks": {"balance_sheet_ok": checks_ok, "max_difference": round(max_diff, 4)},
            "pmt": pmt, "draw_i": draw_i}


# --------------------------------------------------------------- summaries
FLOW_KEYS = ("subscriptions", "revenue", "billed_gross", "collections", "new_customers", "renewals", "leads", "trials", "attended",
             "teacher_cost", "trial_cost", "commissions", "gateway_fees", "cogs", "gross_profit", "marketing",
             "payroll", "teacher_onboarding", "launch_costs", "other_opex", "opex", "ebitda", "depreciation", "ebit",
             "interest", "loan_fees", "ebt", "zakat", "net_income", "cfo", "capex", "loan_draw", "loan_principal",
             "equity_injection", "vat_paid", "zakat_paid", "net_cash_flow")
STOCK_KEYS = ("cash", "receivables", "deferred_revenue", "vat_payable", "zakat_payable", "fixed_assets",
              "loan_balance", "equity")


def _annual(months: list[dict], start: str) -> list[dict]:
    years = []
    for y in range(1, months[-1]["year"] + 1):
        ms = [m for m in months if m["year"] == y]
        row: dict[str, Any] = {"year": y, "from": ms[0]["month"], "to": ms[-1]["month"]}
        for k in FLOW_KEYS:
            row[k] = sum(m[k] for m in ms)
        for k in STOCK_KEYS:
            row[k] = ms[-1][k]
        row["revenue_by_stream"] = {}
        row["enrolments_by_stream"] = {}
        for m in ms:
            for k, v in m["revenue_by_stream"].items():
                row["revenue_by_stream"][k] = row["revenue_by_stream"].get(k, 0.0) + v
            for k, v in m["enrolments_by_stream"].items():
                row["enrolments_by_stream"][k] = row["enrolments_by_stream"].get(k, 0.0) + v
        row["expense_by_category"] = {}
        for m in ms:
            for k, v in m["expense_by_category"].items():
                row["expense_by_category"][k] = row["expense_by_category"].get(k, 0.0) + v
        row["opex_by_line"] = {}
        for m in ms:
            for k, v in m["opex_by_line"].items():
                row["opex_by_line"][k] = row["opex_by_line"].get(k, 0.0) + v
        row["active_students_avg"] = sum(m["active_students"] for m in ms) / len(ms)
        row["active_students_end"] = ms[-1]["active_students"]
        row["teachers_end"] = ms[-1]["headcount"]["teachers"]
        row["fixed_headcount_end"] = ms[-1]["headcount"]["fixed"]
        rev = row["revenue"]
        row["gross_margin"] = row["gross_profit"] / rev if rev else None
        row["ebitda_margin"] = row["ebitda"] / rev if rev else None
        row["net_margin"] = row["net_income"] / rev if rev else None
        debt_service = row["interest"] + row["loan_principal"]
        row["dscr"] = (row["ebitda"] - row["zakat_paid"]) / debt_service if debt_service > 0 else None
        years.append(row)
    return years


def _irr(flows: list[float]) -> float | None:
    """Monthly IRR by bisection, returned annualised."""
    if not flows or all(f >= 0 for f in flows) or all(f <= 0 for f in flows):
        return None

    def npv(r):
        return sum(f / (1 + r) ** t for t, f in enumerate(flows))

    lo, hi = -0.99, 10.0
    if npv(lo) * npv(hi) > 0:
        return None
    for _ in range(200):
        mid = (lo + hi) / 2
        if npv(lo) * npv(mid) <= 0:
            hi = mid
        else:
            lo = mid
    return (1 + (lo + hi) / 2) ** 12 - 1


def _unit_economics(a: dict, run: dict) -> list[dict]:
    S, funnel, months = run["streams"], run["funnel"], run["months"]
    H = len(months)
    M = float(a["general"].get("weeks_per_month", 4.345))
    vat = float(a["tax"].get("vat_rate", 0.15))
    pay = a["payments"]
    out = []
    for sid, d in S.items():
        s = d["s"]
        st = ym_index(s.get("start_month"), a["general"]["start_month"]) or 0
        # evaluate in the stream's 13th-24th months (steady state), VAT as in that period
        win = [i for i in range(st + 12, min(st + 24, H))] or [i for i in range(st, H)]
        if not win:
            continue
        reg = months[win[-1]]["vat_registered"]
        price_paid = d["net_price"]
        price_net = price_paid / (1 + vat) if reg else price_paid
        grp = max(float(s.get("group_size", 1) or 1), 1.0)
        teacher = d["lessons"] / grp * float(s.get("teacher_cost_per_lesson", 0))
        gw = (price_paid * float(pay.get("gateway_fee_pct", 0)) + float(pay.get("gateway_fee_fixed", 0))) if s.get("uses_gateway") else 0.0
        comm = float(s.get("commission_per_enrolment", 0))
        contribution = price_net - teacher - gw - comm
        r_t = float(s.get("renewal_rate_target", 0))
        purchases = 1 / (1 - r_t) if r_t < 1 else None
        ltv = contribution * purchases if purchases else None
        cac = None
        if s.get("driver") == "funnel":
            mid = s.get("market")
            spend = sum(funnel[mid][i]["spend"] + funnel[mid][i]["trial_cost"] for i in win)
            paid = sum(funnel[mid][i]["paid"] for i in win)
            cac = spend / paid if paid else None
        cycle_months = d["weeks"] / M
        payback = (cac / (contribution / cycle_months)) if (cac and contribution > 0 and cycle_months > 0) else None
        out.append({
            "stream": sid, "name_ar": s.get("name_ar"), "name_en": s.get("name_en"),
            "price_list": float(s["list_price"]), "discount": float(s.get("avg_discount", 0)),
            "price_paid": price_paid, "price_net": price_net, "vat_registered": reg,
            "teacher_cost": teacher, "gateway_fee": gw, "commission": comm,
            "contribution": contribution, "contribution_margin": contribution / price_net if price_net else None,
            "renewal_rate_target": r_t, "expected_purchases": purchases, "ltv": ltv, "cac": cac,
            "ltv_cac": (ltv / cac) if (ltv is not None and cac) else None,
            "payback_months": payback, "cycle_months": cycle_months,
            "lesson_net_revenue": (price_net * grp / d["lessons"]) if d["lessons"] else None,
            "teacher_cost_per_lesson": float(s.get("teacher_cost_per_lesson", 0)),
        })
    return out


def _valuation(a: dict, years: list[dict], months: list[dict]) -> dict:
    v = a["valuation"]
    r = float(v.get("discount_rate", 0.25))
    fcf = []
    prev_nwc = 0.0
    for y in years:
        nwc = y["receivables"] - y["deferred_revenue"] - y["vat_payable"] - y["zakat_payable"]
        f = y["ebitda"] - y["zakat_paid"] - y["capex"] - (nwc - prev_nwc)
        prev_nwc = nwc
        fcf.append(f)
    pv = sum(f / (1 + r) ** (t + 1) for t, f in enumerate(fcf))
    last = years[-1]
    if v.get("terminal_method") == "gordon":
        gr = float(v.get("terminal_growth", 0.04))
        tv = fcf[-1] * (1 + gr) / (r - gr) if r > gr and fcf[-1] > 0 else 0.0
    else:
        tv = last["revenue"] * float(v.get("exit_revenue_multiple", 2.0))
    pv_tv = tv / (1 + r) ** len(years)
    ev = pv + pv_tv
    opening_cash = months[0]["cash"] - months[0]["net_cash_flow"]
    equity_today = ev + opening_cash
    exit_equity = tv - last["loan_balance"] + last["cash"]
    return {"discount_rate": r, "method": v.get("terminal_method", "multiple"),
            "fcf": fcf, "pv_fcf": pv, "terminal_value": tv, "pv_terminal": pv_tv,
            "enterprise_value": ev, "equity_value_today": equity_today,
            "exit_enterprise_value": tv, "exit_equity_value": exit_equity}


def compute(assumptions: dict, scenario: str = "base", funding_history: list[dict] | None = None) -> dict:
    a = apply_scenario(assumptions, scenario if scenario in SCENARIOS else "base")
    fin = a["financing"]
    start = a["general"]["start_month"]
    # 1) no loan: the raw funding need
    raw = _run(a, 0.0)
    min_raw = min(m["cash"] for m in raw["months"])
    first12 = raw["months"][:12]
    fixed12 = sum(m["payroll"] + m["other_opex"] + m["marketing"] for m in first12) / max(len(first12), 1)
    buffer = fixed12 * float(fin.get("cash_buffer_months", 3))
    rounding = float(fin.get("loan_rounding", 50000)) or 50000
    suggested = 0.0
    financeable = True
    # months before the loan arrives are bridged by the owners (as they do today)
    draw_i = ym_index(fin.get("loan_draw_month"), start) or 0
    bridge = 0.0
    if draw_i > 0:
        pre = min(m["cash"] for m in raw["months"][:draw_i])
        if pre < 0:
            bridge = math.ceil(-pre / 1000.0) * 1000.0
            fin.setdefault("equity_injections", [])
            fin["equity_injections"] = list(fin["equity_injections"]) + [{"month": start, "amount": bridge, "bridge": True}]
            raw = _run(a, 0.0)
            min_raw = min(m["cash"] for m in raw["months"])
    min_after = min(m["cash"] for m in raw["months"][draw_i:])
    need = max(0.0, buffer - min_after)
    suggested = math.ceil(need / rounding) * rounding if need > 0 else 0.0
    loan = suggested if fin.get("loan_mode", "auto") == "auto" else float(fin.get("loan_amount", 0))
    run = _run(a, loan)
    financeable = min(m["cash"] for m in run["months"][draw_i:]) >= 0
    last12 = sum(m["ebitda"] for m in run["months"][-12:])
    if fin.get("loan_mode", "auto") == "auto" and loan > 0 and not financeable and last12 > 0:
        # repayments open a second cash gap: borrow a little more so the instalments are covered too
        # (only when operations turn profitable - a plan that never does is reported as not financeable)
        cap_loan = max(1.5 * loan, loan + 4 * rounding)
        trial_loan = loan
        while trial_loan < cap_loan:
            trial_loan += rounding
            trial_run = _run(a, trial_loan)
            low = min(m["cash"] for m in trial_run["months"][draw_i:])
            if low >= 0 and not financeable:
                loan, run, financeable, suggested = trial_loan, trial_run, True, trial_loan
            if low >= buffer:
                loan, run, suggested = trial_loan, trial_run, trial_loan
                break
    # if repayments start before the business can carry them, find the grace period that works
    suggested_grace = None
    if loan > 0 and not financeable:
        base_grace = int(fin.get("loan_grace_months", 0))
        for gr in range(base_grace + 6, 61, 6):
            trial = copy.deepcopy(a)
            trial["financing"]["loan_grace_months"] = gr
            trial["financing"]["loan_tenor_months"] = max(int(fin.get("loan_tenor_months", 48)), gr + 24)
            if min(m["cash"] for m in _run(trial, loan)["months"][draw_i:]) >= 0:
                suggested_grace = gr
                break
    # whatever the loan cannot cover is shown as additional funding (owners / investors) in the month the
    # cash would first turn negative, so the statements never carry a negative cash balance
    funding_gap = 0.0
    for _ in range(12):
        neg = next((m for m in run["months"] if m["cash"] < -0.5), None)
        if neg is None:
            break
        deepest = -min(m["cash"] for m in run["months"] if m["i"] >= neg["i"])
        amt = math.ceil(deepest / 10000.0) * 10000.0
        fin["equity_injections"] = list(fin.get("equity_injections") or []) + [{"month": neg["month"], "amount": amt, "gap": True}]
        funding_gap += amt
        run = _run(a, loan)
    months = run["months"]
    years = _annual(months, start)

    # KPIs
    def first_sustained(key):
        """First month from which the monthly figure of `key` stays at or above zero
        (the month operations start earning and keep earning)."""
        for i in range(len(months)):
            if all(m[key] >= -0.5 for m in months[i:]):
                return months[i]["month"]
        return None

    min_cash_m = min(months, key=lambda m: m["cash"])
    repaid = next((m["month"] for m in months if m["i"] > run["draw_i"] and m["loan_balance"] < 0.5), None) if loan > 0 else None
    y1, y5 = years[0], years[-1]
    cagr = ((y5["revenue"] / y1["revenue"]) ** (1 / (len(years) - 1)) - 1) if (y1["revenue"] > 0 and len(years) > 1) else None
    valuation = _valuation(a, years, months)

    # owners: money put in so far (+ injections) vs. their equity at exit
    invested = float(fin.get("owner_invested_to_date", 0)) + sum(m["equity_injection"] for m in months)
    flows: dict[int, float] = {}
    hist = funding_history or []
    if hist:
        for h in hist:
            k = ym_index(h["month"], start)
            flows[k] = flows.get(k, 0.0) - float(h["amount"])
    elif float(fin.get("owner_invested_to_date", 0)) > 0:
        flows[-3] = -float(fin.get("owner_invested_to_date", 0))
    for m in months:
        if m["equity_injection"]:
            flows[m["i"]] = flows.get(m["i"], 0.0) - m["equity_injection"]
    last_i = months[-1]["i"]
    flows[last_i] = flows.get(last_i, 0.0) + valuation["exit_equity_value"]
    lo_i = min(flows)
    seq = [flows.get(k, 0.0) for k in range(lo_i, last_i + 1)]
    owner_irr = _irr(seq)
    moic = valuation["exit_equity_value"] / invested if invested > 0 else None

    kpis = {
        "revenue_y1": y1["revenue"], "revenue_y5": y5["revenue"], "revenue_cagr": cagr,
        "ebitda_y1": y1["ebitda"], "ebitda_y5": y5["ebitda"], "ebitda_margin_y5": y5["ebitda_margin"],
        "net_income_y5": y5["net_income"],
        "teacher_capacity_lessons": teacher_capacity_lessons(a["team"]),
        "ebitda_breakeven_month": first_sustained("ebitda"),
        "net_income_breakeven_month": first_sustained("net_income"),
        "cash_flow_breakeven_month": first_sustained("cfo"),
        "min_cash": min_cash_m["cash"], "min_cash_month": min_cash_m["month"],
        "funding_need_without_loan": max(0.0, -min_raw), "cash_buffer": buffer,
        "loan_amount": loan, "suggested_loan": suggested, "financeable": financeable,
        "owner_bridge": bridge, "funding_gap": funding_gap,
        "funding_gap_month": next((e["month"] for e in fin.get("equity_injections") or [] if e.get("gap")), None),
        "suggested_grace_months": suggested_grace, "loan_repaid_month": repaid,
        "loan_monthly_payment": run["pmt"] if loan else 0.0,
        "min_dscr": min((y["dscr"] for y in years if y["dscr"] is not None), default=None),
        "cash_end": months[-1]["cash"],
        "students_active_end": months[-1]["active_students"],
        "teachers_end": months[-1]["headcount"]["teachers"],
        "headcount_end": months[-1]["headcount"]["fixed"],
        "vat_registration_month": idx_ym(run["vat_from"], start) if run["vat_from"] is not None and run["vat_from"] < len(months) else None,
        "owner_invested": invested, "owner_irr": owner_irr, "owner_moic": moic,
        "enterprise_value": valuation["enterprise_value"], "equity_value_today": valuation["equity_value_today"],
        "exit_equity_value": valuation["exit_equity_value"],
    }
    # integrity: every total equals the sum of its parts
    checks = dict(run["checks"])
    checks["revenue_equals_streams"] = all(abs(m["revenue"] - sum(m["revenue_by_stream"].values())) < 0.01 for m in months)
    checks["opex_equals_lines"] = all(abs(m["opex"] - (m["marketing"] + m["payroll"] + m["teacher_onboarding"] + m["launch_costs"] + m["other_opex"])) < 0.01 for m in months)
    checks["expenses_equal_categories"] = all(abs(m["cogs"] + m["opex"] - sum(m["expense_by_category"].values())) < 0.01 for m in months)
    checks["annual_equals_months"] = all(abs(y["revenue"] - sum(m["revenue"] for m in months if m["year"] == y["year"])) < 0.01 for y in years)
    checks["cash_bridge"] = abs((months[0]["cash"] - months[0]["net_cash_flow"]) + sum(m["net_cash_flow"] for m in months) - months[-1]["cash"]) < 0.5
    # revenue -> cash: collections = revenue + VAT billed + change in deferred revenue - change in receivables,
    # and operating cash flow = EBITDA - change in receivables + change in deferred revenue + change in VAT payable - zakat paid
    rec_ok = cfo_ok = True
    prev = {"receivables": 0.0, "deferred_revenue": 0.0, "vat_payable": 0.0}
    for m in months:
        d_ar = m["receivables"] - prev["receivables"]
        d_def = m["deferred_revenue"] - prev["deferred_revenue"]
        d_vat = m["vat_payable"] - prev["vat_payable"]
        vat_billed = d_vat + m["vat_paid"]
        rec_ok &= abs(m["revenue"] + vat_billed + d_def - d_ar - m["collections"]) < 0.01
        cfo_ok &= abs(m["ebitda"] - d_ar + d_def + d_vat - m["zakat_paid"] - m["cfo"]) < 0.01
        prev = m
    checks["revenue_to_collections"] = rec_ok
    checks["ebitda_to_operating_cash"] = cfo_ok
    checks["all_ok"] = all(v for k, v in checks.items() if isinstance(v, bool))

    streams_meta = [{"id": k, "name_ar": d["s"].get("name_ar"), "name_en": d["s"].get("name_en"),
                     "suggested": bool(d["s"].get("suggested")), "driver": d["s"].get("driver"),
                     "start_month": d["s"].get("start_month"),
                     "category": "b2b" if d["s"].get("category") == "b2b" else "b2c"} for k, d in run["streams"].items()]
    return {
        "scenario": scenario, "start_month": start,
        "months": months, "years": years, "kpis": kpis,
        "unit_economics": _unit_economics(a, run), "valuation": valuation,
        "streams": streams_meta,
        "opex_lines": [{"id": o["id"], "name_ar": o.get("name_ar"), "name_en": o.get("name_en")} for o in a.get("opex", [])],
        "checks": checks,
    }


SENSITIVITY_DRIVERS = [
    ("price", "سعر الاشتراك", "Price"),
    ("discount", "نسبة الخصم", "Discount"),
    ("conversion", "نسبة التحويل من التجربة للاشتراك", "Trial-to-paid conversion"),
    ("cpl", "تكلفة العميل المحتمل", "Cost per lead"),
    ("renewal", "نسبة التجديد", "Renewal rate"),
    ("teacher_cost", "أجر المعلم للمحاضرة", "Teacher fee per lecture"),
    ("marketing", "عدد المحاضرات المجانية", "Free trial lectures"),
    ("b2b_volume", "حجم الشراكات والبرامج", "Partnerships & programs volume"),
    ("payroll", "رواتب الفريق", "Team payroll"),
]


def _shock(a: dict, driver: str, f: float) -> dict:
    a = copy.deepcopy(a)
    for s in a["streams"]:
        if driver == "price":
            s["list_price"] *= f
        elif driver == "discount":
            s["avg_discount"] = min(s["avg_discount"] * f, 0.95)
        elif driver == "renewal":
            s["renewal_rate"] = min(s["renewal_rate"] * f, 0.95)
            s["renewal_rate_target"] = min(s["renewal_rate_target"] * f, 0.95)
        elif driver == "teacher_cost":
            s["teacher_cost_per_lesson"] *= f
        elif driver == "b2b_volume" and s.get("driver") == "growth":
            s["initial_monthly"] *= f
            s["max_monthly"] *= f
    for mk in a["markets"]:
        if driver == "conversion":
            mk["trial_to_paid"] = min(mk["trial_to_paid"] * f, 1)
            mk["trial_to_paid_target"] = min(mk["trial_to_paid_target"] * f, 1)
        elif driver == "cpl":
            mk["cpl"] *= f
        elif driver == "marketing":
            mk["trials_by_year"] = [b * f for b in mk["trials_by_year"]]
    if driver == "payroll":
        t = a["team"]
        t["admin_payroll"] = float(t.get("admin_payroll", 0)) * f
        for k in ("marketing_team_monthly_by_year", "cs_monthly_by_year", "quality_monthly_by_year"):
            t[k] = [float(v) * f for v in (t.get(k) or [0.0])]
        for h in t.get("hires", []):
            h["salary"] = float(h.get("salary", 0)) * f
    return a


def sensitivity(assumptions: dict, scenario: str = "base", pct: float = 0.2) -> dict:
    base = compute(assumptions, scenario)

    def pick(r):
        return {"ebitda_y5": r["kpis"]["ebitda_y5"], "revenue_y5": r["kpis"]["revenue_y5"],
                "min_cash": r["kpis"]["min_cash"], "enterprise_value": r["kpis"]["enterprise_value"],
                "funding_need": r["kpis"]["funding_need_without_loan"]}

    rows = []
    for key, ar, en in SENSITIVITY_DRIVERS:
        lo = pick(compute(_shock(assumptions, key, 1 - pct), scenario))
        hi = pick(compute(_shock(assumptions, key, 1 + pct), scenario))
        rows.append({"driver": key, "name_ar": ar, "name_en": en, "low": lo, "high": hi})
    b = pick(base)
    rows.sort(key=lambda r: -abs(r["high"]["ebitda_y5"] - r["low"]["ebitda_y5"]))
    scen = {}
    for sc in SCENARIOS:
        r = compute(assumptions, sc)
        scen[sc] = {**pick(r), "revenue_by_year": [y["revenue"] for y in r["years"]],
                    "ebitda_by_year": [y["ebitda"] for y in r["years"]],
                    "cash_by_year": [y["cash"] for y in r["years"]],
                    "breakeven": r["kpis"]["ebitda_breakeven_month"], "loan": r["kpis"]["loan_amount"],
                    "funding_gap": r["kpis"]["funding_gap"], "financeable": r["kpis"]["financeable"],
                    "subs_y5": r["years"][-1]["subscriptions"]}
    return {"pct": pct, "base": b, "drivers": rows, "scenarios": scen}
