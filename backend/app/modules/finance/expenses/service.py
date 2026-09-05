"""
ExpenseService: core business logic for expenses.

Versioning contract (spec sections 9-10):
    - Every meaningful change creates a new ExpenseVersion snapshot.
    - Restoring an old version creates a NEW version copying those field
      values forward; it never deletes or rewrites history.
    - The audit trail (via AuditService) separately records who restored,
      when, which version, and the before/after state - distinct from the
      version snapshots themselves, which capture only expense field data.

Approval contract:
    - All status changes go through the centralized state machine
      (approvals/state_machine.py). No status transition happens anywhere
      else in this file without calling `transition()` first.
    - Approved expenses may still be edited (spec explicitly allows this),
      but editing never changes status and always creates a new version.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit.service import AuditService
from app.core.permissions.object_policy import authorize_object_access, ensure_found
from app.modules.finance.approvals.state_machine import (
    ExpenseStatus,
    InvalidTransitionError,
    can_transition,
    transition,
)
from app.modules.finance.budget.service import BudgetLineService
from app.modules.finance.expenses.models import Expense, ExpenseApproval, ExpenseVersion
from app.modules.finance.expenses.repository import ExpenseRepository
from app.modules.finance.expenses.schemas import (
    ExpenseCreateRequest,
    ExpenseRejectRequest,
    ExpenseUpdateRequest,
)


def _decimal_json_safe(value) -> object:
    """JSONB can't store Decimal directly; normalize to str for exact precision."""
    if isinstance(value, Decimal):
        return str(value)
    return value


def _snapshot(expense: Expense) -> dict:
    return {
        "amount": _decimal_json_safe(expense.amount),
        "currency": expense.currency,
        "expense_date": expense.expense_date.isoformat(),
        "category_id": str(expense.category_id),
        "subcategory_id": str(expense.subcategory_id) if expense.subcategory_id else None,
        "budget_line_id": str(expense.budget_line_id) if expense.budget_line_id else None,
        "staff_id": str(expense.staff_id) if expense.staff_id else None,
        "description": expense.description,
        "vendor": expense.vendor,
        "invoice_number": expense.invoice_number,
        "payment_method": expense.payment_method,
        "notes": expense.notes,
        "status": expense.status,
    }


class ExpenseService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = ExpenseRepository(db)
        self.audit = AuditService(db)
        self.budget_service = BudgetLineService(db)

    # --------------------------------------------------------------- create
    async def create(self, *, payload: ExpenseCreateRequest, user_id: uuid.UUID) -> Expense:
        if payload.budget_line_id is not None:
            # Spec requirement: a budget line must be approved by a manager
            # BEFORE any expense can be posted against it.
            await self.budget_service.assert_can_post_expense_against(payload.budget_line_id)

        expense = Expense(
            amount=payload.amount,
            currency=payload.currency,
            expense_date=payload.expense_date,
            category_id=payload.category_id,
            subcategory_id=payload.subcategory_id,
            budget_line_id=payload.budget_line_id,
            staff_id=payload.staff_id,
            description=payload.description,
            vendor=payload.vendor,
            invoice_number=payload.invoice_number,
            payment_method=payload.payment_method,
            notes=payload.notes,
            status=ExpenseStatus.DRAFT.value,
            current_version=1,
            created_by=user_id,
        )
        self.repo.add(expense)
        await self.db.flush()

        version = ExpenseVersion(
            expense_id=expense.id,
            version_number=1,
            snapshot=_snapshot(expense),
            change_reason="Initial creation",
            created_by=user_id,
        )
        self.repo.add_version(version)

        await self.audit.record(
            user_id=user_id,
            action="expense.created",
            resource_type="Expense",
            resource_id=str(expense.id),
            new_value=_snapshot(expense),
        )
        await self.db.commit()
        return expense

    async def get(self, *, expense_id: uuid.UUID) -> Expense:
        expense = await self.repo.get_by_id(expense_id)
        ensure_found(expense, "Expense")
        return expense

    async def list_filtered(self, **filters) -> list[Expense]:
        return await self.repo.list_filtered(**filters)

    # --------------------------------------------------------------- update
    async def update(
        self, *, expense_id: uuid.UUID, payload: ExpenseUpdateRequest, user_id: uuid.UUID
    ) -> Expense:
        expense = await self.repo.get_by_id(expense_id)
        ensure_found(expense, "Expense")

        if expense.status == ExpenseStatus.CANCELLED.value:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot edit a cancelled expense")

        previous_snapshot = _snapshot(expense)

        if payload.amount is not None:
            expense.amount = payload.amount
        if payload.expense_date is not None:
            expense.expense_date = payload.expense_date
        if payload.category_id is not None:
            expense.category_id = payload.category_id
        if payload.subcategory_id is not None:
            expense.subcategory_id = payload.subcategory_id
        if payload.budget_line_id is not None:
            await self.budget_service.assert_can_post_expense_against(payload.budget_line_id)
            expense.budget_line_id = payload.budget_line_id
        if payload.staff_id is not None:
            expense.staff_id = payload.staff_id
        if payload.description is not None:
            expense.description = payload.description
        if payload.vendor is not None:
            expense.vendor = payload.vendor
        if payload.invoice_number is not None:
            expense.invoice_number = payload.invoice_number
        if payload.payment_method is not None:
            expense.payment_method = payload.payment_method
        if payload.notes is not None:
            expense.notes = payload.notes

        expense.updated_by = user_id
        expense.current_version += 1

        new_snapshot = _snapshot(expense)
        version = ExpenseVersion(
            expense_id=expense.id,
            version_number=expense.current_version,
            snapshot=new_snapshot,
            change_reason=payload.change_reason or "Expense updated",
            created_by=user_id,
        )
        self.repo.add_version(version)

        await self.audit.record(
            user_id=user_id,
            action="expense.updated",
            resource_type="Expense",
            resource_id=str(expense.id),
            previous_value=previous_snapshot,
            new_value=new_snapshot,
            notes="Edited an approved expense - history preserved via version record"
            if previous_snapshot["status"] == ExpenseStatus.APPROVED.value
            else None,
        )
        await self.db.commit()
        # Re-fetch through the repository (selectinload's .versions and
        # .approval_events) rather than returning the in-memory `expense`
        # object directly - after commit(), FastAPI's response
        # serialization can raise DetachedInstanceError when it later
        # touches an attribute/relationship on an object whose identity map
        # entry SQLAlchemy no longer considers attached. Re-fetching
        # guarantees a session-bound, fully-loaded object to serialize.
        return await self.get(expense_id=expense_id)

    # ------------------------------------------------------------ workflow
    async def submit(self, *, expense_id: uuid.UUID, user_id: uuid.UUID) -> Expense:
        await self._apply_transition(
            expense_id=expense_id,
            to_status=ExpenseStatus.PENDING_APPROVAL,
            action="submit",
            user_id=user_id,
        )
        await self.db.commit()
        return await self.get(expense_id=expense_id)

    async def approve(self, *, expense_id: uuid.UUID, user_id: uuid.UUID) -> Expense:
        expense = await self._apply_transition(
            expense_id=expense_id,
            to_status=ExpenseStatus.APPROVED,
            action="approve",
            user_id=user_id,
        )
        expense.approved_by = user_id
        expense.approved_at = datetime.now(timezone.utc)
        await self.db.commit()
        return await self.get(expense_id=expense_id)

    async def reject(
        self, *, expense_id: uuid.UUID, payload: ExpenseRejectRequest, user_id: uuid.UUID
    ) -> Expense:
        expense = await self._apply_transition(
            expense_id=expense_id,
            to_status=ExpenseStatus.REJECTED,
            action="reject",
            user_id=user_id,
            reason=payload.reason,
        )
        expense.rejected_by = user_id
        expense.rejected_at = datetime.now(timezone.utc)
        expense.rejection_reason = payload.reason
        await self.db.commit()
        return await self.get(expense_id=expense_id)

    async def cancel(self, *, expense_id: uuid.UUID, user_id: uuid.UUID) -> Expense:
        await self._apply_transition(
            expense_id=expense_id,
            to_status=ExpenseStatus.CANCELLED,
            action="cancel",
            user_id=user_id,
        )
        await self.db.commit()
        return await self.get(expense_id=expense_id)

    async def resubmit(self, *, expense_id: uuid.UUID, user_id: uuid.UUID) -> Expense:
        """A rejected expense returns to Draft so the owner can rework it."""
        await self._apply_transition(
            expense_id=expense_id,
            to_status=ExpenseStatus.DRAFT,
            action="resubmit",
            user_id=user_id,
        )
        await self.db.commit()
        return await self.get(expense_id=expense_id)

    async def _apply_transition(
        self,
        *,
        expense_id: uuid.UUID,
        to_status: ExpenseStatus,
        action: str,
        user_id: uuid.UUID,
        reason: str | None = None,
    ) -> Expense:
        expense = await self.repo.get_by_id(expense_id)
        ensure_found(expense, "Expense")

        from_status = ExpenseStatus(expense.status)
        try:
            transition(from_status, to_status)
        except InvalidTransitionError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))

        expense.status = to_status.value

        event = ExpenseApproval(
            expense_id=expense.id,
            action=action,
            from_status=from_status.value,
            to_status=to_status.value,
            reason=reason,
            performed_by=user_id,
        )
        self.repo.add_approval_event(event)

        await self.audit.record(
            user_id=user_id,
            action=f"expense.{action}",
            resource_type="Expense",
            resource_id=str(expense.id),
            previous_value={"status": from_status.value},
            new_value={"status": to_status.value},
            notes=reason,
        )
        await self.db.flush()
        return expense

    # -------------------------------------------------------------- restore
    async def restore_version(
        self, *, expense_id: uuid.UUID, version_number: int, reason: str | None, user_id: uuid.UUID
    ) -> Expense:
        """
        Restore an expense to a previous version's field values.

        Critically: this does NOT delete the versions created after the one
        being restored to. It creates a brand-new version whose snapshot
        equals the target version's snapshot, so the full timeline (V1..Vn,
        then a new Vn+1 that happens to match V_target) remains intact and
        auditable.
        """
        expense = await self.repo.get_by_id(expense_id)
        ensure_found(expense, "Expense")

        target_version = await self.repo.get_version(expense_id, version_number)
        if target_version is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Version not found")

        previous_snapshot = _snapshot(expense)
        snap = target_version.snapshot

        # Restore field values only - never restore `status` from an old
        # snapshot, since status changes must go through the approval state
        # machine, not silently via rollback.
        expense.amount = Decimal(snap["amount"])
        expense.currency = snap["currency"]
        expense.expense_date = datetime.fromisoformat(snap["expense_date"]).date()
        expense.category_id = uuid.UUID(snap["category_id"])
        expense.subcategory_id = uuid.UUID(snap["subcategory_id"]) if snap["subcategory_id"] else None
        expense.description = snap["description"]
        expense.vendor = snap["vendor"]
        expense.invoice_number = snap["invoice_number"]
        expense.payment_method = snap["payment_method"]
        expense.notes = snap["notes"]
        expense.updated_by = user_id
        expense.current_version += 1

        new_snapshot = _snapshot(expense)
        new_version = ExpenseVersion(
            expense_id=expense.id,
            version_number=expense.current_version,
            snapshot=new_snapshot,
            change_reason=reason or f"Restored to version {version_number}",
            restored_from_version=version_number,
            created_by=user_id,
        )
        self.repo.add_version(new_version)

        await self.audit.record(
            user_id=user_id,
            action="expense.version_restored",
            resource_type="Expense",
            resource_id=str(expense.id),
            previous_value=previous_snapshot,
            new_value=new_snapshot,
            metadata={"restored_from_version": version_number, "new_version": expense.current_version},
            notes=reason,
        )
        await self.db.commit()
        return await self.get(expense_id=expense_id)

    # ---------------------------------------------------------------- soft-delete/archive
    async def archive(self, *, expense_id: uuid.UUID, user_id: uuid.UUID) -> None:
        expense = await self.repo.get_by_id(expense_id)
        ensure_found(expense, "Expense")

        expense.is_archived = True
        await self.audit.record(
            user_id=user_id,
            action="expense.archived",
            resource_type="Expense",
            resource_id=str(expense.id),
        )
        await self.db.commit()
