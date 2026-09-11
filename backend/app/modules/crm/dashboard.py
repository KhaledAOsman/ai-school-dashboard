"""
CRM dashboard stats endpoint - aggregates counts from leads, teachers, and
staff (sales reps) into one response for the CRM overview page: total
leads, attendance breakdown, call-outcome breakdown, headcount of active
customer-service reps, and count of registered teachers.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import CRM_LEAD_MANAGE, CRM_LEAD_VIEW
from app.core.users.models import AccountStatus, Permission, User, role_permissions, user_roles
from app.database.session import get_db
from app.modules.crm.leads.repository import LeadRepository
from app.modules.crm.teachers.repository import CRMTeacherRepository, TeacherSlotRepository

router = APIRouter(prefix="/crm/dashboard", tags=["crm-dashboard"])


class CRMDashboardStats(BaseModel):
    total_leads: int
    attended: int
    not_attended: int
    not_answered: int
    active_teachers: int
    available_slots: int
    sales_reps_count: int


@router.get("/stats", response_model=CRMDashboardStats)
async def get_dashboard_stats(
    user: CurrentUser = Depends(require_permission(CRM_LEAD_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    lead_repo = LeadRepository(db)
    teacher_repo = CRMTeacherRepository(db)
    slot_repo = TeacherSlotRepository(db)

    lead_counts = await lead_repo.get_dashboard_counts()
    active_teachers = await teacher_repo.count_active()
    available_slots = await slot_repo.count_all()

    # Count active users holding any role whose permission set includes
    # crm.lead.manage - i.e. customer-service/sales reps, regardless of
    # exact role name (works for "Sales Rep", "Sales Manager", or any
    # custom role an org creates later with the same capability). Joins
    # through the association tables explicitly (rather than via ORM
    # relationship chaining) to avoid ambiguous-join issues.
    reps_result = await db.execute(
        select(User.id)
        .select_from(User)
        .join(user_roles, user_roles.c.user_id == User.id)
        .join(role_permissions, role_permissions.c.role_id == user_roles.c.role_id)
        .join(Permission, Permission.id == role_permissions.c.permission_id)
        .where(User.status == AccountStatus.ACTIVE.value, Permission.code == CRM_LEAD_MANAGE)
        .distinct()
    )
    sales_reps_count = len(list(reps_result.scalars().all()))

    return CRMDashboardStats(
        total_leads=lead_counts["total_leads"],
        attended=lead_counts["attended"],
        not_attended=lead_counts["not_attended"],
        not_answered=lead_counts["not_answered"],
        active_teachers=active_teachers,
        available_slots=available_slots,
        sales_reps_count=sales_reps_count,
    )
