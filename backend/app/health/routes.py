"""
Health/readiness endpoints for container orchestration and load balancers.

GET /health - liveness: process is up and can respond. Never checks
             dependencies - a slow DB should not make the container restart.
GET /ready  - readiness: process AND its required dependencies (DB) are
             actually usable. Used to gate traffic (e.g. Docker healthcheck,
             a load balancer) until the app can truly serve requests.
"""
from __future__ import annotations

from fastapi import APIRouter, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from app.database.session import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/ready")
async def ready(response: Response, db: AsyncSession = Depends(get_db)) -> dict:
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "not_ready", "database": "unreachable"}
    return {"status": "ready", "database": "ok"}
