/**
 * Main authenticated layout: sidebar navigation (with brand logo) + content
 * area. Professional SaaS visual language - refined elevation, pill-shaped
 * active states with a soft brand glow, subtle motion - built around the
 * AiSchool purple/orange identity.
 */
import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Wallet,
  Users,
  ShieldCheck,
  ScrollText,
  Lock,
  Settings,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { usePermission, useAnyPermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { translate } from "@/i18n";
import clsx from "clsx";

function NavItem({ to, icon: Icon, label }: { to: string; icon: typeof LayoutDashboard; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          "group relative flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-[13.5px] font-medium transition-all duration-150",
          isActive ? "bg-brand-50 text-brand-700 shadow-glow-brand" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute right-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-brand-600" />}
          <Icon
            size={18}
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

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const canViewFinanceSection = useAnyPermission([
    PERMISSIONS.FINANCE_EXPENSE_VIEW,
    PERMISSIONS.FINANCE_CATEGORY_VIEW,
    PERMISSIONS.FINANCE_REPORT_VIEW,
    PERMISSIONS.FINANCE_BUDGET_VIEW,
    PERMISSIONS.FINANCE_STAFF_VIEW,
  ]);
  const canViewUsers = usePermission(PERMISSIONS.USERS_VIEW);
  const canViewRoles = usePermission(PERMISSIONS.ROLES_VIEW);
  const canViewAudit = usePermission(PERMISSIONS.AUDIT_VIEW);
  const canViewSecurityLogs = usePermission(PERMISSIONS.SECURITY_LOGS_VIEW);
  const canViewSettings = usePermission(PERMISSIONS.SETTINGS_VIEW);
  const canViewDashboard = useAnyPermission([PERMISSIONS.DASHBOARDS_VIEW, PERMISSIONS.FINANCE_REPORT_VIEW]);
  const canViewAdminSection = canViewUsers || canViewRoles || canViewAudit || canViewSecurityLogs || canViewSettings;

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

          {/*
            Single sidebar entry for the whole finance section - expenses,
            budget lines, categories, chart of accounts, staff, and reports
            all live as internal tabs inside FinanceSectionPage now (see
            App.tsx's /finance/* route), rather than each being its own
            top-level item here. This also leaves room to add sibling
            top-level sections later (e.g. خدمة العملاء, CRM) without the
            sidebar growing unbounded.
          */}
          {canViewFinanceSection && (
            <>
              <NavSectionLabel>الأقسام</NavSectionLabel>
              <NavItem to="/finance/expenses" icon={Wallet} label="الماليات" />
            </>
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
