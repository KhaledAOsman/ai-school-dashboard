"""Ledger, trial balance, income statement, balance sheet, cash flow, checks."""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.finance.accounting.posting import (
    CAPITAL, CASH, PARTNER_PAYABLE, REVENUE, REVENUE_DISCOUNT, ZERO, AccountInfo, Entry, build_entries,
    load_accounts, money,
)
from app.modules.finance.expenses.models import Expense
from app.modules.finance.funding.models import FinanceFunding
from app.modules.finance.revenue.models import FinanceRevenue

TYPE_LABEL = {"asset": "أصول", "liability": "خصوم", "equity": "حقوق ملكية", "revenue": "إيرادات", "expense": "مصروفات"}
TYPE_ORDER = {"asset": 1, "liability": 2, "equity": 3, "revenue": 4, "expense": 5}


def _signed(acc: AccountInfo, debit: Decimal, credit: Decimal) -> Decimal:
    """Balance in the direction of the account's TYPE (assets/expenses: debit - credit,
    liabilities/equity/revenue: credit - debit). A contra account such as 4900
    (discounts) therefore comes out negative and reduces its parent's total."""
    return (debit - credit) if acc.type in ("asset", "expense") else (credit - debit)


class AccountingService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.accounts: dict[str, AccountInfo] = {}
        self.entries: list[Entry] = []
        self.children: dict[str | None, list[str]] = defaultdict(list)

    async def load(self) -> "AccountingService":
        self.accounts = await load_accounts(self.db)
        self.entries = await build_entries(self.db)
        for code, a in self.accounts.items():
            parent = a.parent_code if a.parent_code in self.accounts else None
            self.children[parent].append(code)
        for lst in self.children.values():
            lst.sort()
        return self

    # ------------------------------------------------------------ helpers
    def descendants(self, code: str) -> set[str]:
        out, stack = {code}, [code]
        while stack:
            for ch in self.children.get(stack.pop(), []):
                if ch not in out:
                    out.add(ch)
                    stack.append(ch)
        return out

    def _ordered(self) -> list[tuple[str, int]]:
        """Accounts in tree order with depth."""
        out: list[tuple[str, int]] = []

        def walk(code: str, depth: int) -> None:
            out.append((code, depth))
            for ch in self.children.get(code, []):
                walk(ch, depth + 1)

        for root in sorted(self.children.get(None, []), key=lambda c: (TYPE_ORDER[self.accounts[c].type], c)):
            walk(root, 0)
        return out

    def _totals(self, date_from: date | None, date_to: date | None, codes: set[str] | None = None):
        deb: dict[str, Decimal] = defaultdict(lambda: ZERO)
        cre: dict[str, Decimal] = defaultdict(lambda: ZERO)
        for e in self.entries:
            if date_from and e.date < date_from:
                continue
            if date_to and e.date > date_to:
                continue
            for l in e.lines:
                if codes is not None and l.account not in codes:
                    continue
                deb[l.account] += l.debit
                cre[l.account] += l.credit
        return deb, cre

    def _rollup(self, own: dict[str, Decimal]) -> dict[str, Decimal]:
        total: dict[str, Decimal] = {}

        def walk(code: str) -> Decimal:
            s = own.get(code, ZERO)
            for ch in self.children.get(code, []):
                s += walk(ch)
            total[code] = s
            return s

        for root in self.children.get(None, []):
            walk(root)
        return total

    def _name(self, code: str) -> str:
        a = self.accounts.get(code)
        return a.name if a else code

    # ------------------------------------------------------------ chart
    def chart(self) -> list[dict]:
        deb, cre = self._totals(None, None)
        net_own = {c: _signed(self.accounts[c], deb.get(c, ZERO), cre.get(c, ZERO)) for c in self.accounts}
        roll = self._rollup(net_own)
        out = []
        for code, depth in self._ordered():
            a = self.accounts[code]
            out.append({
                "code": code, "name": a.name, "type": a.type, "type_label": TYPE_LABEL[a.type],
                "parent_code": a.parent_code if a.parent_code in self.accounts else None,
                "normal_side": a.normal_side, "level": depth, "is_postable": a.postable,
                "is_active": a.active, "balance": str(roll.get(code, ZERO)),
                "has_children": bool(self.children.get(code)),
            })
        return out

    # ------------------------------------------------------------ journal
    def journal(self, date_from=None, date_to=None, account=None, source_type=None, q=None, limit=200, offset=0):
        codes = self.descendants(account) if account else None
        rows = []
        for e in self.entries:
            if date_from and e.date < date_from:
                continue
            if date_to and e.date > date_to:
                continue
            if source_type and e.source_type != source_type:
                continue
            if codes is not None and not any(l.account in codes for l in e.lines):
                continue
            if q:
                ql = q.lower()
                hay = " ".join([e.memo, e.ref] + [(l.party or "") for l in e.lines]).lower()
                if ql not in hay:
                    continue
            rows.append(e)
        page = rows[offset: offset + limit]
        return {
            "total": len(rows),
            "total_debit": str(sum((e.total for e in rows), ZERO)),
            "entries": [self._entry_dict(e) for e in page],
        }

    def _entry_dict(self, e: Entry) -> dict:
        return {
            "no": e.no, "ref": e.ref, "date": e.date.isoformat(), "source_type": e.source_type,
            "source_id": e.source_id, "memo": e.memo, "total": str(e.total),
            "lines": [
                {"account": l.account, "account_name": self._name(l.account), "debit": str(l.debit),
                 "credit": str(l.credit), "memo": l.memo, "party": l.party}
                for l in e.lines
            ],
        }

    # ------------------------------------------------------------ ledger
    def ledger(self, account: str, date_from=None, date_to=None, party=None):
        if account not in self.accounts:
            return None
        acc = self.accounts[account]
        codes = self.descendants(account)
        opening = ZERO
        rows = []
        run = ZERO
        tot_d = tot_c = ZERO
        for e in self.entries:
            for l in e.lines:
                if l.account not in codes:
                    continue
                if party and (l.party or "") != party:
                    continue
                delta = (l.debit - l.credit) if acc.normal_side == "debit" else (l.credit - l.debit)
                if date_from and e.date < date_from:
                    opening += delta
                    continue
                if date_to and e.date > date_to:
                    continue
                if not rows:
                    run = opening
                run += delta
                tot_d += l.debit
                tot_c += l.credit
                rows.append({
                    "date": e.date.isoformat(), "ref": e.ref, "no": e.no, "memo": l.memo or e.memo,
                    "account": l.account, "account_name": self._name(l.account), "party": l.party,
                    "debit": str(l.debit), "credit": str(l.credit), "balance": str(run),
                })
        closing = run if rows else opening
        return {
            "account": {"code": acc.code, "name": acc.name, "type": acc.type, "normal_side": acc.normal_side},
            "opening": str(opening), "total_debit": str(tot_d), "total_credit": str(tot_c),
            "closing": str(closing), "rows": rows,
        }

    def parties(self, account: str) -> list[dict]:
        """Sub-ledger: balance per person/vendor for one account (e.g. accrued pay)."""
        if account not in self.accounts:
            return []
        acc = self.accounts[account]
        codes = self.descendants(account)
        bal: dict[str, Decimal] = defaultdict(lambda: ZERO)
        for e in self.entries:
            for l in e.lines:
                if l.account in codes:
                    bal[l.party or "—"] += (l.debit - l.credit) if acc.normal_side == "debit" else (l.credit - l.debit)
        return [{"party": p, "balance": str(v)} for p, v in sorted(bal.items()) if v != 0]

    # ------------------------------------------------------------ trial balance
    def trial_balance(self, date_from=None, date_to=None):
        deb, cre = self._totals(date_from, date_to)
        own_net = {c: deb.get(c, ZERO) - cre.get(c, ZERO) for c in self.accounts}
        roll_net = self._rollup(own_net)
        rows = []
        for code, depth in self._ordered():
            a = self.accounts[code]
            d, c = deb.get(code, ZERO), cre.get(code, ZERO)
            if roll_net.get(code, ZERO) == 0 and d == 0 and c == 0 and not self._has_activity(code, deb, cre):
                continue
            n = d - c
            rows.append({
                "code": code, "name": a.name, "type": a.type, "type_label": TYPE_LABEL[a.type], "level": depth,
                "is_header": bool(self.children.get(code)),
                "debit": str(d), "credit": str(c),
                "balance_debit": str(max(n, ZERO)), "balance_credit": str(max(-n, ZERO)),
                "rollup_balance_debit": str(max(roll_net.get(code, ZERO), ZERO)),
                "rollup_balance_credit": str(max(-roll_net.get(code, ZERO), ZERO)),
            })
        td = sum((deb.get(c, ZERO) for c in self.accounts), ZERO)
        tc = sum((cre.get(c, ZERO) for c in self.accounts), ZERO)
        bd = sum((max(deb.get(c, ZERO) - cre.get(c, ZERO), ZERO) for c in self.accounts), ZERO)
        bc = sum((max(cre.get(c, ZERO) - deb.get(c, ZERO), ZERO) for c in self.accounts), ZERO)
        return {
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
            "rows": rows,
            "total_debit": str(td), "total_credit": str(tc),
            "total_balance_debit": str(bd), "total_balance_credit": str(bc),
            "balanced": td == tc and bd == bc,
        }

    def _has_activity(self, code, deb, cre) -> bool:
        return any((deb.get(c, ZERO) or cre.get(c, ZERO)) for c in self.descendants(code))

    # ------------------------------------------------------------ income statement
    def income_statement(self, date_from: date | None, date_to: date | None):
        months: list[str] = []
        per: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(lambda: ZERO))  # code -> month -> amount
        for e in self.entries:
            if date_from and e.date < date_from:
                continue
            if date_to and e.date > date_to:
                continue
            m = e.date.strftime("%Y-%m")
            for l in e.lines:
                a = self.accounts.get(l.account)
                if not a or a.type not in ("revenue", "expense"):
                    continue
                amt = (l.credit - l.debit) if a.type == "revenue" else (l.debit - l.credit)
                per[l.account][m] += amt
                if m not in months:
                    months.append(m)
        months.sort()

        def build(kind: str):
            own_total = {c: sum(per[c].values(), ZERO) for c in per}
            roll_total = self._rollup(own_total)
            roll_month = {m: self._rollup({c: per[c].get(m, ZERO) for c in per}) for m in months}
            rows = []
            for code, depth in self._ordered():
                a = self.accounts[code]
                if a.type != kind:
                    continue
                t = roll_total.get(code, ZERO)
                if t == 0 and code not in per:
                    continue
                rows.append({
                    "code": code, "name": a.name, "level": depth, "is_header": bool(self.children.get(code)),
                    "total": str(t), "months": {m: str(roll_month[m].get(code, ZERO)) for m in months},
                })
            roots = [c for c in self.children.get(None, []) if self.accounts[c].type == kind]
            tot = {m: sum((roll_month[m].get(c, ZERO) for c in roots), ZERO) for m in months}
            return rows, tot, sum(tot.values(), ZERO)

        rev_rows, rev_m, rev_t = build("revenue")
        exp_rows, exp_m, exp_t = build("expense")
        return {
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
            "months": months,
            "revenue": rev_rows, "expenses": exp_rows,
            "total_revenue": str(rev_t), "total_expenses": str(exp_t), "net_income": str(rev_t - exp_t),
            "revenue_by_month": {m: str(v) for m, v in rev_m.items()},
            "expenses_by_month": {m: str(v) for m, v in exp_m.items()},
            "net_by_month": {m: str(rev_m[m] - exp_m[m]) for m in months},
        }

    # ------------------------------------------------------------ balance sheet
    def balance_sheet(self, as_of: date | None):
        deb, cre = self._totals(None, as_of)
        own = {c: _signed(self.accounts[c], deb.get(c, ZERO), cre.get(c, ZERO)) for c in self.accounts}
        roll = self._rollup(own)

        def section(kind: str):
            rows = []
            for code, depth in self._ordered():
                a = self.accounts[code]
                if a.type != kind:
                    continue
                if roll.get(code, ZERO) == 0 and not self._has_activity(code, deb, cre):
                    continue
                rows.append({"code": code, "name": a.name, "level": depth,
                             "is_header": bool(self.children.get(code)), "amount": str(roll.get(code, ZERO))})
            roots = [c for c in self.children.get(None, []) if self.accounts[c].type == kind]
            return rows, sum((roll.get(c, ZERO) for c in roots), ZERO)

        assets, ta = section("asset")
        liabs, tl = section("liability")
        equity, te = section("equity")
        revenue = sum((roll.get(c, ZERO) for c in self.children.get(None, []) if self.accounts[c].type == "revenue"), ZERO)
        expense = sum((roll.get(c, ZERO) for c in self.children.get(None, []) if self.accounts[c].type == "expense"), ZERO)
        earnings = revenue - expense
        te_total = te + earnings
        return {
            "as_of": as_of.isoformat() if as_of else None,
            "assets": assets, "total_assets": str(ta),
            "liabilities": liabs, "total_liabilities": str(tl),
            "equity": equity, "total_contributed": str(te),
            "retained_earnings": str(earnings), "total_equity": str(te_total),
            "total_liabilities_equity": str(tl + te_total),
            "balanced": ta == tl + te_total,
        }

    # ------------------------------------------------------------ cash flow (direct method)
    def cash_flow(self, date_from: date | None, date_to: date | None):
        opening = ZERO
        months: list[str] = []
        flows: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(lambda: ZERO))
        meta: dict[str, dict] = {}
        for e in self.entries:
            cash_net = sum((l.debit - l.credit for l in e.lines if l.account == CASH), ZERO)
            if cash_net == 0:
                continue
            if date_from and e.date < date_from:
                opening += cash_net
                continue
            if date_to and e.date > date_to:
                continue
            m = e.date.strftime("%Y-%m")
            if m not in months:
                months.append(m)
            if e.source_type == "funding":
                key, group, label = "funding", "financing", "تمويل الشركاء"
            elif e.source_type == "revenue":
                key, group, label = "subscriptions", "operating_in", "اشتراكات الطلاب المحصّلة"
            elif e.source_type == "expense":
                root = self._root_of(e.expense_code) if e.expense_code else "5999"
                key, group, label = f"exp:{root}", "operating_out", self._name(root)
            else:
                key, group, label = "manual", "operating_out" if cash_net < 0 else "operating_in", "قيود يدوية"
            flows[key][m] += cash_net
            meta[key] = {"group": group, "label": label, "code": key.split(":")[-1] if key.startswith("exp:") else None}
        months.sort()

        def grp(g):
            rows = []
            for key, md in meta.items():
                if md["group"] != g:
                    continue
                rows.append({"key": key, "label": md["label"], "code": md["code"],
                             "months": {m: str(flows[key].get(m, ZERO)) for m in months},
                             "total": str(sum(flows[key].values(), ZERO))})
            rows.sort(key=lambda r: (r["code"] or "", r["label"]))
            return rows

        def tot(rows):
            return {m: sum((Decimal(r["months"][m]) for r in rows), ZERO) for m in months}

        op_in, op_out, fin = grp("operating_in"), grp("operating_out"), grp("financing")
        t_in, t_out, t_fin = tot(op_in), tot(op_out), tot(fin)
        net = {m: t_in[m] + t_out[m] + t_fin[m] for m in months}
        open_m, close_m, run = {}, {}, opening
        for m in months:
            open_m[m] = run
            run += net[m]
            close_m[m] = run
        return {
            "months": months, "opening": str(opening), "closing": str(run),
            "operating_in": op_in, "operating_out": op_out, "financing": fin,
            "net_operating": {m: str(t_in[m] + t_out[m]) for m in months},
            "net_financing": {m: str(t_fin[m]) for m in months},
            "net_change": {m: str(net[m]) for m in months},
            "opening_by_month": {m: str(open_m[m]) for m in months},
            "closing_by_month": {m: str(close_m[m]) for m in months},
            "total_net_change": str(sum(net.values(), ZERO)),
        }

    def _root_of(self, code: str) -> str:
        a = self.accounts.get(code)
        while a and a.parent_code and a.parent_code in self.accounts:
            a = self.accounts[a.parent_code]
        return a.code if a else code

    # ------------------------------------------------------------ checks
    async def checks(self) -> list[dict]:
        deb, cre = self._totals(None, None)
        td = sum(deb.values(), ZERO)
        tc = sum(cre.values(), ZERO)
        bs = self.balance_sheet(None)
        # registers vs ledger: compare only what the registers generate (manual
        # adjusting entries are, by design, not in any register).
        gdeb: dict[str, Decimal] = defaultdict(lambda: ZERO)
        gcre: dict[str, Decimal] = defaultdict(lambda: ZERO)
        for e in self.entries:
            if e.source_type == "manual":
                continue
            for l in e.lines:
                gdeb[l.account] += l.debit
                gcre[l.account] += l.credit

        async def scalar(stmt):
            return money((await self.db.execute(stmt)).scalar_one() or 0)

        exp_total = await scalar(select(func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.status == "approved", Expense.is_archived.is_(False)))
        fund_total = await scalar(select(func.coalesce(func.sum(FinanceFunding.amount), 0)))
        rev_net = await scalar(select(func.coalesce(func.sum(FinanceRevenue.amount), 0)))
        rev_disc = await scalar(select(func.coalesce(func.sum(FinanceRevenue.discount_amount), 0)))
        paid_by_partner = await scalar(select(func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.status == "approved", Expense.is_archived.is_(False),
            Expense.paid_by.is_not(None), Expense.paid_by != ""))

        def sum_type(t):
            return sum(((gdeb.get(c, ZERO) - gcre.get(c, ZERO)) for c, a in self.accounts.items() if a.type == t), ZERO)

        ledger_exp = sum_type("expense")
        ledger_cap = -sum(((gdeb.get(c, ZERO) - gcre.get(c, ZERO)) for c in self.descendants(CAPITAL)), ZERO)
        ledger_rev_net = -(sum_type("revenue"))  # credit-normal total = rev - discounts
        ledger_cash = gdeb.get(CASH, ZERO) - gcre.get(CASH, ZERO)
        expected_cash = fund_total + rev_net - (exp_total - paid_by_partner)
        accrued = self.parties("2100")
        accrued_total = sum((Decimal(p["balance"]) for p in accrued), ZERO)

        def row(name, left, right, note=None):
            return {"name": name, "ledger": str(left), "source": str(right), "ok": left == right, "note": note}

        return [
            row("إجمالي المدين = إجمالي الدائن في كل القيود", td, tc),
            row("المصروفات في الدفاتر = المصروفات المعتمدة في السجل", ledger_exp, exp_total),
            row("حقوق الشركاء في الدفاتر = إجمالي التمويل", ledger_cap, fund_total),
            row("صافي الإيراد في الدفاتر = الاشتراكات المستلمة (بعد الخصم)", ledger_rev_net, rev_net,
                f"إجمالي الخصومات {rev_disc}" if rev_disc else None),
            row("رصيد النقدية = تمويل + إيرادات − مصروفات مدفوعة من الحساب", ledger_cash, expected_cash,
                f"منها {paid_by_partner} دفعها شريك بالنيابة" if paid_by_partner else None),
            row("الأصول = الخصوم + حقوق الملكية", Decimal(bs["total_assets"]), Decimal(bs["total_liabilities_equity"])),
            {"name": "مستحقات لم تُسدَّد بعد (أجور/مصروفات مستحقة)", "ledger": str(accrued_total), "source": "0.00",
             "ok": True, "info": True, "note": "مش خطأ — لو فيه رصيد يبقى فيه مصروف محسوب على الفترة ولسه ما اتدفعش"},
        ]
