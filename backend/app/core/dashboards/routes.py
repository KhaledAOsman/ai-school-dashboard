from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.auth.dependencies import CurrentUser, get_current_user
from app.core.dashboards.registry import widgets_for_permissions
from app.core.dashboards.schemas import WidgetResponse

router = APIRouter(prefix="/dashboards", tags=["dashboards"])


@router.get("/widgets", response_model=list[WidgetResponse])
async def list_available_widgets(user: CurrentUser = Depends(get_current_user)):
    """
    Returns only the widgets the CURRENT user's permissions allow. The
    frontend renders exactly this list - unauthorized widgets never even
    reach the client, and the underlying data endpoints are independently
    permission-checked regardless (frontend is never the security boundary).
    """
    widgets = widgets_for_permissions(user.permissions)
    return [
        WidgetResponse(key=w.key, title=w.title, data_endpoint=w.data_endpoint, category=w.category)
        for w in widgets
    ]
