"""
Reusable dashboard/widget configuration.

Design (spec sections 4 and 20): different users may see different sets of
dashboard widgets depending on their permissions. Widgets are NOT hard-coded
per role - each widget declares which permission it requires to be shown,
and the frontend renders only the widgets the current user's permission set
allows. This lets a future Marketing or Support module register its own
dashboard widgets without touching this file's logic, only adding entries.

The backend's job here is limited to describing which widgets exist and
what permission each requires - actual widget DATA comes from each module's
own report endpoints (e.g. /finance/reports/summary). This module is a
catalog, not a data aggregator.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.core.permissions.registry import (
    DASHBOARDS_VIEW,
    FINANCE_REPORT_VIEW,
)


@dataclass(frozen=True)
class WidgetDef:
    key: str
    title: str
    required_permission: str
    data_endpoint: str
    category: str


# Registry of all known dashboard widgets. A new module adds its widgets
# here (see docs/adding-a-new-dashboard-widget.md) - core dashboard code
# never needs to change.
WIDGET_REGISTRY: list[WidgetDef] = [
    WidgetDef(
        key="finance.summary",
        title="Finance Summary",
        required_permission=FINANCE_REPORT_VIEW,
        data_endpoint="/api/finance/reports/summary",
        category="finance",
    ),
    WidgetDef(
        key="finance.category_breakdown",
        title="Expenses by Category",
        required_permission=FINANCE_REPORT_VIEW,
        data_endpoint="/api/finance/reports/category-breakdown",
        category="finance",
    ),
    WidgetDef(
        key="finance.monthly_trend",
        title="Monthly Expense Trend",
        required_permission=FINANCE_REPORT_VIEW,
        data_endpoint="/api/finance/reports/monthly-trend",
        category="finance",
    ),
    WidgetDef(
        key="finance.recent_expenses",
        title="Recent Expenses",
        required_permission=FINANCE_REPORT_VIEW,
        data_endpoint="/api/finance/reports/recent-expenses",
        category="finance",
    ),
]


def widgets_for_permissions(user_permissions: frozenset[str]) -> list[WidgetDef]:
    return [w for w in WIDGET_REGISTRY if w.required_permission in user_permissions]
