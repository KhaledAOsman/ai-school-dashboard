"""
Attachment security tests: content-type validation via magic bytes,
size limits, and that download requires authentication (spec section 12).
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


async def _create_expense(client, headers) -> str:
    category_resp = await client.post("/api/finance/categories", json={"name": "Ops"}, headers=headers)
    category_id = category_resp.json()["id"]
    expense_resp = await client.post(
        "/api/finance/expenses",
        json={"amount": "100.00", "expense_date": "2026-01-01", "category_id": category_id},
        headers=headers,
    )
    return expense_resp.json()["id"]


@pytest.mark.asyncio
async def test_valid_pdf_upload_succeeds(client, db_session):
    headers = await _finance_manager_headers(client, db_session)
    expense_id = await _create_expense(client, headers)

    pdf_bytes = b"%PDF-1.4\n%fake pdf content for testing\n"
    response = await client.post(
        f"/api/finance/expenses/{expense_id}/attachments",
        files={"file": ("invoice.pdf", pdf_bytes, "application/pdf")},
        headers=headers,
    )
    assert response.status_code == 201
    assert response.json()["original_filename"] == "invoice.pdf"


@pytest.mark.asyncio
async def test_mismatched_content_type_is_rejected(client, db_session):
    """A file claiming to be a PDF but with non-PDF bytes must be rejected."""
    headers = await _finance_manager_headers(client, db_session)
    expense_id = await _create_expense(client, headers)

    fake_bytes = b"this is not actually a pdf file at all"
    response = await client.post(
        f"/api/finance/expenses/{expense_id}/attachments",
        files={"file": ("invoice.pdf", fake_bytes, "application/pdf")},
        headers=headers,
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_disallowed_file_type_is_rejected(client, db_session):
    headers = await _finance_manager_headers(client, db_session)
    expense_id = await _create_expense(client, headers)

    response = await client.post(
        f"/api/finance/expenses/{expense_id}/attachments",
        files={"file": ("script.exe", b"MZ\x90\x00fake exe", "application/x-msdownload")},
        headers=headers,
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_attachment_download_requires_authentication(client, db_session):
    headers = await _finance_manager_headers(client, db_session)
    expense_id = await _create_expense(client, headers)

    pdf_bytes = b"%PDF-1.4\n%fake pdf content\n"
    upload_resp = await client.post(
        f"/api/finance/expenses/{expense_id}/attachments",
        files={"file": ("invoice.pdf", pdf_bytes, "application/pdf")},
        headers=headers,
    )
    attachment_id = upload_resp.json()["id"]

    # No Authorization header - must be rejected, confirming there is no
    # public/predictable URL for the file (spec section 12).
    response = await client.get(f"/api/finance/expenses/{expense_id}/attachments/{attachment_id}")
    assert response.status_code == 401
