"""
RBAC / permission enforcement tests. Includes the spec-required negative
authorization test: a user without a permission must be rejected even
when they know a valid resource ID.
"""
from __future__ import annotations

import pytest

from tests.conftest import create_role, create_user, seed_permissions
from app.core.permissions.registry import (
    FINANCE_EXPENSE_VIEW,
    FINANCE_EXPENSE_CREATE,
    FINANCE_CATEGORY_VIEW,
    FINANCE_CATEGORY_CREATE,
)


async def _login(client, email, password) -> dict:
    resp = await client.post("/api/auth/login", json={"email": email, "password": password})
    return resp.json()


@pytest.mark.asyncio
async def test_user_without_permission_cannot_create_expense(client, db_session):
    perms = await seed_permissions(db_session)
    # A role with VIEW but not CREATE - intentionally narrow.
    viewer_role = await create_role(db_session, "Viewer", [FINANCE_EXPENSE_VIEW, FINANCE_CATEGORY_VIEW], perms)
    await create_user(db_session, email="viewer@example.com", password="StrongPass!123", roles=[viewer_role])

    tokens = await _login(client, "viewer@example.com", "StrongPass!123")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    response = await client.post(
        "/api/finance/expenses",
        json={
            "amount": "100.00",
            "expense_date": "2026-01-01",
            "category_id": "00000000-0000-0000-0000-000000000000",
        },
        headers=headers,
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_user_with_permission_can_create_expense(client, db_session):
    perms = await seed_permissions(db_session)
    role = await create_role(
        db_session,
        "Finance Manager",
        [FINANCE_EXPENSE_VIEW, FINANCE_EXPENSE_CREATE, FINANCE_CATEGORY_VIEW, FINANCE_CATEGORY_CREATE],
        perms,
    )
    await create_user(db_session, email="finance@example.com", password="StrongPass!123", roles=[role])

    tokens = await _login(client, "finance@example.com", "StrongPass!123")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    category_resp = await client.post(
        "/api/finance/categories", json={"name": "Marketing"}, headers=headers
    )
    assert category_resp.status_code == 201
    category_id = category_resp.json()["id"]

    expense_resp = await client.post(
        "/api/finance/expenses",
        json={"amount": "250.00", "expense_date": "2026-01-01", "category_id": category_id},
        headers=headers,
    )
    assert expense_resp.status_code == 201


@pytest.mark.asyncio
async def test_no_token_is_rejected(client):
    response = await client.get("/api/finance/expenses")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_invalid_token_is_rejected(client):
    response = await client.get(
        "/api/finance/expenses", headers={"Authorization": "Bearer not-a-real-token"}
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_known_resource_id_does_not_bypass_permission_check(client, db_session):
    """
    Negative authorization test per spec section 29: a user must NOT be
    able to access an object they lack permission for, even if the object
    ID is known and valid, and even if another user created it.
    """
    perms = await seed_permissions(db_session)
    finance_role = await create_role(
        db_session,
        "Finance Manager",
        [FINANCE_EXPENSE_VIEW, FINANCE_EXPENSE_CREATE, FINANCE_CATEGORY_VIEW, FINANCE_CATEGORY_CREATE],
        perms,
    )
    no_finance_role = await create_role(db_session, "HR Only", [], perms)

    await create_user(db_session, email="finance@example.com", password="StrongPass!123", roles=[finance_role])
    await create_user(db_session, email="hr@example.com", password="StrongPass!123", roles=[no_finance_role])

    finance_tokens = await _login(client, "finance@example.com", "StrongPass!123")
    finance_headers = {"Authorization": f"Bearer {finance_tokens['access_token']}"}

    category_resp = await client.post(
        "/api/finance/categories", json={"name": "Technology"}, headers=finance_headers
    )
    category_id = category_resp.json()["id"]

    expense_resp = await client.post(
        "/api/finance/expenses",
        json={"amount": "500.00", "expense_date": "2026-01-01", "category_id": category_id},
        headers=finance_headers,
    )
    expense_id = expense_resp.json()["id"]

    # The HR-only user knows the real expense_id but holds no finance
    # permissions at all - must be rejected outright.
    hr_tokens = await _login(client, "hr@example.com", "StrongPass!123")
    hr_headers = {"Authorization": f"Bearer {hr_tokens['access_token']}"}

    response = await client.get(f"/api/finance/expenses/{expense_id}", headers=hr_headers)
    assert response.status_code == 403
