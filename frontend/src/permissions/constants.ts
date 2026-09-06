/**
 * Permission code constants - MUST stay in sync with backend
 * app/core/permissions/registry.py. Frontend code should import these
 * constants rather than hard-coding permission strings, mirroring the
 * backend's own convention.
 */
export const PERMISSIONS = {
  FINANCE_EXPENSE_VIEW: "finance.expense.view",
  FINANCE_EXPENSE_CREATE: "finance.expense.create",
  FINANCE_EXPENSE_UPDATE: "finance.expense.update",
  FINANCE_EXPENSE_DELETE: "finance.expense.delete",
  FINANCE_EXPENSE_APPROVE: "finance.expense.approve",
  FINANCE_EXPENSE_REJECT: "finance.expense.reject",
  FINANCE_EXPENSE_SUBMIT: "finance.expense.submit",
  FINANCE_EXPENSE_RESTORE_VERSION: "finance.expense.restore_version",

  FINANCE_CATEGORY_VIEW: "finance.category.view",
  FINANCE_CATEGORY_CREATE: "finance.category.create",
  FINANCE_CATEGORY_UPDATE: "finance.category.update",
  FINANCE_CATEGORY_DELETE: "finance.category.delete",

  FINANCE_REPORT_VIEW: "finance.report.view",
  FINANCE_REPORT_EXPORT: "finance.report.export",

  FINANCE_ATTACHMENT_UPLOAD: "finance.attachment.upload",
  FINANCE_ATTACHMENT_DOWNLOAD: "finance.attachment.download",
  FINANCE_ATTACHMENT_DELETE: "finance.attachment.delete",

  FINANCE_BUDGET_VIEW: "finance.budget.view",
  FINANCE_BUDGET_CREATE: "finance.budget.create",
  FINANCE_BUDGET_UPDATE: "finance.budget.update",
  FINANCE_BUDGET_SUBMIT: "finance.budget.submit",
  FINANCE_BUDGET_APPROVE: "finance.budget.approve",
  FINANCE_BUDGET_REJECT: "finance.budget.reject",
  FINANCE_BUDGET_ARCHIVE: "finance.budget.archive",

  FINANCE_STAFF_VIEW: "finance.staff.view",
  FINANCE_STAFF_CREATE: "finance.staff.create",
  FINANCE_STAFF_UPDATE: "finance.staff.update",

  CRM_LEAD_VIEW: "crm.lead.view",
  CRM_LEAD_VIEW_ALL: "crm.lead.view_all",
  CRM_LEAD_MANAGE: "crm.lead.manage",
  CRM_TEACHER_VIEW: "crm.teacher.view",
  CRM_TEACHER_MANAGE: "crm.teacher.manage",

  USERS_VIEW: "users.view",
  USERS_CREATE: "users.create",
  USERS_UPDATE: "users.update",
  USERS_DISABLE: "users.disable",

  ROLES_VIEW: "roles.view",
  ROLES_CREATE: "roles.create",
  ROLES_UPDATE: "roles.update",
  ROLES_DELETE: "roles.delete",

  PERMISSIONS_VIEW: "permissions.view",

  DASHBOARDS_VIEW: "dashboards.view",
  DASHBOARDS_MANAGE: "dashboards.manage",

  AUDIT_VIEW: "audit.view",
  SECURITY_LOGS_VIEW: "security_logs.view",

  SETTINGS_VIEW: "settings.view",
  SETTINGS_MANAGE: "settings.manage",
} as const;
