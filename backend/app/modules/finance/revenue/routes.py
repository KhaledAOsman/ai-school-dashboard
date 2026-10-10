from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit.service import AuditService
from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import (
    FINANCE_EXPENSE_CREATE,
    FINANCE_EXPENSE_DELETE,
    FINANCE_EXPENSE_UPDATE,
    FINANCE_EXPENSE_VIEW,
)
from app.database.session import get_db
from app.modules.finance.revenue.models import FinanceRevenue
from app.modules.finance.revenue.schemas import (
    RevenueCreateRequest,
    RevenueMonth,
    RevenueResponse,
    RevenueSummary,
    RevenueUpdateRequest,
)
from app.modules.marketing.models import Subscription

router = APIRouter(prefix="/finance/revenue", tags=["finance-revenue"])


def _out(r: FinanceRevenue) -> RevenueResponse:
    return RevenueResponse(
        id=r.id, revenue_date=r.revenue_date, amount=r.amount, discount_amount=r.discount_amount,
        fees_amount=r.fees_amount or 0, gross_amount=r.amount + (r.fees_amount or 0), currency=r.currency, revenue_type=r.revenue_type,
        customer_name=r.customer_name, package_name=r.package_name, invoice_number=r.invoice_number,
        invoice_url=r.invoice_url, payment_method=r.payment_method, note=r.note, source=r.source,
        created_at=r.created_at,
    )


def _clean(data: dict) -> dict:
    for k in ("invoice_url", "customer_name", "package_name", "invoice_number", "payment_method", "note"):
        if k in data and isinstance(data[k], str) and not data[k].strip():
            data[k] = None
    return data


@router.get("/summary", response_model=RevenueSummary)
async def revenue_summary(
    user: CurrentUser = Depends(require_permission(FINANCE_EXPENSE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Revenue (paid subscriptions) vs. what reached the bank, month by month."""
    sm = func.to_char(Subscription.subscribed_at, "YYYY-MM")
    subs = (await db.execute(
        select(sm, func.count(Subscription.id), func.coalesce(func.sum(Subscription.amount_paid), 0),
               func.coalesce(func.sum(Subscription.discount_amount), 0)).group_by(sm)
    )).all()
    cm = func.to_char(FinanceRevenue.revenue_date, "YYYY-MM")
    cols = (await db.execute(
        select(cm, func.coalesce(func.sum(FinanceRevenue.amount), 0),
               func.coalesce(func.sum(FinanceRevenue.fees_amount), 0)).group_by(cm)
    )).all()
    months: dict[str, dict] = {}
    for m, n, paid, disc in subs:
        months.setdefault(m, dict(month=m, subscriptions_count=0, subscriptions_paid=0, discounts=0, collected=0, fees=0))
        months[m].update(subscriptions_count=n, subscriptions_paid=paid, discounts=disc)
    for m, dep, fees in cols:
        months.setdefault(m, dict(month=m, subscriptions_count=0, subscriptions_paid=0, discounts=0, collected=0, fees=0))
        months[m].update(collected=dep, fees=fees)
    rows = [RevenueMonth(**months[k]) for k in sorted(months)]
    paid = sum((r.subscriptions_paid for r in rows), 0)
    collected = sum((r.collected for r in rows), 0)
    fees = sum((r.fees for r in rows), 0)
    return RevenueSummary(
        subscriptions_count=sum(r.subscriptions_count for r in rows),
        subscriptions_paid=paid,
        discounts=sum((r.discounts for r in rows), 0),
        collected=collected,
        fees=fees,
        outstanding=paid - collected - fees,
        months=rows,
    )


@router.get("", response_model=list[RevenueResponse])
async def list_revenue(
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = None,
    limit: int = 500,
    user: CurrentUser = Depends(require_permission(FINANCE_EXPENSE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(FinanceRevenue)
    if date_from:
        stmt = stmt.where(FinanceRevenue.revenue_date >= date_from)
    if date_to:
        stmt = stmt.where(FinanceRevenue.revenue_date <= date_to)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(
            FinanceRevenue.customer_name.ilike(like), FinanceRevenue.package_name.ilike(like),
            FinanceRevenue.invoice_number.ilike(like), FinanceRevenue.note.ilike(like),
        ))
    stmt = stmt.order_by(FinanceRevenue.revenue_date.desc(), FinanceRevenue.created_at.desc()).limit(min(limit, 2000))
    return [_out(r) for r in (await db.execute(stmt)).scalars().all()]


@router.post("", response_model=RevenueResponse, status_code=201)
async def create_revenue(
    payload: RevenueCreateRequest,
    user: CurrentUser = Depends(require_permission(FINANCE_EXPENSE_CREATE)),
    db: AsyncSession = Depends(get_db),
):
    row = FinanceRevenue(**_clean(payload.model_dump()), created_by=user.id)
    db.add(row)
    await db.flush()
    await AuditService(db).record(
        user_id=user.id, action="revenue.created", resource_type="FinanceRevenue", resource_id=str(row.id),
        new_value={"amount": str(row.amount), "date": row.revenue_date.isoformat(), "customer": row.customer_name},
    )
    await db.commit()
    await db.refresh(row)
    return _out(row)


async def _get(db: AsyncSession, rid: uuid.UUID) -> FinanceRevenue:
    row = await db.get(FinanceRevenue, rid)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "الإيراد غير موجود")
    return row


@router.patch("/{revenue_id}", response_model=RevenueResponse)
async def update_revenue(
    revenue_id: uuid.UUID,
    payload: RevenueUpdateRequest,
    user: CurrentUser = Depends(require_permission(FINANCE_EXPENSE_UPDATE)),
    db: AsyncSession = Depends(get_db),
):
    row = await _get(db, revenue_id)
    before = {"amount": str(row.amount), "date": row.revenue_date.isoformat(), "discount": str(row.discount_amount)}
    for k, v in _clean(payload.model_dump(exclude_unset=True)).items():
        setattr(row, k, v)
    await AuditService(db).record(
        user_id=user.id, action="revenue.updated", resource_type="FinanceRevenue", resource_id=str(row.id),
        previous_value=before,
        new_value={"amount": str(row.amount), "date": row.revenue_date.isoformat(), "discount": str(row.discount_amount)},
    )
    await db.commit()
    await db.refresh(row)
    return _out(row)


@router.delete("/{revenue_id}", status_code=204)
async def delete_revenue(
    revenue_id: uuid.UUID,
    user: CurrentUser = Depends(require_permission(FINANCE_EXPENSE_DELETE)),
    db: AsyncSession = Depends(get_db),
):
    row = await _get(db, revenue_id)
    await AuditService(db).record(
        user_id=user.id, action="revenue.deleted", resource_type="FinanceRevenue", resource_id=str(row.id),
        previous_value={"amount": str(row.amount), "date": row.revenue_date.isoformat(), "customer": row.customer_name},
    )
    await db.delete(row)
    await db.commit()
