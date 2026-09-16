"""
Combined KPI dashboard: read-only summary cards from CRM + Finance, gated
by a single permission (dashboards.kpi.view) so an org can grant a manager
visibility into both without giving them full CRM or Finance module
access (which would carry create/edit/approve capabilities they don't
need). Every number here is sourced from the same repositories/services
the full modules already use - this endpoint adds no new business logic,
just a combined read.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import DASHBOARDS_KPI_VIEW
from app.database.session import get_db
from app.modules.crm.leads.repository import LeadRepository
from app.modules.crm.teachers.repository import CRMTeacherRepository, TeacherSlotRepository
from app.modules.finance.reports.service import FinanceReportService

router = APIRouter(prefix="/kpi-dashboard", tags=["kpi-dashboard"])


class KpiDashboardResponse(BaseModel):
    # CRM
    total_leads: int
    leads_without_bookings: int
    currently_booked: int
    attended: int
    not_attended: int
    not_answered: int
    not_interested: int
    active_teachers: int
    available_slots: int
    # Finance
    total_expenses_month: float
    total_expenses_quarter: float
    total_expenses_year: float
    pending_approval_count: int
    pending_approval_amount: float


@router.get("/stats", response_model=KpiDashboardResponse)
async def get_kpi_dashboard_stats(
    user: CurrentUser = Depends(require_permission(DASHBOARDS_KPI_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    lead_repo = LeadRepository(db)
    teacher_repo = CRMTeacherRepository(db)
    slot_repo = TeacherSlotRepository(db)
    finance = FinanceReportService(db)

    lead_counts = await lead_repo.get_dashboard_counts()
    leads_without_bookings = await lead_repo.count_without_bookings()
    currently_booked = await lead_repo.count_currently_booked()
    not_interested = await lead_repo.count_not_interested()
    active_teachers = await teacher_repo.count_active()
    available_slots = await slot_repo.count_available()
    finance_summary = await finance.summary()

    return KpiDashboardResponse(
        total_leads=lead_counts["total_leads"],
        leads_without_bookings=leads_without_bookings,
        currently_booked=currently_booked,
        attended=lead_counts["attended"],
        not_attended=lead_counts["not_attended"],
        not_answered=lead_counts["not_answered"],
        not_interested=not_interested,
        active_teachers=active_teachers,
        available_slots=available_slots,
        total_expenses_month=float(finance_summary["total_expenses_month"]),
        total_expenses_quarter=float(finance_summary["total_expenses_quarter"]),
        total_expenses_year=float(finance_summary["total_expenses_year"]),
        pending_approval_count=finance_summary["pending_approval_count"],
        pending_approval_amount=float(finance_summary["pending_approval_amount"]),
    )
