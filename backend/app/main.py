"""
Application entrypoint: wires together all routers, middleware, and startup
logic. Run with: uvicorn app.main:app

Keep this file thin - it should only compose things defined elsewhere
(routers, middleware, settings). Business logic never lives here.
"""
from __future__ import annotations

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.auth.routes import router as auth_router
from app.core.audit.routes import router as audit_router
from app.core.dashboards.routes import router as dashboards_router
from app.core.notifications.routes import router as notifications_router
from app.core.permissions.routes import router as permissions_router
from app.core.roles.routes import router as roles_router
from app.core.security.routes import router as security_logs_router
from app.core.settings.config import get_settings
from app.core.users.routes import router as users_router
from app.health.routes import router as health_router
from app.middleware.error_handlers import register_exception_handlers
from app.middleware.rate_limit import limiter
from app.middleware.security import RequestContextMiddleware, SecurityHeadersMiddleware
from app.modules.finance.attachments.routes import router as finance_attachments_router
from app.modules.finance.budget.routes import router as finance_budget_router
from app.modules.finance.categories.routes import router as finance_categories_router
from app.modules.finance.expenses.routes import router as finance_expenses_router
from app.modules.finance.reports.routes import router as finance_reports_router
from app.modules.finance.staff.routes import router as finance_staff_router

settings = get_settings()

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer(),
    ],
)

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    docs_url="/api/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if settings.ENVIRONMENT != "production" else None,
)

# ---- Rate limiting ----
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ---- CORS: strict allowlist from settings, never a wildcard in production ----
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)

# ---- Security headers + request logging (order matters: outermost first) ----
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestContextMiddleware)

# ---- Centralized error handling ----
register_exception_handlers(app)

# ---- Routers ----
app.include_router(health_router)  # no /api prefix - orchestrators expect /health, /ready at root

API_PREFIX = settings.API_V1_PREFIX
app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(users_router, prefix=API_PREFIX)
app.include_router(roles_router, prefix=API_PREFIX)
app.include_router(permissions_router, prefix=API_PREFIX)
app.include_router(dashboards_router, prefix=API_PREFIX)
app.include_router(notifications_router, prefix=API_PREFIX)
app.include_router(audit_router, prefix=API_PREFIX)
app.include_router(security_logs_router, prefix=API_PREFIX)
app.include_router(finance_expenses_router, prefix=API_PREFIX)
app.include_router(finance_categories_router, prefix=API_PREFIX)
app.include_router(finance_attachments_router, prefix=API_PREFIX)
app.include_router(finance_reports_router, prefix=API_PREFIX)
app.include_router(finance_budget_router, prefix=API_PREFIX)
app.include_router(finance_staff_router, prefix=API_PREFIX)


@app.get("/", include_in_schema=False)
async def root():
    return {"service": settings.APP_NAME, "status": "running"}
