"""
End-to-end smoke test against a running API (used by CI after migrations +
seed, and handy after a deploy):

    python -m scripts.smoke_test http://127.0.0.1:8000 admin@example.com 'password'

Checks: health/readiness, login, the paged endpoints return consistent
totals, the KPI summary defaults to "all", security headers and a 401
without a token.
"""
from __future__ import annotations

import sys
from decimal import Decimal

import httpx


def main(base: str, email: str, password: str) -> None:
    c = httpx.Client(base_url=base, timeout=20)
    ok = lambda cond, msg: (print(("PASS " if cond else "FAIL ") + msg), cond)[1]  # noqa: E731
    results = []

    results.append(ok(c.get("/health").status_code == 200, "/health"))
    ready = c.get("/ready").json()
    results.append(ok(ready.get("database") == "ok", f"/ready {ready}"))
    results.append(ok(c.get("/api/finance/expenses/page").status_code == 401, "no token -> 401"))

    r = c.post("/api/auth/login", json={"email": email, "password": password})
    body = r.json()
    if "access_token" not in body:
        print("FAIL login", r.status_code, body)
        sys.exit(1)
    h = {"Authorization": f"Bearer {body['access_token']}"}
    results.append(ok(r.headers.get("x-content-type-options") == "nosniff", "security headers present"))

    kpi = c.get("/api/kpi-dashboard/summary", headers=h).json()
    results.append(ok(kpi.get("selected") == "all" and kpi["periods"][0]["key"] == "all", "KPI defaults to all periods"))
    results.append(ok(all(p["group"] in ("range", "phase") for p in kpi["periods"]), "KPI periods = all + phases"))

    p1 = c.get("/api/finance/expenses/page", params={"page": 1, "page_size": 5}, headers=h).json()
    results.append(ok(len(p1["items"]) <= 5 and p1["page_size"] == 5, "expenses page size respected"))
    results.append(ok(p1["total_pages"] == max((p1["total"] + 4) // 5, 1), "expenses total_pages consistent"))

    subs = c.get("/api/subscriptions", params={"page": 1, "page_size": 5}, headers=h).json()
    results.append(ok(subs["totals"]["count"] == subs["total"], "subscriptions totals cover all rows"))
    results.append(ok(Decimal(str(subs["totals"]["total_list_price"])) == Decimal(str(subs["totals"]["total_paid"])) + Decimal(str(subs["totals"]["total_discount"])), "list price = paid + discount"))

    rev = c.get("/api/finance/revenue/page", headers=h).json()
    results.append(ok(Decimal(str(rev["sum_gross"])) == Decimal(str(rev["sum_amount"])) + Decimal(str(rev["sum_fees"])), "deposits gross = amount + fees"))

    counts = c.get("/api/crm/leads/meta/stage-counts", params={"group": "leads"}, headers=h).json()
    results.append(ok(counts[""] == sum(v for k, v in counts.items() if k), "stage counts add up"))

    if not all(results):
        sys.exit(1)
    print("all smoke checks passed")


if __name__ == "__main__":
    main(*sys.argv[1:4])
