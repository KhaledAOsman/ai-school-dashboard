from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit.service import AuditService
from app.core.permissions.object_policy import ensure_found
from app.modules.finance.staff.models import StaffDepartment, StaffMember
from app.modules.finance.staff.repository import StaffDepartmentRepository, StaffRepository
from app.modules.finance.staff.schemas import (
    StaffCreateRequest,
    StaffDepartmentCreateRequest,
    StaffDepartmentGroup,
    StaffResponse,
    StaffUpdateRequest,
)


class StaffDepartmentService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = StaffDepartmentRepository(db)
        self.audit = AuditService(db)

    async def create(self, *, payload: StaffDepartmentCreateRequest, user_id: uuid.UUID) -> StaffDepartment:
        existing = await self.repo.get_by_name(payload.name)
        if existing is not None:
            if existing.is_archived:
                # Reviving a previously-archived department the user is
                # re-typing is more useful than a hard conflict here.
                existing.is_archived = False
                await self.db.commit()
                return existing
            raise HTTPException(status.HTTP_409_CONFLICT, "A department with this name already exists")

        department = StaffDepartment(name=payload.name, display_order=payload.display_order, created_by=user_id)
        self.repo.add(department)
        await self.db.flush()

        await self.audit.record(
            user_id=user_id,
            action="staff_department.created",
            resource_type="StaffDepartment",
            resource_id=str(department.id),
            new_value={"name": department.name},
        )
        await self.db.commit()
        return department

    async def list_all(self, *, include_archived: bool = False) -> list[StaffDepartment]:
        return await self.repo.list_all(include_archived=include_archived)


class StaffService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = StaffRepository(db)
        self.dept_repo = StaffDepartmentRepository(db)
        self.audit = AuditService(db)

    async def create(self, *, payload: StaffCreateRequest, user_id: uuid.UUID) -> StaffMember:
        department = await self.dept_repo.get_by_id(payload.department_id)
        ensure_found(department, "Department")

        staff = StaffMember(
            full_name=payload.full_name,
            department_id=payload.department_id,
            email=payload.email,
            phone=payload.phone,
            base_salary=payload.base_salary,
            currency=payload.currency,
            created_by=user_id,
        )
        self.repo.add(staff)
        await self.db.flush()

        await self.audit.record(
            user_id=user_id,
            action="staff.created",
            resource_type="StaffMember",
            resource_id=str(staff.id),
            new_value={"full_name": staff.full_name, "department": department.name},
        )
        await self.db.commit()
        return await self.repo.get_by_id(staff.id)

    async def update(self, *, staff_id: uuid.UUID, payload: StaffUpdateRequest, user_id: uuid.UUID) -> StaffMember:
        staff = await self.repo.get_by_id(staff_id)
        ensure_found(staff, "Staff member")

        if payload.full_name is not None:
            staff.full_name = payload.full_name
        if payload.department_id is not None:
            department = await self.dept_repo.get_by_id(payload.department_id)
            ensure_found(department, "Department")
            staff.department_id = payload.department_id
        if payload.email is not None:
            staff.email = payload.email
        if payload.phone is not None:
            staff.phone = payload.phone
        if payload.base_salary is not None:
            staff.base_salary = payload.base_salary
        if payload.is_active is not None:
            staff.is_active = payload.is_active

        await self.audit.record(
            user_id=user_id,
            action="staff.updated",
            resource_type="StaffMember",
            resource_id=str(staff.id),
        )
        await self.db.commit()
        return await self.repo.get_by_id(staff_id)

    async def list_all(self, *, include_inactive: bool = False) -> list[StaffMember]:
        return await self.repo.list_all(include_inactive=include_inactive)

    async def get(self, *, staff_id: uuid.UUID) -> StaffMember:
        staff = await self.repo.get_by_id(staff_id)
        ensure_found(staff, "Staff member")
        return staff

    async def list_grouped_by_department(self, *, include_inactive: bool = False) -> list[StaffDepartmentGroup]:
        """
        Returns every department (including empty ones, so a newly created
        department shows up immediately) with its members nested inside and
        rollup totals (headcount + total base salary) computed here rather
        than in the DB, since the member list is already small per org.
        """
        departments = await self.dept_repo.list_all()
        members = await self.repo.list_all(include_inactive=include_inactive)

        by_department: dict[uuid.UUID, list[StaffMember]] = {}
        for m in members:
            by_department.setdefault(m.department_id, []).append(m)

        groups: list[StaffDepartmentGroup] = []
        for dept in departments:
            dept_members = by_department.get(dept.id, [])
            total = sum((m.base_salary or Decimal("0")) for m in dept_members) or Decimal("0")
            groups.append(
                StaffDepartmentGroup(
                    department_id=dept.id,
                    department_name=dept.name,
                    member_count=len(dept_members),
                    total_salary=total,
                    members=[
                        StaffResponse(
                            id=m.id,
                            full_name=m.full_name,
                            department_id=m.department_id,
                            department_name=dept.name,
                            email=m.email,
                            phone=m.phone,
                            base_salary=m.base_salary,
                            currency=m.currency,
                            is_active=m.is_active,
                            created_at=m.created_at,
                        )
                        for m in dept_members
                    ],
                )
            )
        return groups
