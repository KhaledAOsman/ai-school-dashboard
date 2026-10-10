from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit.service import AuditService
from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import FINANCE_EXPENSE_APPROVE, FINANCE_REPORT_VIEW
from app.database.session import get_db
from app.modules.finance.accounting.models import JournalEntry, JournalLine
from app.modules.finance.accounting.schemas import JournalCreateRequest, JournalVoidRequest
from app.modules.finance.accounting.service import AccountingService

router = APIRouter(prefix="/finance/accounting", tags=["finance-accounting"])


async def _svc(db: AsyncSession) -> AccountingService:
    return await AccountingService(db).load()


@router.get("/accounts")
async def accounts(user: CurrentUser = Depends(require_permission(FINANCE_REPORT_VIEW)), db: AsyncSession = Depends(get_db)):
    return (await _svc(db)).chart()


@router.get("/journal")
async def journal(
    date_from: date | None = None,
    date_to: date | None = None,
    account: str | None = None,
    source_type: str | None = None,
    q: str | None = None,
    limit: int = 200,
    offset: int = 0,
    user: CurrentUser = Depends(require_permission(FINANCE_REPORT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    svc = await _svc(db)
    return svc.journal(date_from, date_to, account, source_type, q, min(max(limit, 1), 1000), max(offset, 0))


@router.get("/ledger/{account}")
async def ledger(
    account: str,
    date_from: date | None = None,
    date_to: date | None = None,
    party: str | None = None,
    user: CurrentUser = Depends(require_permission(FINANCE_REPORT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    svc = await _svc(db)
    data = svc.ledger(account, date_from, date_to, party)
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "الحساب غير موجود")
    data["parties"] = svc.parties(account)
    return data


@router.get("/trial-balance")
async def trial_balance(
    date_from: date | None = None,
    date_to: date | None = None,
    user: CurrentUser = Depends(require_permission(FINANCE_REPORT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    return (await _svc(db)).trial_balance(date_from, date_to)


@router.get("/income-statement")
async def income_statement(
    date_from: date | None = None,
    date_to: date | None = None,
    user: CurrentUser = Depends(require_permission(FINANCE_REPORT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    return (await _svc(db)).income_statement(date_from, date_to)


@router.get("/balance-sheet")
async def balance_sheet(
    as_of: date | None = None,
    user: CurrentUser = Depends(require_permission(FINANCE_REPORT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    return (await _svc(db)).balance_sheet(as_of)


@router.get("/cash-flow")
async def cash_flow(
    date_from: date | None = None,
    date_to: date | None = None,
    user: CurrentUser = Depends(require_permission(FINANCE_REPORT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    return (await _svc(db)).cash_flow(date_from, date_to)


@router.get("/checks")
async def checks(user: CurrentUser = Depends(require_permission(FINANCE_REPORT_VIEW)), db: AsyncSession = Depends(get_db)):
    return await (await _svc(db)).checks()


@router.post("/journal", status_code=201)
async def create_manual_entry(
    payload: JournalCreateRequest,
    user: CurrentUser = Depends(require_permission(FINANCE_EXPENSE_APPROVE)),
    db: AsyncSession = Depends(get_db),
):
    svc = await _svc(db)
    total_d = sum((l.debit for l in payload.lines), Decimal("0"))
    total_c = sum((l.credit for l in payload.lines), Decimal("0"))
    if total_d != total_c:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"القيد غير متوازن: المدين {total_d} ≠ الدائن {total_c}")
    for l in payload.lines:
        acc = svc.accounts.get(l.account_code)
        if acc is None or not acc.active:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"الحساب {l.account_code} غير موجود أو غير مفعّل")
        if not acc.postable or svc.children.get(l.account_code):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"الحساب {l.account_code} حساب تجميعي، اختار حساب فرعي")
    entry = JournalEntry(
        entry_date=payload.entry_date, memo=payload.memo, reference=payload.reference,
        source="manual", created_by=user.id,
        lines=[
            JournalLine(line_no=i, account_code=l.account_code, debit=l.debit, credit=l.credit, memo=l.memo, party=l.party)
            for i, l in enumerate(payload.lines, 1)
        ],
    )
    db.add(entry)
    await db.flush()
    await AuditService(db).record(
        user_id=user.id, action="journal.created", resource_type="JournalEntry", resource_id=str(entry.id),
        new_value={"date": entry.entry_date.isoformat(), "memo": entry.memo, "debit": str(total_d)},
    )
    await db.commit()
    return {"id": str(entry.id), "ref": entry.reference or f"JV-{entry.id.hex[:8].upper()}"}


@router.delete("/journal/{entry_id}", status_code=204)
async def void_manual_entry(
    entry_id: uuid.UUID,
    payload: JournalVoidRequest,
    user: CurrentUser = Depends(require_permission(FINANCE_EXPENSE_APPROVE)),
    db: AsyncSession = Depends(get_db),
):
    entry = await db.get(JournalEntry, entry_id)
    if entry is None or entry.voided_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "القيد غير موجود")
    entry.voided_at = datetime.now(timezone.utc)
    entry.void_reason = payload.reason
    await AuditService(db).record(
        user_id=user.id, action="journal.voided", resource_type="JournalEntry", resource_id=str(entry.id),
        previous_value={"memo": entry.memo}, new_value={"reason": payload.reason},
    )
    await db.commit()
