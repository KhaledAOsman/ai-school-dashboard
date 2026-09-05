from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.finance.staff.models import StaffDepartment, StaffMember


class StaffDepartmentRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, department_id: uuid.UUID) -> StaffDepartment | None:
        result = await self.db.execute(select(StaffDepartment).where(StaffDepartment.id == department_id))
        return result.scalar_one_or_none()

    async def get_by_name(self, name: str) -> StaffDepartment | None:
        result = await self.db.execute(select(StaffDepartment).where(StaffDepartment.name == name))
        return result.scalar_one_or_none()

    async def list_all(self, *, include_archived: bool = False) -> list[StaffDepartment]:
        stmt = select(StaffDepartment).order_by(StaffDepartment.display_order, StaffDepartment.name)
        if not include_archived:
            stmt = stmt.where(StaffDepartment.is_archived.is_(False))
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    def add(self, department: StaffDepartment) -> None:
        self.db.add(department)


class StaffRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, staff_id: uuid.UUID) -> StaffMember | None:
        result = await self.db.execute(
            select(StaffMember).options(selectinload(StaffMember.department)).where(StaffMember.id == staff_id)
        )
        return result.scalar_one_or_none()

    async def list_all(self, *, include_inactive: bool = False) -> list[StaffMember]:
        stmt = select(StaffMember).options(selectinload(StaffMember.department)).order_by(StaffMember.full_name)
        if not include_inactive:
            stmt = stmt.where(StaffMember.is_active.is_(True))
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    def add(self, staff: StaffMember) -> None:
        self.db.add(staff)
