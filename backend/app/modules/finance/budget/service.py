"""
BudgetLineService: create/update/submit/approve/reject a budget line, and
compute actual-vs-budget spend.

Approval gate (spec requirement): an expense may only reference a budget
line once that line's status is APPROVED. This is enforced here via
`assert_can_post_expense_against`, called from ExpenseService.create()/
update() whenever a payload includes a budget_line_id.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit.service import AuditService
from app.core.permissions.object_policy import ensure_found
from app.modules.finance.budget.models import BudgetLine, BudgetLineApproval
from app.modules.finance.budget.repository import BudgetLineRepository
from app.modules.finance.budget.schemas import (
    BudgetLineCreateRequest,
    BudgetLineRejectRequest,
    BudgetLineUpdateRequest,
)
from app.modules.finance.budget.state_machine import (
    BudgetLineStatus,
    InvalidBudgetTransitionError,
    transition,
)
from app.modules.finance.categories.repository import CategoryRepository


class BudgetLineService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = BudgetLineRepository(db)
        self.category_repo = CategoryRepository(db)
        self.audit = AuditService(db)

    async def _resolve_categories(self, category_ids: list[uuid.UUID]) -> list:
        categories = []
        for cid in category_ids:
            category = await self.category_repo.get_by_id(cid)
            if category is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, f"Category {cid} not found")
            categories.append(category)
        return categories

    async def create(self, *, payload: BudgetLineCreateRequest, user_id: uuid.UUID) -> BudgetLine:
        categories = await self._resolve_categories(payload.category_ids)

        budget_line = BudgetLine(
            name=payload.name,
            description=payload.description,
            kind=payload.kind,
            period=payload.period,
            budgeted_amount=payload.budgeted_amount,
            currency=payload.currency,
            period_start=payload.period_start,
            period_end=payload.period_end,
            status=BudgetLineStatus.DRAFT.value,
            created_by=user_id,
            categories=categories,
        )
        self.repo.add(budget_line)
        await self.db.flush()

        await self.audit.record(
            user_id=user_id,
            action="budget_line.created",
            resource_type="BudgetLine",
            resource_id=str(budget_line.id),
            new_value={"name": budget_line.name, "budgeted_amount": str(budget_line.budgeted_amount)},
        )
        await self.db.commit()
        return await self.repo.get_by_id(budget_line.id)

    async def update(
        self, *, budget_line_id: uuid.UUID, payload: BudgetLineUpdateRequest, user_id: uuid.UUID
    ) -> BudgetLine:
        """
        Updates a budget line's fields, including its budgeted_amount,
        regardless of current status (draft/pending/approved/rejected).
        This is intentional: a manager may need to correct or adjust an
        already-approved line's amount without going through archive +
        recreate. Every change is captured in the audit log with the exact
        before/after values so the change is fully traceable.
        """
        budget_line = await self.repo.get_by_id(budget_line_id)
        ensure_found(budget_line, "Budget line")

        previous_snapshot = {
            "name": budget_line.name,
            "description": budget_line.description,
            "kind": budget_line.kind,
            "period": budget_line.period,
            "budgeted_amount": str(budget_line.budgeted_amount),
            "period_start": str(budget_line.period_start) if budget_line.period_start else None,
            "period_end": str(budget_line.period_end) if budget_line.period_end else None,
        }

        if payload.name is not None:
            budget_line.name = payload.name
        if payload.description is not None:
            budget_line.description = payload.description
        if payload.kind is not None:
            budget_line.kind = payload.kind
        if payload.period is not None:
            budget_line.period = payload.period
        if payload.budgeted_amount is not None:
            budget_line.budgeted_amount = payload.budgeted_amount
        if payload.period_start is not None:
            budget_line.period_start = payload.period_start
        if payload.period_end is not None:
            budget_line.period_end = payload.period_end
        if payload.category_ids is not None:
            budget_line.categories = await self._resolve_categories(payload.category_ids)

        new_snapshot = {
            "name": budget_line.name,
            "description": budget_line.description,
            "kind": budget_line.kind,
            "period": budget_line.period,
            "budgeted_amount": str(budget_line.budgeted_amount),
            "period_start": str(budget_line.period_start) if budget_line.period_start else None,
            "period_end": str(budget_line.period_end) if budget_line.period_end else None,
        }

        notes = None
        if previous_snapshot["budgeted_amount"] != new_snapshot["budgeted_amount"]:
            notes = (
                f"Budgeted amount changed from {previous_snapshot['budgeted_amount']} "
                f"to {new_snapshot['budgeted_amount']} (status at time of edit: {budget_line.status})"
            )

        await self.audit.record(
            user_id=user_id,
            action="budget_line.updated",
            resource_type="BudgetLine",
            resource_id=str(budget_line.id),
            previous_value=previous_snapshot,
            new_value=new_snapshot,
            notes=notes,
        )
        await self.db.commit()
        return await self.repo.get_by_id(budget_line_id)

    async def get(self, *, budget_line_id: uuid.UUID) -> BudgetLine:
        budget_line = await self.repo.get_by_id(budget_line_id)
        ensure_found(budget_line, "Budget line")
        return budget_line

    async def list_all(self, **filters) -> list[BudgetLine]:
        return await self.repo.list_all(**filters)

    async def spend_summary(self, budget_line: BudgetLine) -> dict:
        spent = await self.repo.spent_amount_for(budget_line.id)
        budgeted = float(budget_line.budgeted_amount)
        remaining = budgeted - spent
        pct = (spent / budgeted * 100) if budgeted > 0 else 0.0
        return {"spent_amount": spent, "remaining_amount": remaining, "spent_pct": round(pct, 1)}

    async def _apply_transition(
        self,
        *,
        budget_line_id: uuid.UUID,
        to_status: BudgetLineStatus,
        action: str,
        user_id: uuid.UUID,
        reason: str | None = None,
    ) -> BudgetLine:
        budget_line = await self.repo.get_by_id(budget_line_id)
        ensure_found(budget_line, "Budget line")

        from_status = BudgetLineStatus(budget_line.status)
        try:
            transition(from_status, to_status)
        except InvalidBudgetTransitionError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))

        budget_line.status = to_status.value

        event = BudgetLineApproval(
            budget_line_id=budget_line.id,
            action=action,
            from_status=from_status.value,
            to_status=to_status.value,
            reason=reason,
            performed_by=user_id,
        )
        self.repo.add_approval_event(event)

        await self.audit.record(
            user_id=user_id,
            action=f"budget_line.{action}",
            resource_type="BudgetLine",
            resource_id=str(budget_line.id),
            previous_value={"status": from_status.value},
            new_value={"status": to_status.value},
            notes=reason,
        )
        await self.db.flush()
        return budget_line

    async def submit(self, *, budget_line_id: uuid.UUID, user_id: uuid.UUID) -> BudgetLine:
        await self._apply_transition(
            budget_line_id=budget_line_id, to_status=BudgetLineStatus.PENDING_APPROVAL, action="submit", user_id=user_id
        )
        await self.db.commit()
        return await self.repo.get_by_id(budget_line_id)

    async def approve(self, *, budget_line_id: uuid.UUID, user_id: uuid.UUID) -> BudgetLine:
        budget_line = await self._apply_transition(
            budget_line_id=budget_line_id, to_status=BudgetLineStatus.APPROVED, action="approve", user_id=user_id
        )
        budget_line.approved_by = user_id
        budget_line.approved_at = datetime.now(timezone.utc)
        await self.db.commit()
        return await self.repo.get_by_id(budget_line_id)

    async def reject(
        self, *, budget_line_id: uuid.UUID, payload: BudgetLineRejectRequest, user_id: uuid.UUID
    ) -> BudgetLine:
        budget_line = await self._apply_transition(
            budget_line_id=budget_line_id,
            to_status=BudgetLineStatus.REJECTED,
            action="reject",
            user_id=user_id,
            reason=payload.reason,
        )
        budget_line.rejected_by = user_id
        budget_line.rejected_at = datetime.now(timezone.utc)
        budget_line.rejection_reason = payload.reason
        await self.db.commit()
        return await self.repo.get_by_id(budget_line_id)

    async def archive(self, *, budget_line_id: uuid.UUID, user_id: uuid.UUID) -> BudgetLine:
        await self._apply_transition(
            budget_line_id=budget_line_id, to_status=BudgetLineStatus.ARCHIVED, action="archive", user_id=user_id
        )
        await self.db.commit()
        return await self.repo.get_by_id(budget_line_id)

    async def assert_can_post_expense_against(self, budget_line_id: uuid.UUID) -> None:
        """
        Called from ExpenseService whenever an expense payload references a
        budget_line_id. Enforces the spec requirement: a General Manager
        must approve the LINE before any expense can be posted against it.
        """
        budget_line = await self.repo.get_by_id(budget_line_id)
        ensure_found(budget_line, "Budget line")
        if budget_line.status != BudgetLineStatus.APPROVED.value:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Budget line '{budget_line.name}' is not approved yet (status: {budget_line.status}). "
                "It must be approved by a manager before expenses can be posted against it.",
            )
