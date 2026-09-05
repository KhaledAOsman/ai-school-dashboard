"""
Hierarchical expense categories with soft-delete (archive), not hard delete.

Self-referencing parent_id allows arbitrary depth, though the initial UI
only needs 2 levels (category -> subcategory). display_order supports
manual reordering within a parent.
"""
from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ExpenseCategory(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "expense_categories"

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    name_ar: Mapped[str | None] = mapped_column(String(150), nullable=True)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("expense_categories.id", ondelete="RESTRICT"), nullable=True
    )
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    children: Mapped[list["ExpenseCategory"]] = relationship(
        "ExpenseCategory", backref="parent", remote_side="ExpenseCategory.id"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<ExpenseCategory {self.name}>"
