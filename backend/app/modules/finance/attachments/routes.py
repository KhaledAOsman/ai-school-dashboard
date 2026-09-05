from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import (
    FINANCE_ATTACHMENT_DELETE,
    FINANCE_ATTACHMENT_DOWNLOAD,
    FINANCE_ATTACHMENT_UPLOAD,
)
from app.database.session import get_db
from app.modules.finance.attachments.schemas import AttachmentResponse
from app.modules.finance.attachments.service import AttachmentService

router = APIRouter(prefix="/finance/expenses/{expense_id}/attachments", tags=["finance-attachments"])


@router.get("", response_model=list[AttachmentResponse])
async def list_attachments(
    expense_id: uuid.UUID,
    user: CurrentUser = Depends(require_permission(FINANCE_ATTACHMENT_DOWNLOAD)),
    db: AsyncSession = Depends(get_db),
):
    service = AttachmentService(db)
    return await service.list_for_expense(expense_id)


@router.post("", response_model=AttachmentResponse, status_code=201)
async def upload_attachment(
    expense_id: uuid.UUID,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_permission(FINANCE_ATTACHMENT_UPLOAD)),
    db: AsyncSession = Depends(get_db),
):
    service = AttachmentService(db)
    return await service.upload(expense_id=expense_id, file=file, user_id=user.id)


@router.get("/{attachment_id}")
async def download_attachment(
    expense_id: uuid.UUID,
    attachment_id: uuid.UUID,
    user: CurrentUser = Depends(require_permission(FINANCE_ATTACHMENT_DOWNLOAD)),
    db: AsyncSession = Depends(get_db),
):
    """
    Authenticated file download. This is the ONLY way to retrieve attachment
    bytes - there is no static/public URL for uploaded files (spec section 12).
    """
    service = AttachmentService(db)
    content, attachment = await service.download(attachment_id=attachment_id, user_id=user.id)
    return Response(
        content=content,
        media_type=attachment.content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{attachment.original_filename}"'
        },
    )


@router.delete("/{attachment_id}", status_code=204)
async def delete_attachment(
    expense_id: uuid.UUID,
    attachment_id: uuid.UUID,
    user: CurrentUser = Depends(require_permission(FINANCE_ATTACHMENT_DELETE)),
    db: AsyncSession = Depends(get_db),
):
    service = AttachmentService(db)
    await service.delete(attachment_id=attachment_id, user_id=user.id)
