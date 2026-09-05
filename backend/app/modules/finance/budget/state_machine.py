"""
Budget line item state machine - separate from, and layered above, the
per-expense approval state machine (approvals/state_machine.py).

A budget line represents a recurring or one-off allocation (e.g. "Instructor
Salaries", "Software Subscriptions", "Q1 Marketing Campaign") that a General
Manager must approve BEFORE any expense can be posted against it. Once
approved, individual expenses still go through their own normal
draft -> pending_approval -> approved workflow, but the line's approval is
a separate gate that unlocks posting in the first place.
"""
from __future__ import annotations

from enum import Enum


class BudgetLineStatus(str, Enum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    ARCHIVED = "archived"


class InvalidBudgetTransitionError(Exception):
    def __init__(self, from_status: str, to_status: str):
        self.from_status = from_status
        self.to_status = to_status
        super().__init__(f"Cannot transition budget line from '{from_status}' to '{to_status}'")


_ALLOWED_TRANSITIONS: dict[BudgetLineStatus, set[BudgetLineStatus]] = {
    BudgetLineStatus.DRAFT: {BudgetLineStatus.PENDING_APPROVAL, BudgetLineStatus.ARCHIVED},
    BudgetLineStatus.PENDING_APPROVAL: {
        BudgetLineStatus.APPROVED,
        BudgetLineStatus.REJECTED,
        BudgetLineStatus.ARCHIVED,
    },
    BudgetLineStatus.APPROVED: {BudgetLineStatus.ARCHIVED},
    BudgetLineStatus.REJECTED: {BudgetLineStatus.DRAFT},
    BudgetLineStatus.ARCHIVED: set(),
}


def can_transition(from_status: BudgetLineStatus, to_status: BudgetLineStatus) -> bool:
    return to_status in _ALLOWED_TRANSITIONS.get(from_status, set())


def transition(from_status: BudgetLineStatus, to_status: BudgetLineStatus) -> BudgetLineStatus:
    if not can_transition(from_status, to_status):
        raise InvalidBudgetTransitionError(from_status.value, to_status.value)
    return to_status
