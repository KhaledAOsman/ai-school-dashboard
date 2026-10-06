from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import CurrentUser
from app.core.permissions.dependencies import require_permission
from app.core.permissions.registry import (
    CAMPAIGNS_MANAGE,
    CAMPAIGNS_VIEW,
    SUBSCRIPTIONS_MANAGE,
    SUBSCRIPTIONS_VIEW,
)
from app.database.session import get_db
from app.modules.marketing.schemas import (
    CampaignCreateRequest,
    CampaignListResponse,
    CampaignResponse,
    CampaignUpdateRequest,
    SubscriptionCreateRequest,
    SubscriptionListResponse,
    SubscriptionResponse,
    SubscriptionUpdateRequest,
)
from app.modules.marketing.service import CampaignService, SubscriptionService

subscriptions_router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])
campaigns_router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@subscriptions_router.get("", response_model=SubscriptionListResponse)
async def list_subscriptions(
    user: CurrentUser = Depends(require_permission(SUBSCRIPTIONS_VIEW)), db: AsyncSession = Depends(get_db)
):
    return await SubscriptionService(db).list()


@subscriptions_router.post("", response_model=SubscriptionResponse, status_code=201)
async def create_subscription(
    payload: SubscriptionCreateRequest,
    user: CurrentUser = Depends(require_permission(SUBSCRIPTIONS_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    return await SubscriptionService(db).create(payload, user.id)


@subscriptions_router.patch("/{sub_id}", response_model=SubscriptionResponse)
async def update_subscription(
    sub_id: uuid.UUID,
    payload: SubscriptionUpdateRequest,
    user: CurrentUser = Depends(require_permission(SUBSCRIPTIONS_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    return await SubscriptionService(db).update(sub_id, payload, user.id)


@subscriptions_router.delete("/{sub_id}", status_code=204)
async def delete_subscription(
    sub_id: uuid.UUID,
    user: CurrentUser = Depends(require_permission(SUBSCRIPTIONS_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    await SubscriptionService(db).delete(sub_id, user.id)
    return Response(status_code=204)


@campaigns_router.get("", response_model=CampaignListResponse)
async def list_campaigns(
    user: CurrentUser = Depends(require_permission(CAMPAIGNS_VIEW)), db: AsyncSession = Depends(get_db)
):
    return await CampaignService(db).list()


@campaigns_router.post("", response_model=CampaignResponse, status_code=201)
async def create_campaign(
    payload: CampaignCreateRequest,
    user: CurrentUser = Depends(require_permission(CAMPAIGNS_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    return await CampaignService(db).create(payload, user.id)


@campaigns_router.patch("/{campaign_id}", response_model=CampaignResponse)
async def update_campaign(
    campaign_id: uuid.UUID,
    payload: CampaignUpdateRequest,
    user: CurrentUser = Depends(require_permission(CAMPAIGNS_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    return await CampaignService(db).update(campaign_id, payload, user.id)


@campaigns_router.delete("/{campaign_id}", status_code=204)
async def delete_campaign(
    campaign_id: uuid.UUID,
    user: CurrentUser = Depends(require_permission(CAMPAIGNS_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    await CampaignService(db).delete(campaign_id, user.id)
    return Response(status_code=204)
