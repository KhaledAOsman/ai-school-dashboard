"""
Permission code constants + seed data.

This is the single source of truth for permission strings used throughout
the backend. Route handlers and services should import from here rather
than hard-coding string literals, so a rename is a one-file change.

Adding a new permission for a new module: add a constant + seed tuple here,
then reference the constant in the module's routes. No core code needs to
change - see docs/adding-a-new-module.md.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PermissionDef:
    code: str
    description: str
    category: str


# ---- Finance: Expenses ----
FINANCE_EXPENSE_VIEW = "finance.expense.view"
FINANCE_EXPENSE_CREATE = "finance.expense.create"
FINANCE_EXPENSE_UPDATE = "finance.expense.update"
FINANCE_EXPENSE_DELETE = "finance.expense.delete"
FINANCE_EXPENSE_APPROVE = "finance.expense.approve"
FINANCE_EXPENSE_REJECT = "finance.expense.reject"
FINANCE_EXPENSE_SUBMIT = "finance.expense.submit"
FINANCE_EXPENSE_RESTORE_VERSION = "finance.expense.restore_version"

# ---- Finance: Categories ----
FINANCE_CATEGORY_VIEW = "finance.category.view"
FINANCE_CATEGORY_CREATE = "finance.category.create"
FINANCE_CATEGORY_UPDATE = "finance.category.update"
FINANCE_CATEGORY_DELETE = "finance.category.delete"  # archive, not hard delete

# ---- Finance: Reports ----
FINANCE_REPORT_VIEW = "finance.report.view"
FINANCE_REPORT_EXPORT = "finance.report.export"

# ---- Finance: Attachments ----
FINANCE_ATTACHMENT_UPLOAD = "finance.attachment.upload"
FINANCE_ATTACHMENT_DOWNLOAD = "finance.attachment.download"
FINANCE_ATTACHMENT_DELETE = "finance.attachment.delete"

# ---- Finance: Budget Lines ----
# Separate approval gate from individual expense approval: a General
# Manager approves the BUDGET LINE itself (e.g. "Instructor Salaries -
# September, 100,000 SAR") before any expense may be posted against it.
FINANCE_BUDGET_VIEW = "finance.budget.view"
FINANCE_BUDGET_CREATE = "finance.budget.create"
FINANCE_BUDGET_UPDATE = "finance.budget.update"
FINANCE_BUDGET_SUBMIT = "finance.budget.submit"
FINANCE_BUDGET_APPROVE = "finance.budget.approve"
FINANCE_BUDGET_REJECT = "finance.budget.reject"
FINANCE_BUDGET_ARCHIVE = "finance.budget.archive"

# ---- Finance: Staff ----
FINANCE_STAFF_VIEW = "finance.staff.view"
FINANCE_STAFF_CREATE = "finance.staff.create"
FINANCE_STAFF_UPDATE = "finance.staff.update"

# ---- CRM: Leads ----
# CRM_LEAD_VIEW: can see leads (own, or all if CRM_LEAD_VIEW_ALL is also
# held). CRM_LEAD_CREATE is kept SEPARATE from CRM_LEAD_MANAGE on purpose:
# in this org, only an Admin/Sales Manager enters new leads into the
# system - the customer-service/sales team works pipeline steps on leads
# already assigned to them, but does not add brand-new ones themselves.
# CRM_LEAD_MANAGE covers every pipeline action on an EXISTING lead (book,
# confirm, send zoom, attendance, report, follow-up, convert, lose).
# CRM_LEAD_VIEW_ALL is the sales-manager-level permission that both
# broadens visibility to every rep's leads AND gates reassignment (moving
# a lead to a different rep).
CRM_LEAD_VIEW = "crm.lead.view"
CRM_LEAD_VIEW_ALL = "crm.lead.view_all"
CRM_LEAD_CREATE = "crm.lead.create"
CRM_LEAD_MANAGE = "crm.lead.manage"

# ---- CRM: Teachers (trial-lecture scheduling) ----
CRM_TEACHER_VIEW = "crm.teacher.view"
CRM_TEACHER_MANAGE = "crm.teacher.manage"  # add teachers + their available slots

# ---- Users ----
USERS_VIEW = "users.view"
USERS_CREATE = "users.create"
USERS_UPDATE = "users.update"
USERS_DISABLE = "users.disable"

# ---- Roles ----
ROLES_VIEW = "roles.view"
ROLES_CREATE = "roles.create"
ROLES_UPDATE = "roles.update"
ROLES_DELETE = "roles.delete"

# ---- Permissions ----
PERMISSIONS_VIEW = "permissions.view"

# ---- Dashboards ----
DASHBOARDS_VIEW = "dashboards.view"
DASHBOARDS_MANAGE = "dashboards.manage"

# ---- Audit / Security ----
AUDIT_VIEW = "audit.view"
SECURITY_LOGS_VIEW = "security_logs.view"

# ---- Settings ----
SETTINGS_VIEW = "settings.view"
SETTINGS_MANAGE = "settings.manage"


SEED_PERMISSIONS: list[PermissionDef] = [
    PermissionDef(FINANCE_EXPENSE_VIEW, "View expenses", "finance"),
    PermissionDef(FINANCE_EXPENSE_CREATE, "Create expenses", "finance"),
    PermissionDef(FINANCE_EXPENSE_UPDATE, "Edit expenses", "finance"),
    PermissionDef(FINANCE_EXPENSE_DELETE, "Archive expenses", "finance"),
    PermissionDef(FINANCE_EXPENSE_APPROVE, "Approve expenses", "finance"),
    PermissionDef(FINANCE_EXPENSE_REJECT, "Reject expenses", "finance"),
    PermissionDef(FINANCE_EXPENSE_SUBMIT, "Submit expenses for approval", "finance"),
    PermissionDef(FINANCE_EXPENSE_RESTORE_VERSION, "Restore a previous expense version", "finance"),
    PermissionDef(FINANCE_CATEGORY_VIEW, "View expense categories", "finance"),
    PermissionDef(FINANCE_CATEGORY_CREATE, "Create expense categories", "finance"),
    PermissionDef(FINANCE_CATEGORY_UPDATE, "Edit expense categories", "finance"),
    PermissionDef(FINANCE_CATEGORY_DELETE, "Archive expense categories", "finance"),
    PermissionDef(FINANCE_REPORT_VIEW, "View finance reports", "finance"),
    PermissionDef(FINANCE_REPORT_EXPORT, "Export finance reports", "finance"),
    PermissionDef(FINANCE_ATTACHMENT_UPLOAD, "Upload expense attachments", "finance"),
    PermissionDef(FINANCE_ATTACHMENT_DOWNLOAD, "Download expense attachments", "finance"),
    PermissionDef(FINANCE_ATTACHMENT_DELETE, "Delete expense attachments", "finance"),
    PermissionDef(FINANCE_BUDGET_VIEW, "View budget lines", "finance"),
    PermissionDef(FINANCE_BUDGET_CREATE, "Create budget lines", "finance"),
    PermissionDef(FINANCE_BUDGET_UPDATE, "Edit budget lines", "finance"),
    PermissionDef(FINANCE_BUDGET_SUBMIT, "Submit budget lines for approval", "finance"),
    PermissionDef(FINANCE_BUDGET_APPROVE, "Approve budget lines", "finance"),
    PermissionDef(FINANCE_BUDGET_REJECT, "Reject budget lines", "finance"),
    PermissionDef(FINANCE_BUDGET_ARCHIVE, "Archive budget lines", "finance"),
    PermissionDef(FINANCE_STAFF_VIEW, "View staff/instructor records", "finance"),
    PermissionDef(FINANCE_STAFF_CREATE, "Create staff/instructor records", "finance"),
    PermissionDef(FINANCE_STAFF_UPDATE, "Edit staff/instructor records", "finance"),
    PermissionDef(CRM_LEAD_VIEW, "View CRM leads", "crm"),
    PermissionDef(CRM_LEAD_VIEW_ALL, "View all reps' CRM leads and reassign them", "crm"),
    PermissionDef(CRM_LEAD_CREATE, "Create new CRM leads", "crm"),
    PermissionDef(CRM_LEAD_MANAGE, "Work existing CRM leads through the pipeline", "crm"),
    PermissionDef(CRM_TEACHER_VIEW, "View CRM teachers and their slots", "crm"),
    PermissionDef(CRM_TEACHER_MANAGE, "Manage CRM teachers and their available slots", "crm"),
    PermissionDef(USERS_VIEW, "View users", "users"),
    PermissionDef(USERS_CREATE, "Create users", "users"),
    PermissionDef(USERS_UPDATE, "Edit users", "users"),
    PermissionDef(USERS_DISABLE, "Disable users", "users"),
    PermissionDef(ROLES_VIEW, "View roles", "roles"),
    PermissionDef(ROLES_CREATE, "Create roles", "roles"),
    PermissionDef(ROLES_UPDATE, "Edit roles", "roles"),
    PermissionDef(ROLES_DELETE, "Delete roles", "roles"),
    PermissionDef(PERMISSIONS_VIEW, "View permissions", "permissions"),
    PermissionDef(DASHBOARDS_VIEW, "View dashboards", "dashboards"),
    PermissionDef(DASHBOARDS_MANAGE, "Manage dashboard widget configuration", "dashboards"),
    PermissionDef(AUDIT_VIEW, "View audit logs", "audit"),
    PermissionDef(SECURITY_LOGS_VIEW, "View security logs", "security"),
    PermissionDef(SETTINGS_VIEW, "View system settings", "settings"),
    PermissionDef(SETTINGS_MANAGE, "Manage system settings", "settings"),
]
