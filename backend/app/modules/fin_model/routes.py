"""Investor financial model API.

financial_model.view     -> published versions + their results (owners, investors)
financial_model.edit     -> drafts: create / edit assumptions / live preview (financial analyst)
financial_model.publish  -> freeze a draft for investors (owner)
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser
from app.core.cache import cached
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import FIN_MODEL_EDIT, FIN_MODEL_PUBLISH, FIN_MODEL_VIEW
from app.database.session import get_db
from app.modules.fin_model.calibration import calibrate
from app.modules.fin_model.defaults import default_assumptions
from app.modules.fin_model.models import FinModelVersion
from app.modules.fin_model.service import FinModelService, presentation_of, upgrade

router = APIRouter(prefix="/fin-model", tags=["financial-model"])

SCENARIO = Query(default="base", pattern="^(conservative|base|optimistic)$")


class VersionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    copy_from: uuid.UUID | None = None


class VersionUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    assumptions: dict | None = None


class Presentation(BaseModel):
    scenarios: list[str] = Field(default_factory=lambda: ["conservative", "base", "optimistic"], max_length=3)
    default_scenario: str = Field(default="base", pattern="^(conservative|base|optimistic)$")


class PreviewRequest(BaseModel):
    assumptions: dict
    scenario: str = Field(default="base", pattern="^(conservative|base|optimistic)$")


def _out(v: FinModelVersion, with_assumptions: bool = False) -> dict:
    d = {"id": str(v.id), "name": v.name, "description": v.description, "status": v.status,
         "created_at": v.created_at.isoformat() if v.created_at else None,
         "updated_at": v.updated_at.isoformat() if v.updated_at else None,
         "published_at": v.published_at.isoformat() if v.published_at else None,
         "calibration_as_of": (v.calibration or {}).get("as_of"), "presentation": presentation_of(v)}
    if with_assumptions:
        d["assumptions"] = upgrade(v.assumptions)
    return d


def _can_edit(user: CurrentUser) -> bool:
    return FIN_MODEL_EDIT in user.permissions


@router.get("/versions")
async def list_versions(user: CurrentUser = Depends(require_permission(FIN_MODEL_VIEW, FIN_MODEL_EDIT, require_all=False)),
                        db: AsyncSession = Depends(get_db)):
    svc = FinModelService(db)
    if _can_edit(user):
        await svc.ensure_default(user.id)
    return {"versions": [_out(v) for v in await svc.list(_can_edit(user))],
            "can_edit": _can_edit(user), "can_publish": FIN_MODEL_PUBLISH in user.permissions}


@router.post("/versions", status_code=201)
async def create_version(payload: VersionCreate, user: CurrentUser = Depends(require_permission(FIN_MODEL_EDIT)),
                         db: AsyncSession = Depends(get_db)):
    return _out(await FinModelService(db).create(payload.name.strip(), payload.copy_from, user.id), True)


@router.get("/versions/{version_id}")
async def get_version(version_id: uuid.UUID,
                      user: CurrentUser = Depends(require_permission(FIN_MODEL_VIEW, FIN_MODEL_EDIT, require_all=False)),
                      db: AsyncSession = Depends(get_db)):
    return _out(await FinModelService(db).get(version_id, _can_edit(user)), True)


@router.put("/versions/{version_id}")
async def update_version(version_id: uuid.UUID, payload: VersionUpdate,
                         user: CurrentUser = Depends(require_permission(FIN_MODEL_EDIT)), db: AsyncSession = Depends(get_db)):
    v = await FinModelService(db).update(version_id, payload.name, payload.description, payload.assumptions, user.id)
    return _out(v, True)


@router.post("/versions/{version_id}/publish")
async def publish_version(version_id: uuid.UUID, payload: Presentation | None = None,
                          user: CurrentUser = Depends(require_permission(FIN_MODEL_PUBLISH)),
                          db: AsyncSession = Depends(get_db)):
    return _out(await FinModelService(db).publish(version_id, user.id, payload.model_dump() if payload else None))


@router.put("/versions/{version_id}/presentation")
async def set_presentation(version_id: uuid.UUID, payload: Presentation,
                           user: CurrentUser = Depends(require_permission(FIN_MODEL_PUBLISH)),
                           db: AsyncSession = Depends(get_db)):
    return _out(await FinModelService(db).set_presentation(version_id, user.id, payload.model_dump()))


def _viewer_scenario(v: FinModelVersion, scenario: str, user: CurrentUser) -> str:
    """Viewers of a published version only get the scenarios the owner chose to show."""
    if _can_edit(user):
        return scenario
    p = presentation_of(v)
    return scenario if scenario in p["scenarios"] else p["default_scenario"]


@router.post("/versions/{version_id}/archive", status_code=204)
async def archive_version(version_id: uuid.UUID, user: CurrentUser = Depends(require_permission(FIN_MODEL_PUBLISH)),
                          db: AsyncSession = Depends(get_db)):
    await FinModelService(db).archive(version_id, user.id)


@router.get("/versions/{version_id}/history")
async def version_history(version_id: uuid.UUID, user: CurrentUser = Depends(require_permission(FIN_MODEL_EDIT)),
                          db: AsyncSession = Depends(get_db)):
    svc = FinModelService(db)
    await svc.get(version_id, True)
    return await svc.history(version_id)


@router.get("/versions/{version_id}/result")
async def version_result(version_id: uuid.UUID, scenario: str = SCENARIO,
                         user: CurrentUser = Depends(require_permission(FIN_MODEL_VIEW, FIN_MODEL_EDIT, require_all=False)),
                         db: AsyncSession = Depends(get_db)):
    svc = FinModelService(db)
    v = await svc.get(version_id, _can_edit(user))
    return await svc.result(v, _viewer_scenario(v, scenario, user))


@router.get("/versions/{version_id}/sensitivity")
async def version_sensitivity(version_id: uuid.UUID, scenario: str = SCENARIO,
                              user: CurrentUser = Depends(require_permission(FIN_MODEL_VIEW, FIN_MODEL_EDIT, require_all=False)),
                              db: AsyncSession = Depends(get_db)):
    svc = FinModelService(db)
    v = await svc.get(version_id, _can_edit(user))
    out = await svc.sensitivity(v, _viewer_scenario(v, scenario, user))
    if not _can_edit(user):
        allowed = presentation_of(v)["scenarios"]
        out = {**out, "scenarios": {k: x for k, x in out["scenarios"].items() if k in allowed}}
    return out


@router.post("/preview")
async def preview(payload: PreviewRequest, user: CurrentUser = Depends(require_permission(FIN_MODEL_EDIT)),
                  db: AsyncSession = Depends(get_db)):
    """Recalculate unsaved assumptions (live editing); nothing is stored."""
    return await FinModelService(db).preview(payload.assumptions, payload.scenario)


@router.get("/defaults")
async def defaults(user: CurrentUser = Depends(require_permission(FIN_MODEL_EDIT))):
    return default_assumptions()


@router.get("/actuals")
async def actuals(user: CurrentUser = Depends(require_permission(FIN_MODEL_VIEW, FIN_MODEL_EDIT, require_all=False)),
                  db: AsyncSession = Depends(get_db)):
    """Live operating actuals (monthly) + the calibrated values behind the auto assumptions."""
    return await cached("fm:calibration", lambda: calibrate(db), ttl=300)
