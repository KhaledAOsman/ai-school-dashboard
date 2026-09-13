/**
 * Lands a freshly-logged-in user on the first page they actually have
 * permission to see, instead of hardcoding /dashboard - a user whose role
 * has no finance/dashboard permissions (e.g. a pure "Sales Manager" CRM
 * role) previously landed on a blank/403'ing finance dashboard with no
 * obvious way to reach the CRM section they DO have access to.
 */
import { Navigate } from "react-router-dom";
import { useAnyPermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";

export function HomeRedirect() {
  const canViewDashboard = useAnyPermission([PERMISSIONS.DASHBOARDS_VIEW, PERMISSIONS.FINANCE_REPORT_VIEW]);
  const canViewCRM = useAnyPermission([PERMISSIONS.CRM_LEAD_VIEW, PERMISSIONS.CRM_TEACHER_VIEW]);
  const canViewFinance = useAnyPermission([
    PERMISSIONS.FINANCE_EXPENSE_VIEW,
    PERMISSIONS.FINANCE_CATEGORY_VIEW,
    PERMISSIONS.FINANCE_BUDGET_VIEW,
    PERMISSIONS.FINANCE_STAFF_VIEW,
  ]);
  const canViewUsers = useAnyPermission([PERMISSIONS.USERS_VIEW, PERMISSIONS.ROLES_VIEW]);

  if (canViewDashboard) return <Navigate to="/dashboard" replace />;
  if (canViewCRM) return <Navigate to="/crm/dashboard" replace />;
  if (canViewFinance) return <Navigate to="/finance/expenses" replace />;
  if (canViewUsers) return <Navigate to="/admin/users" replace />;

  return <Navigate to="/login" replace />;
}
