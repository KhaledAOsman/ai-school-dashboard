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
* approved expense paid BEFORE the month it belongs to (e.g. August's campaign
  paid on 1 July) - prepayment
      payment date:         Dr 1300 prepaid       Cr 1110 cash   (or 2200)
      first day of period:  Dr expense account    Cr 1300 prepaid
* partner funding        Dr 1110 cash        Cr 3100 partner funding
* paid subscription      Dr 1200 gateway receivable (+ Dr 4900 discount)   Cr 4100 revenue (gross)
* collection (deposit)   Dr 1110 cash + Dr 5810 gateway fees   Cr 1200 gateway receivable
* an invoice with lines  each line is debited to its own account (salary, bonus, fee...)
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
from app.modules.marketing.models import Subscription

CASH = "1110"
GATEWAY_RECEIVABLE = "1200"
GATEWAY_FEES = "5810"
PREPAID = "1300"
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
    expense_code: str | None = None  # main expense account of the invoice
    no: int = 0
    split: dict | None = None  # expense account -> amount (cash-flow analysis)

    @property
    def total(self) -> Decimal:
        return sum((l.debit for l in self.lines), ZERO)


def _uuid(v):
    try:
        return uuid.UUID(v) if v else None
    except (ValueError, TypeError):
        return None


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
    fee_code = GATEWAY_FEES if any(c.code == GATEWAY_FEES for c in cats) else UNCLASSIFIED
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
        main = (cat_code.get(e.subcategory_id) if e.subcategory_id else None) or cat_code.get(e.category_id) or UNCLASSIFIED
        party = staff.get(e.staff_id) or e.vendor
        memo = (e.description or e.vendor or "مصروف").strip()
        # one transfer may carry several costs (salary, bonus, commission, the
        # bank's transfer fee): each invoice line is debited to its own account
        split: dict[str, Decimal] = {}
        dr_lines: list[Line] = []
        if isinstance(e.breakdown, list) and e.breakdown:
            for item in e.breakdown:
                acc = item.get("account_id")
                try:
                    code = (cat_code.get(uuid.UUID(acc)) if acc else None) or main
                except ValueError:
                    code = main
                amt = money(item.get("amount"))
                who = staff.get(_uuid(item.get("staff_id"))) or party
                split[code] = split.get(code, ZERO) + amt
                dr_lines.append(Line(code, amt if amt > 0 else ZERO, -amt if amt < 0 else ZERO,
                                     item.get("label") or memo, who))
        else:
            split[main] = amount
            dr_lines.append(Line(main, amount, ZERO, memo, party))
        paid_from = PARTNER_PAYABLE if (e.paid_by or "").strip() else CASH
        short = _short(e.id)
        accrue = prepaid = False
        if e.period_month:
            try:
                pe = _month_end(e.period_month)
                accrue = (pe.year, pe.month) < (e.expense_date.year, e.expense_date.month)
                prepaid = (pe.year, pe.month) > (e.expense_date.year, e.expense_date.month)
            except ValueError:
                pe = None
        if prepaid:
            ps = pe.replace(day=1)
            entries.append(Entry(e.expense_date, f"EXP-{short}-P", "expense", str(e.id), f"دفع مقدّم: {memo}",
                                 [Line(PREPAID, amount, ZERO, memo, party), Line(paid_from, ZERO, amount, memo, party)],
                                 e.created_at, 4, main, split=split))
            entries.append(Entry(ps, f"EXP-{short}-R", "expense", str(e.id), f"تحميل على الشهر: {memo}",
                                 dr_lines + [Line(PREPAID, ZERO, amount, memo, party)],
                                 e.created_at, 3, main, split=split))
        elif accrue:
            # wages: content team, marketing & graphic, customer service, teachers (5200-5500)
            liab = STAFF_ACCRUED if (e.staff_id or main.startswith(("52", "53", "54", "55"))) else OTHER_ACCRUED
            entries.append(Entry(pe, f"EXP-{short}-A", "expense", str(e.id), f"استحقاق: {memo}",
                                 dr_lines + [Line(liab, ZERO, amount, memo, party)],
                                 e.created_at, 3, main, split=split))
            entries.append(Entry(e.expense_date, f"EXP-{short}-P", "expense", str(e.id), f"سداد: {memo}",
                                 [Line(liab, amount, ZERO, memo, party), Line(paid_from, ZERO, amount, memo, party)],
                                 e.created_at, 4, main, split=split))
        else:
            entries.append(Entry(e.expense_date, f"EXP-{short}", "expense", str(e.id), memo,
                                 dr_lines + [Line(paid_from, ZERO, amount, memo, party)],
                                 e.created_at, 4, main, split=split))

    for f in (await db.execute(select(FinanceFunding))).scalars().all():
        amount = money(f.amount)
        memo = f"تمويل من {f.source_name}" + (f" — {f.note}" if f.note else "")
        entries.append(Entry(f.funding_date, f"FND-{_short(f.id)}", "funding", str(f.id), memo,
                             [Line(CASH, amount, ZERO, memo, f.source_name), Line(CAPITAL, ZERO, amount, memo, f.source_name)],
                             f.created_at, 0))

    # Paid subscriptions (the subscriptions section) are the revenue: earned the
    # day the student pays, held by the payment gateway until it deposits.
    for sub in (await db.execute(select(Subscription))).scalars().all():
        net, disc = money(sub.amount_paid), money(sub.discount_amount)
        gross = net + disc
        if gross <= 0:
            continue
        memo = f"اشتراك — {sub.full_name}"
        lines = []
        if net > 0:
            lines.append(Line(GATEWAY_RECEIVABLE, net, ZERO, memo, sub.full_name))
        if disc > 0:
            lines.append(Line(REVENUE_DISCOUNT, disc, ZERO, "خصم", sub.full_name))
        lines.append(Line(REVENUE, ZERO, gross, memo, sub.full_name))
        entries.append(Entry(sub.subscribed_at, f"SUB-{_short(sub.id)}", "revenue", str(sub.id), memo, lines,
                             sub.created_at, 1))

    # Collections: what the gateway actually deposited into the bank account,
    # after its commission / fees.
    for r in (await db.execute(select(FinanceRevenue))).scalars().all():
        dep, fees = money(r.amount), money(getattr(r, "fees_amount", 0))
        label = r.package_name or "تحصيل اشتراكات"
        memo = f"{label}" + (f" — {r.payment_method}" if r.payment_method else "")
        lines = [Line(CASH, dep, ZERO, memo, r.payment_method)]
        if fees > 0:
            lines.append(Line(fee_code, fees, ZERO, "عمولة بوابة الدفع / رسوم بنكية", r.payment_method))
        lines.append(Line(GATEWAY_RECEIVABLE, ZERO, dep + fees, memo, r.payment_method))
        entries.append(Entry(r.revenue_date, f"COL-{_short(r.id)}", "collection", str(r.id), memo, lines,
                             r.created_at, 1))

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
