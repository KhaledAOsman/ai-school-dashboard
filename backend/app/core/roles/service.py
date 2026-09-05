"""
RoleService: create/update/delete roles and manage their permission sets.

Spec requirement: "The Admin must be able to create custom roles and assign
permissions" and "do not assume Admin/Owner/Director/Finance Manager are the
only possible future roles." This service has no special-casing of any role
name - it operates purely on Role rows and Permission codes.
"""
from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit.service import AuditService
from app.core.users.models import Role
from app.core.users.repository import PermissionRepository, RoleRepository
from app.core.users.schemas import RoleCreateRequest, RoleUpdateRequest


class RoleService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.roles = RoleRepository(db)
        self.permissions = PermissionRepository(db)
        self.audit = AuditService(db)

    async def list_roles(self) -> list[Role]:
        return await self.roles.list_all()

    async def create_role(self, *, payload: RoleCreateRequest, actor_id: uuid.UUID) -> Role:
        existing = await self.roles.get_by_name(payload.name)
        if existing is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "A role with this name already exists")

        permission_rows = await self.permissions.get_by_codes(payload.permission_codes)
        found_codes = {p.code for p in permission_rows}
        missing = set(payload.permission_codes) - found_codes
        if missing:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown permission codes: {sorted(missing)}")

        role = Role(
            name=payload.name,
            description=payload.description,
            is_system_role=False,
            permissions=permission_rows,
        )
        self.roles.add(role)
        await self.db.flush()

        await self.audit.record(
            user_id=actor_id,
            action="role.created",
            resource_type="Role",
            resource_id=str(role.id),
            new_value={"name": role.name, "permissions": sorted(found_codes)},
        )
        await self.db.commit()
        # Re-fetch through the repository (which eager-loads .permissions via
        # selectinload) rather than returning the in-memory `role` object
        # directly - this avoids relying on relationship state surviving a
        # commit, matching the same fix applied to the expense workflow
        # endpoints.
        return await self.roles.get_by_id(role.id)

    async def update_role(
        self, *, role_id: uuid.UUID, payload: RoleUpdateRequest, actor_id: uuid.UUID
    ) -> Role:
        role = await self.roles.get_by_id(role_id)
        if role is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")

        previous = {
            "description": role.description,
            "permissions": sorted(p.code for p in role.permissions),
        }

        if payload.description is not None:
            role.description = payload.description

        if payload.permission_codes is not None:
            permission_rows = await self.permissions.get_by_codes(payload.permission_codes)
            found_codes = {p.code for p in permission_rows}
            missing = set(payload.permission_codes) - found_codes
            if missing:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST, f"Unknown permission codes: {sorted(missing)}"
                )
            role.permissions = permission_rows

        await self.audit.record(
            user_id=actor_id,
            action="role.updated",
            resource_type="Role",
            resource_id=str(role.id),
            previous_value=previous,
            new_value={
                "description": role.description,
                "permissions": sorted(p.code for p in role.permissions),
            },
        )
        await self.db.commit()
        return await self.roles.get_by_id(role.id)

    async def delete_role(self, *, role_id: uuid.UUID, actor_id: uuid.UUID) -> None:
        role = await self.roles.get_by_id(role_id)
        if role is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
        if role.is_system_role:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "System roles cannot be deleted")
        if role.users:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Cannot delete a role that is still assigned to users. Reassign them first.",
            )

        await self.audit.record(
            user_id=actor_id,
            action="role.deleted",
            resource_type="Role",
            resource_id=str(role.id),
            previous_value={"name": role.name},
        )
        await self.db.delete(role)
        await self.db.commit()
