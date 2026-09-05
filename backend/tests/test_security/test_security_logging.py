"""
Security log tests: failed logins and lockouts must be recorded, and the
security log is queryable only by holders of security_logs.view.
"""
from __future__ import annotations

import pytest
from sqlalchemy import select

from tests.conftest import create_role, create_user, seed_permissions
from app.core.security.log_models import SecurityLog
from app.core.permissions.registry import SECURITY_LOGS_VIEW


@pytest.mark.asyncio
async def test_failed_login_is_recorded_in_security_log(client, db_session):
    perms = await seed_permissions(db_session)
    role = await create_role(db_session, "Owner", list(perms.keys()), perms)
    await create_user(db_session, email="owner@example.com", password="StrongPass!123", roles=[role])

    await client.post("/api/auth/login", json={"email": "owner@example.com", "password": "WrongPassword!1"})

    result = await db_session.execute(select(SecurityLog).where(SecurityLog.event_type == "login_failed"))
    entries = result.scalars().all()
    assert len(entries) >= 1


@pytest.mark.asyncio
async def test_security_log_requires_permission(client, db_session):
    perms = await seed_permissions(db_session)
    no_access_role = await create_role(db_session, "Basic", [], perms)
    viewer_role = await create_role(db_session, "Security Viewer", [SECURITY_LOGS_VIEW], perms)

    await create_user(db_session, email="basic@example.com", password="StrongPass!123", roles=[no_access_role])
    await create_user(db_session, email="secviewer@example.com", password="StrongPass!123", roles=[viewer_role])

    basic_login = await client.post(
        "/api/auth/login", json={"email": "basic@example.com", "password": "StrongPass!123"}
    )
    basic_headers = {"Authorization": f"Bearer {basic_login.json()['access_token']}"}

    denied_resp = await client.get("/api/security-logs", headers=basic_headers)
    assert denied_resp.status_code == 403

    viewer_login = await client.post(
        "/api/auth/login", json={"email": "secviewer@example.com", "password": "StrongPass!123"}
    )
    viewer_headers = {"Authorization": f"Bearer {viewer_login.json()['access_token']}"}

    allowed_resp = await client.get("/api/security-logs", headers=viewer_headers)
    assert allowed_resp.status_code == 200


@pytest.mark.asyncio
async def test_password_policy_rejects_weak_password(client, db_session):
    perms = await seed_permissions(db_session)
    role = await create_role(db_session, "Owner", list(perms.keys()), perms)
    user = await create_user(db_session, email="owner@example.com", password="StrongPass!123", roles=[role])

    login_resp = await client.post(
        "/api/auth/login", json={"email": "owner@example.com", "password": "StrongPass!123"}
    )
    headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

    response = await client.post(
        "/api/auth/password/change",
        json={"current_password": "StrongPass!123", "new_password": "weak"},
        headers=headers,
    )
    assert response.status_code == 400
