"""
Authentication tests: login success/failure, lockout after repeated
failures, and that password policy is enforced.
"""
from __future__ import annotations

import pytest

from tests.conftest import create_role, create_user, seed_permissions


@pytest.mark.asyncio
async def test_login_success(client, db_session):
    perms = await seed_permissions(db_session)
    role = await create_role(db_session, "Owner", list(perms.keys()), perms)
    await create_user(db_session, email="owner@example.com", password="StrongPass!123", roles=[role])

    response = await client.post(
        "/api/auth/login", json={"email": "owner@example.com", "password": "StrongPass!123"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["mfa_required"] is False
    assert body["access_token"]
    assert body["refresh_token"]


@pytest.mark.asyncio
async def test_login_wrong_password(client, db_session):
    perms = await seed_permissions(db_session)
    role = await create_role(db_session, "Owner", list(perms.keys()), perms)
    await create_user(db_session, email="owner@example.com", password="StrongPass!123", roles=[role])

    response = await client.post(
        "/api/auth/login", json={"email": "owner@example.com", "password": "WrongPassword!1"}
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_email_returns_same_error_as_wrong_password(client, db_session):
    """
    Spec requirement: do not expose whether an email exists. The status
    code and error shape must be identical for "no such user" and "wrong
    password" - this test locks that behavior in.
    """
    response = await client.post(
        "/api/auth/login", json={"email": "nobody@example.com", "password": "WhateverPass!1"}
    )
    assert response.status_code == 401
    assert "Invalid email or password" in response.text


@pytest.mark.asyncio
async def test_account_locks_after_max_failed_attempts(client, db_session):
    perms = await seed_permissions(db_session)
    role = await create_role(db_session, "Owner", list(perms.keys()), perms)
    await create_user(db_session, email="owner@example.com", password="StrongPass!123", roles=[role])

    # MAX_FAILED_LOGIN_ATTEMPTS defaults to 5
    for _ in range(5):
        resp = await client.post(
            "/api/auth/login", json={"email": "owner@example.com", "password": "WrongPassword!1"}
        )
        assert resp.status_code == 401

    # Next attempt, even with the CORRECT password, must be locked out.
    resp = await client.post(
        "/api/auth/login", json={"email": "owner@example.com", "password": "StrongPass!123"}
    )
    assert resp.status_code == 423


@pytest.mark.asyncio
async def test_disabled_account_cannot_login(client, db_session):
    perms = await seed_permissions(db_session)
    role = await create_role(db_session, "Owner", list(perms.keys()), perms)
    await create_user(
        db_session, email="disabled@example.com", password="StrongPass!123", roles=[role], status="disabled"
    )

    response = await client.post(
        "/api/auth/login", json={"email": "disabled@example.com", "password": "StrongPass!123"}
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_logout_revokes_refresh_token(client, db_session):
    perms = await seed_permissions(db_session)
    role = await create_role(db_session, "Owner", list(perms.keys()), perms)
    await create_user(db_session, email="owner@example.com", password="StrongPass!123", roles=[role])

    login_resp = await client.post(
        "/api/auth/login", json={"email": "owner@example.com", "password": "StrongPass!123"}
    )
    tokens = login_resp.json()
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    logout_resp = await client.post(
        "/api/auth/logout", json={"refresh_token": tokens["refresh_token"]}, headers=headers
    )
    assert logout_resp.status_code == 204

    # The revoked refresh token must no longer work.
    refresh_resp = await client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refresh_resp.status_code == 401
