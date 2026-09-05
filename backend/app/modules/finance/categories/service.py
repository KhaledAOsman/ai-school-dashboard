"""
Category service. Categories are archived (soft-deleted), never physically
deleted, because deleting a category that historical expenses reference
would corrupt financial history (spec section 8).
"""
from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit.service import AuditService
from app.modules.finance.categories.models import ExpenseCategory
from app.modules.finance.categories.repository import CategoryRepository
from app.modules.finance.categories.schemas import (
    CategoryCreateRequest,
    CategoryTreeNode,
    CategoryUpdateRequest,
)
from app.modules.finance.expenses.models import Expense


class CategoryService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = CategoryRepository(db)
        self.audit = AuditService(db)

    async def create(
        self, *, payload: CategoryCreateRequest, user_id: uuid.UUID
    ) -> ExpenseCategory:
        if payload.parent_id:
            parent = await self.repo.get_by_id(payload.parent_id)
            if parent is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Parent category not found")

        category = ExpenseCategory(
            name=payload.name,
            name_ar=payload.name_ar,
            parent_id=payload.parent_id,
            display_order=payload.display_order,
            created_by=user_id,
        )
        self.repo.add(category)
        await self.db.flush()

        await self.audit.record(
            user_id=user_id,
            action="category.created",
            resource_type="ExpenseCategory",
            resource_id=str(category.id),
            new_value={"name": category.name, "parent_id": str(payload.parent_id) if payload.parent_id else None},
        )
        await self.db.commit()
        return category

    async def update(
        self, *, category_id: uuid.UUID, payload: CategoryUpdateRequest, user_id: uuid.UUID
    ) -> ExpenseCategory:
        category = await self.repo.get_by_id(category_id)
        if category is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")

        previous = {"name": category.name, "name_ar": category.name_ar, "display_order": category.display_order}

        if payload.name is not None:
            category.name = payload.name
        if payload.name_ar is not None:
            category.name_ar = payload.name_ar
        if payload.display_order is not None:
            category.display_order = payload.display_order

        await self.audit.record(
            user_id=user_id,
            action="category.updated",
            resource_type="ExpenseCategory",
            resource_id=str(category.id),
            previous_value=previous,
            new_value={"name": category.name, "name_ar": category.name_ar, "display_order": category.display_order},
        )
        await self.db.commit()
        return category

    async def archive(self, *, category_id: uuid.UUID, user_id: uuid.UUID) -> None:
        category = await self.repo.get_by_id(category_id)
        if category is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")

        # Safety: physically deleting would break historical expense records.
        # We never allow that. Archiving hides it from active-selection lists
        # but the row and all foreign key references remain valid.
        category.is_archived = True

        await self.audit.record(
            user_id=user_id,
            action="category.archived",
            resource_type="ExpenseCategory",
            resource_id=str(category.id),
        )
        await self.db.commit()

    async def get_tree(self, *, include_archived: bool = False) -> list[CategoryTreeNode]:
        categories = await self.repo.list_all(include_archived=include_archived)

        # Build each node from plain field values only - never pass the
        # SQLAlchemy ORM object straight to CategoryTreeNode.model_validate().
        # CategoryTreeNode declares a `children` field, and if Pydantic sees
        # the ORM object it will try to read `c.children` too (the ORM's own
        # self-referencing relationship of the same name), which triggers an
        # implicit lazy-load outside of any awaited context and raises
        # MissingGreenlet under the async engine. Constructing explicitly
        # avoids ever touching that ORM relationship attribute.
        by_id: dict[uuid.UUID, CategoryTreeNode] = {
            c.id: CategoryTreeNode(
                id=c.id,
                name=c.name,
                name_ar=c.name_ar,
                parent_id=c.parent_id,
                display_order=c.display_order,
                is_archived=c.is_archived,
                created_at=c.created_at,
                children=[],
            )
            for c in categories
        }
        roots: list[CategoryTreeNode] = []

        for cat in categories:
            node = by_id[cat.id]
            if cat.parent_id and cat.parent_id in by_id:
                by_id[cat.parent_id].children.append(node)
            else:
                roots.append(node)
        return roots
