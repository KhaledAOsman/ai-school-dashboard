"""
TEMPORARY diagnostic endpoint - remove before any real deployment.

Lets us inspect exactly what's in the permissions/roles tables by visiting
a URL in the browser, since copy-pasting terminal output has been
unreliable in this session. No auth required so it's reachable directly
from the browser address bar for quick debugging.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions.registry import SEED_PERMISSIONS
from app.core.users.models import Permission, Role
from app.database.session import get_db

router = APIRouter(prefix="/debug", tags=["debug"])


@router.get("/permissions-state")
async def permissions_state(db: AsyncSession = Depends(get_db)):
    perms_result = await db.execute(select(Permission))
    all_perms = list(perms_result.scalars().all())

    roles_result = await db.execute(select(Role).options(selectinload(Role.permissions)))
    all_roles = list(roles_result.scalars().all())

    return {
        "registry_permission_count": len(SEED_PERMISSIONS),
        "registry_budget_staff_codes": [
            p.code for p in SEED_PERMISSIONS if "budget" in p.code or "staff" in p.code
        ],
        "total_permissions_in_db": len(all_perms),
        "budget_permissions": [p.code for p in all_perms if "budget" in p.code],
        "staff_permissions": [p.code for p in all_perms if "staff" in p.code],
        "all_permission_codes": sorted(p.code for p in all_perms),
        "roles": [
            {
                "name": r.name,
                "permission_count": len(r.permissions),
                "has_budget_view": any("budget.view" in p.code for p in r.permissions),
            }
            for r in all_roles
        ],
    }


@router.post("/run-permission-seed")
async def run_permission_seed(db: AsyncSession = Depends(get_db)):
    """
    Runs ONLY the permission-seeding logic, directly inside a live API
    request using the exact same DB session/connection the rest of the
    app uses - this removes any possible discrepancy between a separately
    invoked script's environment/connection and the running API's.
    """
    result = await db.execute(select(Permission))
    existing = {p.code: p for p in result.scalars().all()}

    added = []
    for perm_def in SEED_PERMISSIONS:
        if perm_def.code not in existing:
            perm = Permission(code=perm_def.code, description=perm_def.description, category=perm_def.category)
            db.add(perm)
            added.append(perm_def.code)

    await db.commit()

    result2 = await db.execute(select(Permission))
    final_count = len(list(result2.scalars().all()))

    return {
        "permissions_added_this_call": added,
        "total_permissions_after": final_count,
    }


@router.post("/run-role-permission-sync")
async def run_role_permission_sync(db: AsyncSession = Depends(get_db)):
    """
    Re-syncs every existing role's permission set to match what
    seed_initial_data.DEFAULT_ROLES would assign, using the SAME live API
    session (avoids whatever the separate script process was hitting).
    Only touches roles that already exist by name; does not create roles.
    """
    import importlib
    seed_module = importlib.import_module("scripts.seed_initial_data")

    perms_result = await db.execute(select(Permission))
    all_perms = list(perms_result.scalars().all())
    by_code = {p.code: p for p in all_perms}

    roles_result = await db.execute(select(Role).options(selectinload(Role.permissions)))
    all_roles = {r.name: r for r in roles_result.scalars().all()}

    updated = {}
    for role_name, perm_codes in seed_module.DEFAULT_ROLES.items():
        role = all_roles.get(role_name)
        if role is None:
            continue
        role.permissions = [by_code[c] for c in perm_codes if c in by_code]
        updated[role_name] = len(role.permissions)

    await db.commit()
    return {"updated_roles": updated}
