"""
Seed script: populates permissions, default system roles, and creates the
first Owner/Admin user. Safe to re-run (idempotent) - existing rows are
left untouched.

Usage:
    python -m scripts.seed_initial_data

Required environment variables (in addition to standard app .env):
    SEED_ADMIN_EMAIL
    SEED_ADMIN_PASSWORD
    SEED_ADMIN_FULL_NAME (optional, defaults to "System Administrator")

Do NOT run this against production with default/placeholder credentials.
Always supply a strong, unique password via environment variable - never
hard-code one here.
"""
from __future__ import annotations

import asyncio
import os
import sys

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.permissions.registry import SEED_PERMISSIONS
from app.core.security.passwords import hash_password, validate_password_policy, PasswordPolicyError
from app.core.users.models import AccountStatus, Permission, Role, User
from app.database.session import AsyncSessionLocal


DEFAULT_ROLES: dict[str, list[str]] = {
    "Owner": [p.code for p in SEED_PERMISSIONS],  # Owner: full access by default
    "Admin": [
        p.code
        for p in SEED_PERMISSIONS
        if p.category in {"users", "roles", "permissions", "dashboards", "audit", "security", "settings"}
    ]
    + [
        # Admin is who enters new leads into the system (see crm.lead.create
        # vs crm.lead.manage) and can see/reassign every rep's leads, plus
        # manage the teacher/slot roster - but does not work leads through
        # the pipeline day-to-day (that's crm.lead.manage, left to Sales
        # Rep/Manager roles).
        "crm.lead.view", "crm.lead.view_all", "crm.lead.create",
        "crm.teacher.view", "crm.teacher.manage",
    ],
    "Finance Manager": [p.code for p in SEED_PERMISSIONS if p.category == "finance"],
    "Director": [
        p.code
        for p in SEED_PERMISSIONS
        if p.category in {"finance", "dashboards"} and "delete" not in p.code and "approve" not in p.code
    ],
    # General Manager: approves budget lines and individual expenses, views
    # everything finance-related, but does not create/edit line items
    # themselves (that's the accountant's job) - mirrors the real-world
    # segregation of duties between an accountant proposing spend and a
    # manager approving it.
    "General Manager": [
        p.code
        for p in SEED_PERMISSIONS
        if p.category == "finance"
        and (
            p.code.endswith(".view")
            or p.code.endswith(".approve")
            or p.code.endswith(".reject")
            or p.code.endswith(".export")
        )
    ],
    # Sales Rep: a call-center / customer-service agent working the trial-
    # lecture pipeline. Can view teachers' available slots to book against,
    # and can work (advance/convert/lose) leads already assigned to them -
    # but cannot create brand-new leads themselves (only an Admin/Sales
    # Manager enters new leads - see crm.lead.create), and only ever sees
    # their OWN assigned leads since crm.lead.view_all is withheld.
    "Sales Rep": ["crm.lead.view", "crm.lead.manage", "crm.teacher.view"],
    # Sales Manager: sees every rep's leads and can reassign them between
    # reps, creates new leads to distribute, plus manages the teacher/slot
    # roster itself.
    "Sales Manager": [
        "crm.lead.view", "crm.lead.view_all", "crm.lead.create", "crm.lead.manage",
        "crm.teacher.view", "crm.teacher.manage",
    ],
}


async def seed_permissions(session) -> dict[str, Permission]:
    result = await session.execute(select(Permission))
    existing = {p.code: p for p in result.scalars().all()}

    for perm_def in SEED_PERMISSIONS:
        if perm_def.code not in existing:
            perm = Permission(code=perm_def.code, description=perm_def.description, category=perm_def.category)
            session.add(perm)
            existing[perm_def.code] = perm

    await session.flush()
    return existing


async def seed_roles(session, permissions_by_code: dict[str, Permission]) -> dict[str, Role]:
    result = await session.execute(select(Role).options(selectinload(Role.permissions)))
    existing = {r.name: r for r in result.scalars().all()}

    for role_name, perm_codes in DEFAULT_ROLES.items():
        if role_name not in existing:
            role = Role(
                name=role_name,
                description=f"System role: {role_name}",
                is_system_role=True,
                permissions=[permissions_by_code[c] for c in perm_codes if c in permissions_by_code],
            )
            session.add(role)
            existing[role_name] = role
        else:
            # Keep system role permissions in sync with the registry on
            # every seed run, so adding a new permission for an existing
            # module reaches Owner/Admin/etc without a manual DB edit.
            existing[role_name].permissions = [
                permissions_by_code[c] for c in perm_codes if c in permissions_by_code
            ]

    await session.flush()
    return existing


async def seed_admin_user(session, roles_by_name: dict[str, Role]) -> None:
    email = os.environ.get("SEED_ADMIN_EMAIL")
    password = os.environ.get("SEED_ADMIN_PASSWORD")
    full_name = os.environ.get("SEED_ADMIN_FULL_NAME", "System Administrator")

    if not email or not password:
        print(
            "SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set - skipping admin user "
            "creation. Set both environment variables and re-run to create the "
            "first Owner/Admin account.",
            file=sys.stderr,
        )
        return

    try:
        validate_password_policy(password)
    except PasswordPolicyError as exc:
        print(f"SEED_ADMIN_PASSWORD does not meet policy: {exc.errors}", file=sys.stderr)
        return

    result = await session.execute(select(User).where(User.email == email.lower()))
    if result.scalar_one_or_none() is not None:
        print(f"User {email} already exists - skipping.", file=sys.stderr)
        return

    user = User(
        email=email.lower(),
        full_name=full_name,
        password_hash=hash_password(password),
        status=AccountStatus.ACTIVE.value,
        roles=[roles_by_name["Owner"], roles_by_name["Admin"]],
    )
    session.add(user)
    print(f"Created initial Owner/Admin user: {email}")


async def main() -> None:
    print(f"SEED_PERMISSIONS in registry: {len(SEED_PERMISSIONS)} entries", file=sys.stderr)
    print(f"Codes: {[p.code for p in SEED_PERMISSIONS if 'budget' in p.code or 'staff' in p.code]}", file=sys.stderr)

    async with AsyncSessionLocal() as session:
        permissions_by_code = await seed_permissions(session)
        print(f"After seed_permissions(): {len(permissions_by_code)} permissions in DB session", file=sys.stderr)

        roles_by_name = await seed_roles(session, permissions_by_code)
        print(f"After seed_roles(): {list(roles_by_name.keys())}", file=sys.stderr)

        await seed_admin_user(session, roles_by_name)

        try:
            await session.commit()
            print("Commit succeeded.", file=sys.stderr)
        except Exception as exc:
            print(f"COMMIT FAILED: {type(exc).__name__}: {exc}", file=sys.stderr)
            raise
    print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(main())
