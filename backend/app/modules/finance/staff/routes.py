from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import FINANCE_STAFF_CREATE, FINANCE_STAFF_UPDATE, FINANCE_STAFF_VIEW
from app.database.session import get_db
from app.modules.finance.staff.schemas import (
    StaffCreateRequest,
    StaffDepartmentCreateRequest,
    StaffDepartmentGroup,
    StaffDepartmentResponse,
    StaffResponse,
    StaffUpdateRequest,
)
from app.modules.finance.staff.service import StaffDepartmentService, StaffService

router = APIRouter(prefix="/finance/staff", tags=["finance-staff"])


def _to_staff_response(staff) -> StaffResponse:
    return StaffResponse(
        id=staff.id,
        full_name=staff.full_name,
        department_id=staff.department_id,
        department_name=staff.department.name,
        email=staff.email,
        phone=staff.phone,
        base_salary=staff.base_salary,
        currency=staff.currency,
        is_active=staff.is_active,
        created_at=staff.created_at,
    )


@router.get("/departments", response_model=list[StaffDepartmentResponse])
async def list_departments(
    include_archived: bool = False,
    user: CurrentUser = Depends(require_permission(FINANCE_STAFF_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    service = StaffDepartmentService(db)
    return await service.list_all(include_archived=include_archived)


@router.post("/departments", response_model=StaffDepartmentResponse, status_code=201)
async def create_department(
    payload: StaffDepartmentCreateRequest,
    # Creating a department is a structural/org-chart change - gate it
    # behind the same permission as creating a staff member, since anyone
    # who can add a staff member should be able to add the department they
    # need for that person too.
    user: CurrentUser = Depends(require_permission(FINANCE_STAFF_CREATE)),
    db: AsyncSession = Depends(get_db),
):
    service = StaffDepartmentService(db)
    return await service.create(payload=payload, user_id=user.id)


@router.get("/grouped", response_model=list[StaffDepartmentGroup])
async def list_staff_grouped(
    include_inactive: bool = False,
    user: CurrentUser = Depends(require_permission(FINANCE_STAFF_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    service = StaffService(db)
    return await service.list_grouped_by_department(include_inactive=include_inactive)


@router.get("", response_model=list[StaffResponse])
async def list_staff(
    include_inactive: bool = False,
    user: CurrentUser = Depends(require_permission(FINANCE_STAFF_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    service = StaffService(db)
    members = await service.list_all(include_inactive=include_inactive)
    return [_to_staff_response(m) for m in members]


@router.post("", response_model=StaffResponse, status_code=201)
async def create_staff(
    payload: StaffCreateRequest,
    user: CurrentUser = Depends(require_permission(FINANCE_STAFF_CREATE)),
    db: AsyncSession = Depends(get_db),
):
    service = StaffService(db)
    staff = await service.create(payload=payload, user_id=user.id)
    return _to_staff_response(staff)


@router.patch("/{staff_id}", response_model=StaffResponse)
async def update_staff(
    staff_id: uuid.UUID,
    payload: StaffUpdateRequest,
    user: CurrentUser = Depends(require_permission(FINANCE_STAFF_UPDATE)),
    db: AsyncSession = Depends(get_db),
):
    service = StaffService(db)
    staff = await service.update(staff_id=staff_id, payload=payload, user_id=user.id)
    return _to_staff_response(staff)
