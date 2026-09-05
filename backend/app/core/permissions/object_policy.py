"""
Object-level authorization helper.

require_permission() (see dependencies.py) only proves the user holds a
permission in general - e.g. "finance.expense.view". It says nothing about
whether the user should be able to view *this specific* expense once
object-level restrictions exist (e.g. department-scoped visibility, or
"users can only view their own draft expenses").

Today, the initial release grants any holder of finance.expense.view access
to any expense (there is no per-object ownership restriction yet - this
matches the spec's initial scope). This module exists so that when such a
restriction is introduced, there is exactly one place to add it, and every
resource-fetching endpoint already calls through it.

Usage pattern in a service:

    expense = await repo.get_by_id(expense_id)
    ensure_found(expense, "Expense")
    await authorize_object_access(
        user=user, resource=expense, action="view", db=db,
    )
"""
from __future__ import annotations

from typing import Any, Protocol

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser
from app.core.security.log_models import SecurityEventType
from app.core.security.log_service import SecurityLogService


class HasCreatedBy(Protocol):
    created_by: Any


def ensure_found(resource: object | None, resource_name: str) -> None:
    if resource is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"{resource_name} not found"
        )


async def authorize_object_access(
    *,
    user: CurrentUser,
    resource: object,
    action: str,
    db: AsyncSession,
    policy: "ObjectPolicy | None" = None,
) -> None:
    """
    Central object-level access check. Currently a permissive pass-through
    (function-level permission is sufficient), but every call site is
    already wired so a future policy (e.g. department scoping, ownership
    restrictions) can be dropped in here without touching route handlers.
    """
    if policy is not None:
        allowed = await policy.check(user=user, resource=resource, action=action)
        if not allowed:
            security_log = SecurityLogService(db)
            await security_log.record(
                event_type=SecurityEventType.AUTHORIZATION_FAILED,
                user_id=user.id,
                metadata={
                    "object_level": True,
                    "action": action,
                    "resource_type": type(resource).__name__,
                    "resource_id": str(getattr(resource, "id", "unknown")),
                },
            )
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this resource.",
            )


class ObjectPolicy(Protocol):
    async def check(self, *, user: CurrentUser, resource: object, action: str) -> bool: ...
