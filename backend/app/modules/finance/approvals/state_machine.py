"""
Centralized expense status state machine.

All status transitions MUST go through can_transition()/transition() here.
Do not duplicate "is this transition allowed" logic anywhere else in the
codebase - route handlers and services should call into this module and
treat it as the single authority for valid state changes.
"""
from __future__ import annotations

from enum import Enum


class ExpenseStatus(str, Enum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class InvalidTransitionError(Exception):
    def __init__(self, from_status: str, to_status: str):
        self.from_status = from_status
        self.to_status = to_status
        super().__init__(f"Cannot transition expense from '{from_status}' to '{to_status}'")


# Adjacency list of allowed transitions.
_ALLOWED_TRANSITIONS: dict[ExpenseStatus, set[ExpenseStatus]] = {
    ExpenseStatus.DRAFT: {ExpenseStatus.PENDING_APPROVAL, ExpenseStatus.CANCELLED},
    ExpenseStatus.PENDING_APPROVAL: {
        ExpenseStatus.APPROVED,
        ExpenseStatus.REJECTED,
        ExpenseStatus.CANCELLED,
    },
    ExpenseStatus.APPROVED: {
        # Approved expenses may be edited (spec section 9), which creates a
        # new version but does NOT change status. Only cancellation moves
        # it further, e.g. if an approved expense must be voided later.
        ExpenseStatus.CANCELLED,
    },
    ExpenseStatus.REJECTED: {
        # A rejected expense can be reworked and resubmitted.
        ExpenseStatus.DRAFT,
    },
    ExpenseStatus.CANCELLED: set(),  # terminal
}


def can_transition(from_status: ExpenseStatus, to_status: ExpenseStatus) -> bool:
    return to_status in _ALLOWED_TRANSITIONS.get(from_status, set())


def transition(from_status: ExpenseStatus, to_status: ExpenseStatus) -> ExpenseStatus:
    if not can_transition(from_status, to_status):
        raise InvalidTransitionError(from_status.value, to_status.value)
    return to_status
