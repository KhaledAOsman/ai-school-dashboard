"""
require_permission(...) - the single reusable authorization dependency.

Usage in a route:

    @router.post("/expenses", dependencies=[Depends(require_permission("finance.expense.create"))])
    async def create_expense(...): ...

Or, to also get the CurrentUser object:

    async def create_expense(
        user: CurrentUser = Depends(require_permission("finance.expense.create")),
    ): ...

IMPORTANT: this only checks *function-level* authorization (does this user
have this permission at all). It does NOT check *object-level* authorization
(can this user access THIS SPECIFIC expense). Object-level checks must be
performed separately inside the service layer for any endpoint that takes
a resource ID - see modules/finance/expenses/service.py for the pattern,
and core/permissions/object_policy.py for the reusable policy hook.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser, get_current_user
from app.core.security.log_models import SecurityEventType
from app.core.security.log_service import SecurityLogService
from app.database.session import get_db


def require_permission(*required_permissions: str, require_all: bool = True):
    """
    Returns a FastAPI dependency that ensures the current user holds the
    given permission(s).

    require_all=True  -> user must have ALL listed permissions (default)
    require_all=False -> user must have AT LEAST ONE of the listed permissions
    """

    async def _dependency(
        request: Request,
        user: CurrentUser = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> CurrentUser:
        if require_all:
            authorized = all(p in user.permissions for p in required_permissions)
        else:
            authorized = any(p in user.permissions for p in required_permissions)

        if not authorized:
            security_log = SecurityLogService(db)
            await security_log.record(
                event_type=SecurityEventType.AUTHORIZATION_FAILED,
                user_id=user.id,
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
                metadata={
                    "required_permissions": list(required_permissions),
                    "path": request.url.path,
                    "method": request.method,
                },
            )
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action.",
            )
        return user

    return _dependency
