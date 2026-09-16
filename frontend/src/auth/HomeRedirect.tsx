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
  const canViewKpiOnly = useAnyPermission([PERMISSIONS.DASHBOARDS_KPI_VIEW]);
  const canViewCRM = useAnyPermission([PERMISSIONS.CRM_LEAD_VIEW, PERMISSIONS.CRM_TEACHER_VIEW]);
  const canViewFinance = useAnyPermission([
    PERMISSIONS.FINANCE_EXPENSE_VIEW,
    PERMISSIONS.FINANCE_CATEGORY_VIEW,
    PERMISSIONS.FINANCE_BUDGET_VIEW,
    PERMISSIONS.FINANCE_STAFF_VIEW,
    PERMISSIONS.FINANCE_REPORT_VIEW,
  ]);
  const canViewUsers = useAnyPermission([PERMISSIONS.USERS_VIEW, PERMISSIONS.ROLES_VIEW]);
  const canViewDashboard = useAnyPermission([PERMISSIONS.DASHBOARDS_VIEW]);

  // A manager granted ONLY the KPI-summary permission (no full CRM/finance
  // module access) goes straight to the KPI dashboard - that's the one
  // page their role can actually do anything on.
  if (canViewKpiOnly && !canViewCRM && !canViewFinance && !canViewDashboard) {
    return <Navigate to="/kpi-dashboard" replace />;
  }

  // CRM-only roles (e.g. Sales Rep/Manager) go straight to the CRM
  // dashboard even if they also happen to hold a generic DASHBOARDS_VIEW
  // permission - a role whose real work is entirely in CRM should never
  // land on the finance dashboard first. Finance/admin roles still prefer
  // the main dashboard when they have real finance access.
  if (canViewCRM && !canViewFinance) return <Navigate to="/crm/dashboard" replace />;
  if (canViewDashboard || canViewFinance) return <Navigate to="/dashboard" replace />;
  if (canViewCRM) return <Navigate to="/crm/dashboard" replace />;
  if (canViewUsers) return <Navigate to="/admin/users" replace />;
  if (canViewKpiOnly) return <Navigate to="/kpi-dashboard" replace />;

  return <Navigate to="/login" replace />;
}
