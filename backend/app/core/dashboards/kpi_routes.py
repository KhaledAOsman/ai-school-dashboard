"""
Half-yearly project KPI dashboard (management view).

Funnel (CRM cohort) -> subscribers & revenue -> marketing cost (CAC, CPL,
ROAS, per-platform spend). Deliberately contains NO expense/budget/salary
figures - finance data lives in the Finance section only.

Gated by dashboards.kpi.view so management can see project KPIs without
getting full CRM or Finance module access.
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import DASHBOARDS_KPI_VIEW, DASHBOARDS_MANAGE
from app.database.session import get_db
from app.modules.marketing.service import KpiService

router = APIRouter(prefix="/kpi-dashboard", tags=["kpi-dashboard"])


class KpiSettingsRequest(BaseModel):
    """Year-1 phase window (inclusive dates) and management targets."""
    phase_start: date | None = None
    phase_end_inclusive: date | None = None
    subscribers: int | None = Field(default=None, ge=1, le=1_000_000)
    max_cac: float | None = Field(default=None, gt=0, le=10_000_000)
    min_conversion: float | None = Field(default=None, ge=0, le=100)
    min_attendance: float | None = Field(default=None, ge=0, le=100)


@router.get("/summary")
async def kpi_summary(
    period: str | None = None,
    user: CurrentUser = Depends(require_permission(DASHBOARDS_KPI_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """period: '2026-Q4' (calendar quarter), 'phase' (the Year-1 phase window),
    'all' (since launch) or a legacy half-year '2026-H2'. Defaults to the
    current quarter. Returns the period, the previous period for comparison
    (quarters only), the phase goals and the available period options."""
    return await KpiService(db).summary(period)


@router.get("/settings")
async def get_kpi_settings(
    user: CurrentUser = Depends(require_permission(DASHBOARDS_KPI_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    out = await KpiService(db).get_settings()
    out.pop("_phase_end", None)
    return out


@router.patch("/settings")
async def update_kpi_settings(
    payload: KpiSettingsRequest,
    user: CurrentUser = Depends(require_permission(DASHBOARDS_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    svc = KpiService(db)
    values = payload.model_dump(exclude_unset=True)  # PATCH: untouched fields stay as they are
    current = await svc.get_settings()
    start = values.get("phase_start", current["phase_start"]) or current["phase_start"]
    end = values.get("phase_end_inclusive", current["phase_end_inclusive"]) or current["phase_end_inclusive"]
    if end < start:
        raise HTTPException(status_code=422, detail="تاريخ نهاية المرحلة يجب أن يكون بعد تاريخ البداية")
    return await svc.update_settings(values)
