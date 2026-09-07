/**
 * Main authenticated layout: sidebar navigation (with brand logo) + content
 * area. Professional SaaS visual language - refined elevation, pill-shaped
 * active states with a soft brand glow, subtle motion - built around the
 * AiSchool purple/orange identity.
 *
 * Sidebar sections with sub-pages (finance, CRM) render as accordion
 * groups: clicking the group header expands its sub-items inline and
 * collapses any other open group (only one open at a time) - this keeps
 * the sidebar organized as more top-level sections (finance, CRM, and
 * later e.g. a full CRM module) get added, instead of every sub-page
 * being a flat always-visible item.
 */
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Receipt,
  FolderTree,
  GitBranch,
  BarChart3,
  Wallet,
  GraduationCap,
  Users,
  UserPlus,
  ShieldCheck,
  ScrollText,
  Lock,
  Settings,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { usePermission, useAnyPermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { translate } from "@/i18n";
import clsx from "clsx";

function NavItem({ to, icon: Icon, label, indented = false }: { to: string; icon: typeof LayoutDashboard; label: string; indented?: boolean }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          "group relative flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-[13.5px] font-medium transition-all duration-150",
          indented && "py-2 text-[13px]",
          isActive ? "bg-brand-50 text-brand-700 shadow-glow-brand" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute right-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-brand-600" />}
          <Icon
            size={indented ? 16 : 18}
            strokeWidth={isActive ? 2.25 : 2}
            className={isActive ? "text-brand-600" : "text-ink-400 transition-colors group-hover:text-ink-600"}
          />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}

function NavSectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3.5 pb-2 pt-6 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-400 first:pt-2">
      {children}
    </p>
  );
}

/**
 * Accordion group for a top-level section with sub-pages. `open`/`onToggle`
 * are controlled by the parent so only one group can be expanded at a
 * time (see AppLayout's openGroup state).
 */
function NavGroup({
  icon: Icon,
  label,
  isOpen,
  onToggle,
  isActive,
  children,
}: {
  icon: typeof LayoutDashboard;
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  isActive: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className={clsx(
          "group relative flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-[13.5px] font-medium transition-all duration-150",
          isActive && !isOpen ? "bg-brand-50 text-brand-700 shadow-glow-brand" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
        )}
      >
        {isActive && !isOpen && <span className="absolute right-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-brand-600" />}
        <Icon
          size={18}
          strokeWidth={isActive ? 2.25 : 2}
          className={isActive && !isOpen ? "text-brand-600" : "text-ink-400 transition-colors group-hover:text-ink-600"}
        />
        <span className="flex-1 text-start">{label}</span>
        <ChevronDown size={15} className={clsx("text-ink-400 transition-transform duration-200", isOpen && "rotate-180")} />
      </button>
      <div
        className={clsx(
          "grid overflow-hidden transition-all duration-200 ease-out-expo",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="min-h-0">
          <div className="mt-1 space-y-0.5 border-e-2 border-ink-100 pe-0 ps-3.5 me-3.5">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const canViewExpenses = usePermission(PERMISSIONS.FINANCE_EXPENSE_VIEW);
  const canViewCategories = usePermission(PERMISSIONS.FINANCE_CATEGORY_VIEW);
  const canViewReports = usePermission(PERMISSIONS.FINANCE_REPORT_VIEW);
  const canViewBudget = usePermission(PERMISSIONS.FINANCE_BUDGET_VIEW);
  const canViewStaff = usePermission(PERMISSIONS.FINANCE_STAFF_VIEW);
  const canViewFinanceSection = canViewExpenses || canViewCategories || canViewReports || canViewBudget || canViewStaff;
  const canViewLeads = usePermission(PERMISSIONS.CRM_LEAD_VIEW);
  const canViewCRMTeachers = usePermission(PERMISSIONS.CRM_TEACHER_VIEW);
  const canViewCRMSection = canViewLeads || canViewCRMTeachers;
  const canViewUsers = usePermission(PERMISSIONS.USERS_VIEW);
  const canViewRoles = usePermission(PERMISSIONS.ROLES_VIEW);
  const canViewAudit = usePermission(PERMISSIONS.AUDIT_VIEW);
  const canViewSecurityLogs = usePermission(PERMISSIONS.SECURITY_LOGS_VIEW);
  const canViewSettings = usePermission(PERMISSIONS.SETTINGS_VIEW);
  const canViewDashboard = useAnyPermission([PERMISSIONS.DASHBOARDS_VIEW, PERMISSIONS.FINANCE_REPORT_VIEW]);
  const canViewAdminSection = canViewUsers || canViewRoles || canViewAudit || canViewSecurityLogs || canViewSettings;

  const isFinanceRoute = location.pathname.startsWith("/finance");
  const isCRMRoute = location.pathname.startsWith("/crm");

  // Only one group open at a time. Defaults to whichever section the
  // current route belongs to, so landing on e.g. /finance/expenses
  // directly (a refresh, a bookmark) opens "الشؤون المالية" automatically
  // instead of requiring an extra click.
  const [openGroup, setOpenGroup] = useState<"finance" | "crm" | null>(
    isFinanceRoute ? "finance" : isCRMRoute ? "crm" : null
  );

  useEffect(() => {
    if (isFinanceRoute) setOpenGroup("finance");
    else if (isCRMRoute) setOpenGroup("crm");
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  const initials = (user?.full_name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-ink-50" dir="rtl">
      <aside className="flex w-[272px] flex-col bg-white shadow-[1px_0_0_0_rgba(23,25,41,0.06)]">
        <div className="flex h-[68px] items-center px-5">
          <img src="/logo.png" alt="AiSchool" className="h-8 w-auto object-contain" />
        </div>

        <nav className="thin-scrollbar flex-1 overflow-y-auto px-3 pb-4">
          {canViewDashboard && (
            <>
              <NavSectionLabel>عام</NavSectionLabel>
              <NavItem to="/dashboard" icon={LayoutDashboard} label={translate("ar", "nav_dashboard")} />
            </>
          )}

          {(canViewFinanceSection || canViewCRMSection) && <NavSectionLabel>الأقسام</NavSectionLabel>}

          {canViewFinanceSection && (
            <NavGroup
              icon={Wallet}
              label="الشؤون المالية"
              isOpen={openGroup === "finance"}
              onToggle={() => setOpenGroup((prev) => (prev === "finance" ? null : "finance"))}
              isActive={isFinanceRoute}
            >
              {canViewExpenses && <NavItem indented to="/finance/expenses" icon={Receipt} label={translate("ar", "nav_expenses")} />}
              {canViewBudget && <NavItem indented to="/finance/budget-lines" icon={Wallet} label="بنود الميزانية" />}
              {canViewCategories && <NavItem indented to="/finance/categories" icon={FolderTree} label={translate("ar", "nav_categories")} />}
              {canViewCategories && <NavItem indented to="/finance/chart-of-accounts" icon={GitBranch} label="شجرة الحسابات" />}
              {canViewStaff && <NavItem indented to="/finance/staff" icon={GraduationCap} label="الموظفين" />}
              {canViewReports && <NavItem indented to="/finance/reports" icon={BarChart3} label={translate("ar", "nav_reports")} />}
            </NavGroup>
          )}

          {canViewCRMSection && (
            <NavGroup
              icon={UserPlus}
              label="خدمة العملاء"
              isOpen={openGroup === "crm"}
              onToggle={() => setOpenGroup((prev) => (prev === "crm" ? null : "crm"))}
              isActive={isCRMRoute}
            >
              {canViewLeads && <NavItem indented to="/crm/leads" icon={UserPlus} label="العملاء المحتملون" />}
              {canViewCRMTeachers && <NavItem indented to="/crm/teachers" icon={GraduationCap} label="المعلمين والمواعيد" />}
            </NavGroup>
          )}

          {canViewAdminSection && (
            <>
              <NavSectionLabel>الإدارة</NavSectionLabel>
              {canViewUsers && <NavItem to="/admin/users" icon={Users} label={translate("ar", "nav_users")} />}
              {canViewRoles && <NavItem to="/admin/roles" icon={ShieldCheck} label={translate("ar", "nav_roles")} />}
              {canViewAudit && <NavItem to="/admin/audit-log" icon={ScrollText} label={translate("ar", "nav_audit_log")} />}
              {canViewSecurityLogs && <NavItem to="/admin/security-log" icon={Lock} label={translate("ar", "nav_security_log")} />}
              {canViewSettings && <NavItem to="/admin/settings" icon={Settings} label={translate("ar", "nav_settings")} />}
            </>
          )}
        </nav>

        <div className="p-3 shadow-[0_-1px_0_0_rgba(23,25,41,0.06)]">
          <button
            onClick={handleLogout}
            className="group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start transition-colors hover:bg-ink-100"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-[13px] font-semibold text-white shadow-sm">
              {initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-ink-800">{user?.full_name}</span>
              <span className="block truncate text-xs text-ink-500">{user?.email}</span>
            </span>
            <LogOut size={15} className="shrink-0 text-ink-400 transition-colors group-hover:text-danger-500" />
          </button>
        </div>
      </aside>

      <main className="thin-scrollbar flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-9">{children}</div>
      </main>
    </div>
  );
}
