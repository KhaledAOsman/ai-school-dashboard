"""
Turns the operational records (expenses, partner funding, subscription revenue,
manual entries) into double-entry journal entries.

The journal is *derived*: nothing is stored twice, so the books can never drift
away from the registers the team actually works in. Rules:

* approved expense, paid in the same month it belongs to
      Dr expense account            Cr 1110 cash   (or 2200 if a partner paid it)
* approved expense whose period_month is earlier than the payment month
  (e.g. May salaries transferred in June) - accrual basis
      end of period month:  Dr expense account    Cr 2110 / 2120 (accrued)
      payment date:         Dr 2110 / 2120        Cr 1110 cash   (or 2200)
* partner funding        Dr 1110 cash        Cr 3100 partner funding
* subscription revenue   Dr 1110 cash (+ Dr 4900 discount)   Cr 4100 revenue (gross)
* manual entries         exactly as entered (voided ones are ignored)

Draft / pending / rejected / cancelled / archived expenses are not posted.
"""
from __future__ import annotations

import calendar
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.finance.accounting.models import JournalEntry, LedgerAccount
from app.modules.finance.categories.models import ExpenseCategory
from app.modules.finance.expenses.models import Expense
from app.modules.finance.funding.models import FinanceFunding
from app.modules.finance.revenue.models import FinanceRevenue
from app.modules.finance.staff.models import StaffMember

CASH = "1110"
STAFF_ACCRUED = "2110"
OTHER_ACCRUED = "2120"
PARTNER_PAYABLE = "2200"
CAPITAL = "3100"
REVENUE = "4100"
REVENUE_DISCOUNT = "4900"
UNCLASSIFIED = "5999"

ZERO = Decimal("0.00")
Q = Decimal("0.01")


def money(v) -> Decimal:
    return Decimal(str(v if v is not None else 0)).quantize(Q)


@dataclass
class AccountInfo:
    code: str
    name: str
    type: str  # asset | liability | equity | revenue | expense
    parent_code: str | None
    normal_side: str  # debit | credit
    postable: bool = True
    active: bool = True
    system: bool = True  # False for expense accounts coming from categories


@dataclass
class Line:
    account: str
    debit: Decimal = ZERO
    credit: Decimal = ZERO
    memo: str | None = None
    party: str | None = None


@dataclass
class Entry:
    date: date
    ref: str
    source_type: str  # expense | funding | revenue | manual
    source_id: str | None
    memo: str
    lines: list[Line]
    created_at: datetime | None = None
    order: int = 0
    expense_code: str | None = None  # expense account this entry belongs to (cash-flow analysis)
    no: int = 0

    @property
    def total(self) -> Decimal:
        return sum((l.debit for l in self.lines), ZERO)


def _short(i: uuid.UUID) -> str:
    return i.hex[:8].upper()


async def load_accounts(db: AsyncSession) -> dict[str, AccountInfo]:
    accounts: dict[str, AccountInfo] = {}
    rows = (await db.execute(select(LedgerAccount))).scalars().all()
    for a in rows:
        accounts[a.code] = AccountInfo(
            a.code, a.name, a.account_type, a.parent_code, a.normal_side, a.is_postable, a.is_active, True
        )
    cats = (await db.execute(select(ExpenseCategory))).scalars().all()
    by_id = {c.id: c for c in cats}
    for c in cats:
        if not c.code or c.code in accounts:
            continue
        parent = by_id.get(c.parent_id) if c.parent_id else None
        accounts[c.code] = AccountInfo(
            c.code, c.name_ar or c.name, "expense", parent.code if parent and parent.code else None,
            "debit", True, not c.is_archived, False,
        )
    return accounts


def _month_end(period: str) -> date:
    y, m = int(period[:4]), int(period[5:7])
    return date(y, m, calendar.monthrange(y, m)[1])


async def build_entries(db: AsyncSession) -> list[Entry]:
    entries: list[Entry] = []

    cats = (await db.execute(select(ExpenseCategory))).scalars().all()
    cat_code = {c.id: c.code for c in cats}
    staff = {s.id: s.full_name for s in (await db.execute(select(StaffMember))).scalars().all()}

    expenses = (
        await db.execute(
            select(Expense).where(Expense.status == "approved", Expense.is_archived.is_(False))
        )
    ).scalars().all()
    for e in expenses:
        amount = money(e.amount)
        if amount <= 0:
            continue
        code = (cat_code.get(e.subcategory_id) if e.subcategory_id else None) or cat_code.get(e.category_id) or UNCLASSIFIED
        party = staff.get(e.staff_id) or e.vendor
        memo = (e.description or e.vendor or "مصروف").strip()
        paid_from = PARTNER_PAYABLE if (e.paid_by or "").strip() else CASH
        short = _short(e.id)
        accrue = False
        if e.period_month:
            try:
                pe = _month_end(e.period_month)
                accrue = (pe.year, pe.month) < (e.expense_date.year, e.expense_date.month)
            except ValueError:
                pe = None
        if accrue:
            liab = STAFF_ACCRUED if (e.staff_id or code.startswith(("52", "53", "55"))) else OTHER_ACCRUED
            entries.append(Entry(pe, f"EXP-{short}-A", "expense", str(e.id), f"استحقاق: {memo}",
                                 [Line(code, amount, ZERO, memo, party), Line(liab, ZERO, amount, memo, party)],
                                 e.created_at, 3, code))
            entries.append(Entry(e.expense_date, f"EXP-{short}-P", "expense", str(e.id), f"سداد: {memo}",
                                 [Line(liab, amount, ZERO, memo, party), Line(paid_from, ZERO, amount, memo, party)],
                                 e.created_at, 4, code))
        else:
            entries.append(Entry(e.expense_date, f"EXP-{short}", "expense", str(e.id), memo,
                                 [Line(code, amount, ZERO, memo, party), Line(paid_from, ZERO, amount, memo, party)],
                                 e.created_at, 4, code))

    for f in (await db.execute(select(FinanceFunding))).scalars().all():
        amount = money(f.amount)
        memo = f"تمويل من {f.source_name}" + (f" — {f.note}" if f.note else "")
        entries.append(Entry(f.funding_date, f"FND-{_short(f.id)}", "funding", str(f.id), memo,
                             [Line(CASH, amount, ZERO, memo, f.source_name), Line(CAPITAL, ZERO, amount, memo, f.source_name)],
                             f.created_at, 0))

    for r in (await db.execute(select(FinanceRevenue))).scalars().all():
        net, disc = money(r.amount), money(r.discount_amount)
        gross = net + disc
        label = r.package_name or "اشتراك"
        memo = f"{label}" + (f" — {r.customer_name}" if r.customer_name else "")
        lines = [Line(CASH, net, ZERO, memo, r.customer_name)]
        if disc > 0:
            lines.append(Line(REVENUE_DISCOUNT, disc, ZERO, "خصم", r.customer_name))
        lines.append(Line(REVENUE, ZERO, gross, memo, r.customer_name))
        entries.append(Entry(r.revenue_date, f"REV-{_short(r.id)}", "revenue", str(r.id), memo, lines, r.created_at, 1))

    manual = (
        await db.execute(
            select(JournalEntry).options(selectinload(JournalEntry.lines)).where(JournalEntry.voided_at.is_(None))
        )
    ).scalars().all()
    for j in manual:
        lines = [Line(l.account_code, money(l.debit), money(l.credit), l.memo, l.party) for l in j.lines]
        entries.append(Entry(j.entry_date, j.reference or f"JV-{_short(j.id)}", "manual", str(j.id), j.memo, lines,
                             j.created_at, 2))

    entries.sort(key=lambda x: (x.date, x.order, x.created_at or datetime.min, x.ref))
    for i, e in enumerate(entries, 1):
        e.no = i
    return entries
