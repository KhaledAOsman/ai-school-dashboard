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

from app.core.cache import cached
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
    """period: 'all' (since launch, the default) or 'phase:<id>' (one project
    phase); legacy 'Q1' / '2026-Q4' / '2026-H2' keys still work. Returns the period, the previous period for comparison
    (quarters only), the phase goals and the available period options."""
    # cached per period; any write anywhere bumps the cache version
    return await cached(f"kpi:summary:{period or ''}", lambda: KpiService(db).summary(period))


class PhaseTargets(BaseModel):
    subscribers: int = Field(ge=1, le=1_000_000)
    max_cac: float = Field(gt=0, le=10_000_000)
    min_conversion: float = Field(ge=0, le=100)
    min_attendance: float = Field(ge=0, le=100)


class PhaseIn(BaseModel):
    id: str | None = Field(default=None, max_length=40)
    name: str = Field(min_length=1, max_length=80)
    start: date
    end_inclusive: date
    targets: PhaseTargets


class PhasesRequest(BaseModel):
    phases: list[PhaseIn] = Field(min_length=1, max_length=12)


@router.put("/phases")
async def save_kpi_phases(
    payload: PhasesRequest,
    user: CurrentUser = Depends(require_permission(DASHBOARDS_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Replace the project phases. Each phase has its own window and targets;
    the dashboard's period filter lists one option per phase."""
    phases = sorted(payload.phases, key=lambda p: p.start)
    for p in phases:
        if p.end_inclusive < p.start:
            raise HTTPException(status_code=422, detail=f"نهاية «{p.name}» قبل بدايتها")
    for a, b in zip(phases, phases[1:]):
        if b.start <= a.end_inclusive:
            raise HTTPException(status_code=422, detail=f"«{b.name}» بتبدأ قبل ما «{a.name}» تخلص — المراحل لازم ما تتداخلش")
    ids = [p.id for p in phases if p.id]
    if len(ids) != len(set(ids)):
        raise HTTPException(status_code=422, detail="معرّفات المراحل مكررة")
    used = set(ids)
    items = []
    for i, p in enumerate(phases):
        pid = p.id
        if not pid:
            n = 1
            while f"p{n}" in used:
                n += 1
            pid = f"p{n}"
            used.add(pid)
        items.append({"id": pid, "name": p.name, "start": p.start, "end_inclusive": p.end_inclusive,
                      "targets": p.targets.model_dump()})
    return await KpiService(db).save_phases(items)


@router.get("/settings")
async def get_kpi_settings(
    user: CurrentUser = Depends(require_permission(DASHBOARDS_KPI_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    out = await KpiService(db).get_settings()
    return {k: v for k, v in out.items() if not k.startswith("_")}


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
