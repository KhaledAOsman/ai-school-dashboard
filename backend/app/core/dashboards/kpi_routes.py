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

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import DASHBOARDS_KPI_VIEW, DASHBOARDS_MANAGE
from app.database.session import get_db
from app.modules.marketing.service import KpiService, build_phases

router = APIRouter(prefix="/kpi-dashboard", tags=["kpi-dashboard"])


class KpiSettingsRequest(BaseModel):
    project_start_date: date | None = None
    full_launch_date: date | None = None


@router.get("/summary")
async def kpi_summary(
    period: str | None = None,
    user: CurrentUser = Depends(require_permission(DASHBOARDS_KPI_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """period like '2026-H2' (H1 = Jan-Jun, H2 = Jul-Dec); defaults to the
    current half-year. Returns the period, the previous period for
    comparison, and the project phase map."""
    return await KpiService(db).summary(period)


@router.get("/settings")
async def get_kpi_settings(
    user: CurrentUser = Depends(require_permission(DASHBOARDS_KPI_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    return build_phases(await KpiService(db).get_settings())


@router.put("/settings")
async def update_kpi_settings(
    payload: KpiSettingsRequest,
    user: CurrentUser = Depends(require_permission(DASHBOARDS_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    values = {k: (v.isoformat() if v else None) for k, v in payload.model_dump().items()}
    return build_phases(await KpiService(db).update_settings(values))
