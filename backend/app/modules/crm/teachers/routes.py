from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import CRM_TEACHER_MANAGE, CRM_TEACHER_VIEW
from app.database.session import get_db
from app.modules.crm.teachers.schemas import (
    CRMTeacherCreateRequest,
    CRMTeacherResponse,
    CRMTeacherWithSlotsResponse,
    TeacherSlotCreateRequest,
    TeacherSlotResponse,
)
from app.modules.crm.teachers.service import CRMTeacherService

router = APIRouter(prefix="/crm/teachers", tags=["crm-teachers"])


@router.get("", response_model=list[CRMTeacherWithSlotsResponse])
async def list_teachers(
    include_inactive: bool = False,
    user: CurrentUser = Depends(require_permission(CRM_TEACHER_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Every teacher with their currently-available (not-yet-booked) slots
    attached - this is what the lead booking dropdown reads from."""
    service = CRMTeacherService(db)
    return await service.list_teachers_with_available_slots(include_inactive=include_inactive)


@router.post("", response_model=CRMTeacherResponse, status_code=201)
async def create_teacher(
    payload: CRMTeacherCreateRequest,
    user: CurrentUser = Depends(require_permission(CRM_TEACHER_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    service = CRMTeacherService(db)
    return await service.create_teacher(payload=payload, user_id=user.id)


@router.post("/{teacher_id}/slots", response_model=TeacherSlotResponse, status_code=201)
async def add_teacher_slot(
    teacher_id: uuid.UUID,
    payload: TeacherSlotCreateRequest,
    user: CurrentUser = Depends(require_permission(CRM_TEACHER_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Customer service adds an available slot for a teacher - this is the
    "خدمة العملاء بتتحكم في المواعيد" control point."""
    service = CRMTeacherService(db)
    return await service.add_slot(teacher_id=teacher_id, payload=payload, user_id=user.id)


@router.post("/{teacher_id}/deactivate", response_model=CRMTeacherResponse)
async def deactivate_teacher(
    teacher_id: uuid.UUID,
    user: CurrentUser = Depends(require_permission(CRM_TEACHER_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    service = CRMTeacherService(db)
    return await service.deactivate_teacher(teacher_id=teacher_id)
