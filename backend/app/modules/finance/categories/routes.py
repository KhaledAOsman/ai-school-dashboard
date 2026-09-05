from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import (
    FINANCE_CATEGORY_CREATE,
    FINANCE_CATEGORY_DELETE,
    FINANCE_CATEGORY_UPDATE,
    FINANCE_CATEGORY_VIEW,
)
from app.database.session import get_db
from app.modules.finance.categories.schemas import (
    CategoryCreateRequest,
    CategoryResponse,
    CategoryTreeNode,
    CategoryUpdateRequest,
)
from app.modules.finance.categories.service import CategoryService

router = APIRouter(prefix="/finance/categories", tags=["finance-categories"])


@router.get("", response_model=list[CategoryTreeNode])
async def list_categories(
    include_archived: bool = False,
    user: CurrentUser = Depends(require_permission(FINANCE_CATEGORY_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    service = CategoryService(db)
    return await service.get_tree(include_archived=include_archived)


@router.post("", response_model=CategoryResponse, status_code=201)
async def create_category(
    payload: CategoryCreateRequest,
    user: CurrentUser = Depends(require_permission(FINANCE_CATEGORY_CREATE)),
    db: AsyncSession = Depends(get_db),
):
    service = CategoryService(db)
    return await service.create(payload=payload, user_id=user.id)


@router.patch("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: uuid.UUID,
    payload: CategoryUpdateRequest,
    user: CurrentUser = Depends(require_permission(FINANCE_CATEGORY_UPDATE)),
    db: AsyncSession = Depends(get_db),
):
    service = CategoryService(db)
    return await service.update(category_id=category_id, payload=payload, user_id=user.id)


@router.post("/{category_id}/archive", status_code=204)
async def archive_category(
    category_id: uuid.UUID,
    user: CurrentUser = Depends(require_permission(FINANCE_CATEGORY_DELETE)),
    db: AsyncSession = Depends(get_db),
):
    service = CategoryService(db)
    await service.archive(category_id=category_id, user_id=user.id)
