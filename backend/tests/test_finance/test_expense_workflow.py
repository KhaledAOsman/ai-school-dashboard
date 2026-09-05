"""
Finance workflow tests: versioning, approval state machine, and the
critical rollback-must-not-delete-history guarantee (spec sections 9-10).
"""
from __future__ import annotations

import pytest

from tests.conftest import create_role, create_user, seed_permissions
from app.core.permissions.registry import SEED_PERMISSIONS


async def _login(client, email, password) -> dict:
    resp = await client.post("/api/auth/login", json={"email": email, "password": password})
    return resp.json()


async def _finance_manager_headers(client, db_session) -> dict:
    perms = await seed_permissions(db_session)
    role = await create_role(db_session, "Finance Manager", [p.code for p in SEED_PERMISSIONS], perms)
    await create_user(db_session, email="finance@example.com", password="StrongPass!123", roles=[role])
    tokens = await _login(client, "finance@example.com", "StrongPass!123")
    return {"Authorization": f"Bearer {tokens['access_token']}"}


@pytest.mark.asyncio
async def test_expense_creation_starts_at_version_1_draft(client, db_session):
    headers = await _finance_manager_headers(client, db_session)
    category_resp = await client.post("/api/finance/categories", json={"name": "Ops"}, headers=headers)
    category_id = category_resp.json()["id"]

    resp = await client.post(
        "/api/finance/expenses",
        json={"amount": "1000.00", "expense_date": "2026-01-01", "category_id": category_id},
        headers=headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "draft"
    assert body["current_version"] == 1


@pytest.mark.asyncio
async def test_update_creates_new_version_without_deleting_old_one(client, db_session):
    headers = await _finance_manager_headers(client, db_session)
    category_resp = await client.post("/api/finance/categories", json={"name": "Ops"}, headers=headers)
    category_id = category_resp.json()["id"]

    create_resp = await client.post(
        "/api/finance/expenses",
        json={"amount": "1000.00", "expense_date": "2026-01-01", "category_id": category_id},
        headers=headers,
    )
    expense_id = create_resp.json()["id"]

    update_resp = await client.patch(
        f"/api/finance/expenses/{expense_id}",
        json={"amount": "1500.00", "change_reason": "Corrected amount"},
        headers=headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["current_version"] == 2

    detail_resp = await client.get(f"/api/finance/expenses/{expense_id}", headers=headers)
    versions = detail_resp.json()["versions"]
    assert len(versions) == 2
    assert versions[0]["version_number"] == 1
    assert versions[0]["snapshot"]["amount"] == "1000.00"
    assert versions[1]["version_number"] == 2
    assert versions[1]["snapshot"]["amount"] == "1500.00"


@pytest.mark.asyncio
async def test_restore_version_creates_new_version_preserving_full_history(client, db_session):
    """
    Critical guarantee: restoring V1 after V1->V2->V3 must produce a NEW
    V4 (matching V1's values), leaving V1, V2, and V3 all intact and
    queryable - never rewriting or deleting them (spec section 10).
    """
    headers = await _finance_manager_headers(client, db_session)
    category_resp = await client.post("/api/finance/categories", json={"name": "Ops"}, headers=headers)
    category_id = category_resp.json()["id"]

    create_resp = await client.post(
        "/api/finance/expenses",
        json={"amount": "10000.00", "expense_date": "2026-01-01", "category_id": category_id},
        headers=headers,
    )
    expense_id = create_resp.json()["id"]

    await client.patch(f"/api/finance/expenses/{expense_id}", json={"amount": "15000.00"}, headers=headers)
    await client.patch(f"/api/finance/expenses/{expense_id}", json={"amount": "20000.00"}, headers=headers)

    restore_resp = await client.post(
        f"/api/finance/expenses/{expense_id}/restore",
        json={"version_number": 1, "reason": "Reverting incorrect entries"},
        headers=headers,
    )
    assert restore_resp.status_code == 200
    restored = restore_resp.json()
    assert restored["current_version"] == 4
    assert restored["amount"] == "10000.00"

    detail_resp = await client.get(f"/api/finance/expenses/{expense_id}", headers=headers)
    versions = detail_resp.json()["versions"]
    assert len(versions) == 4  # nothing was deleted
    assert versions[0]["snapshot"]["amount"] == "10000.00"
    assert versions[1]["snapshot"]["amount"] == "15000.00"
    assert versions[2]["snapshot"]["amount"] == "20000.00"
    assert versions[3]["snapshot"]["amount"] == "10000.00"
    assert versions[3]["restored_from_version"] == 1


@pytest.mark.asyncio
async def test_approval_workflow_happy_path(client, db_session):
    headers = await _finance_manager_headers(client, db_session)
    category_resp = await client.post("/api/finance/categories", json={"name": "Ops"}, headers=headers)
    category_id = category_resp.json()["id"]

    create_resp = await client.post(
        "/api/finance/expenses",
        json={"amount": "500.00", "expense_date": "2026-01-01", "category_id": category_id},
        headers=headers,
    )
    expense_id = create_resp.json()["id"]

    submit_resp = await client.post(f"/api/finance/expenses/{expense_id}/submit", headers=headers)
    assert submit_resp.json()["status"] == "pending_approval"

    approve_resp = await client.post(f"/api/finance/expenses/{expense_id}/approve", headers=headers)
    assert approve_resp.json()["status"] == "approved"
    assert approve_resp.json()["approved_by"] is not None


@pytest.mark.asyncio
async def test_invalid_transition_is_rejected(client, db_session):
    """A draft expense cannot be approved directly - must go through submit first."""
    headers = await _finance_manager_headers(client, db_session)
    category_resp = await client.post("/api/finance/categories", json={"name": "Ops"}, headers=headers)
    category_id = category_resp.json()["id"]

    create_resp = await client.post(
        "/api/finance/expenses",
        json={"amount": "500.00", "expense_date": "2026-01-01", "category_id": category_id},
        headers=headers,
    )
    expense_id = create_resp.json()["id"]

    response = await client.post(f"/api/finance/expenses/{expense_id}/approve", headers=headers)
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_rejected_expense_can_be_resubmitted(client, db_session):
    headers = await _finance_manager_headers(client, db_session)
    category_resp = await client.post("/api/finance/categories", json={"name": "Ops"}, headers=headers)
    category_id = category_resp.json()["id"]

    create_resp = await client.post(
        "/api/finance/expenses",
        json={"amount": "500.00", "expense_date": "2026-01-01", "category_id": category_id},
        headers=headers,
    )
    expense_id = create_resp.json()["id"]

    await client.post(f"/api/finance/expenses/{expense_id}/submit", headers=headers)
    reject_resp = await client.post(
        f"/api/finance/expenses/{expense_id}/reject", json={"reason": "Missing invoice"}, headers=headers
    )
    assert reject_resp.json()["status"] == "rejected"
    assert reject_resp.json()["rejection_reason"] == "Missing invoice"

    resubmit_resp = await client.post(f"/api/finance/expenses/{expense_id}/resubmit", headers=headers)
    assert resubmit_resp.json()["status"] == "draft"


@pytest.mark.asyncio
async def test_category_archive_does_not_delete_the_category(client, db_session):
    """Archiving must be soft-delete only, never physical delete (spec section 8)."""
    headers = await _finance_manager_headers(client, db_session)
    create_resp = await client.post("/api/finance/categories", json={"name": "Legacy"}, headers=headers)
    category_id = create_resp.json()["id"]

    archive_resp = await client.post(f"/api/finance/categories/{category_id}/archive", headers=headers)
    assert archive_resp.status_code == 204

    list_resp = await client.get("/api/finance/categories", params={"include_archived": True}, headers=headers)
    archived_ids = [c["id"] for c in list_resp.json()]
    assert category_id in archived_ids
