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
  CalendarCheck,
  Star,
  Calendar,
  MessageCircle,
  ShieldCheck,
  ScrollText,
  Lock,
  Settings,
  LogOut,
  ChevronDown,
  Megaphone,
  BadgeCheck,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { translate } from "@/i18n";
import clsx from "clsx";

function NavItem({ to, icon: Icon, label, indented = false }: { to: string; icon: typeof LayoutDashboard; label: string; indented?: boolean }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          "group relative flex items-center gap-3 rounded-full px-4 py-3 text-[16px] font-medium transition-all duration-150",
          indented && "py-2.5 text-[15px]",
          isActive ? "bg-brand-100 font-semibold text-brand-900" : "text-ink-700 hover:bg-ink-50 hover:text-ink-900"
        )
      }
    >
      {({ isActive }) => (
        <>
          
          <Icon
            size={indented ? 18 : 21}
            strokeWidth={isActive ? 2.25 : 2}
            className={isActive ? "text-brand-600" : "text-ink-500 transition-colors group-hover:text-ink-700"}
          />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}

function NavSectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3.5 pb-2 pt-6 text-[13px] font-bold tracking-wide text-ink-500 first:pt-2">
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
          "group relative flex w-full items-center gap-3 rounded-full px-4 py-3 text-[16px] font-medium transition-all duration-150",
          isActive && !isOpen ? "bg-brand-100 font-semibold text-brand-900" : "text-ink-700 hover:bg-ink-50 hover:text-ink-900"
        )}
      >
        
        <Icon
          size={21}
          strokeWidth={isActive ? 2.25 : 2}
          className={isActive && !isOpen ? "text-brand-600" : "text-ink-500 transition-colors group-hover:text-ink-700"}
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
  // The main dashboard now shows the half-yearly project KPIs (no finance
  // figures - those live in the Finance section's overview page).
  const canViewDashboard = usePermission(PERMISSIONS.DASHBOARDS_KPI_VIEW);
  const canViewSubscriptions = usePermission(PERMISSIONS.SUBSCRIPTIONS_VIEW);
  const canViewCampaigns = usePermission(PERMISSIONS.CAMPAIGNS_VIEW);
  const canViewMarketingSection = canViewSubscriptions || canViewCampaigns;
  const canViewAdminSection = canViewUsers || canViewRoles || canViewAudit || canViewSecurityLogs || canViewSettings;

  const isFinanceRoute = location.pathname.startsWith("/finance");
  const isCRMRoute = location.pathname.startsWith("/crm");
  const isMarketingRoute = location.pathname.startsWith("/marketing");

  // Only one group open at a time. Defaults to whichever section the
  // current route belongs to, so landing on e.g. /finance/expenses
  // directly (a refresh, a bookmark) opens "الشؤون المالية" automatically
  // instead of requiring an extra click.
  const [openGroup, setOpenGroup] = useState<"finance" | "crm" | "marketing" | null>(
    isFinanceRoute ? "finance" : isCRMRoute ? "crm" : isMarketingRoute ? "marketing" : null
  );

  useEffect(() => {
    if (isFinanceRoute) setOpenGroup("finance");
    else if (isCRMRoute) setOpenGroup("crm");
    else if (isMarketingRoute) setOpenGroup("marketing");
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mobile drawer: closes by itself on every navigation, on Escape, and the
  // page behind it does not scroll while it is open.
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

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
    <div className="flex min-h-screen bg-[#f1f3f9]" dir="rtl">
      {/* Backdrop (mobile only) */}
      <div
        onClick={() => setMenuOpen(false)}
        aria-hidden
        className={clsx(
          "fixed inset-0 z-40 bg-ink-900/40 transition-opacity duration-300 lg:hidden",
          menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />
      <aside
        id="app-sidebar"
        className={clsx(
          "fixed inset-y-0 start-0 z-50 flex w-[300px] max-w-[86vw] flex-col border-e border-[#dcdfeb] bg-white shadow-xl transition-transform duration-300 ease-out-expo",
          "lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:shrink-0 lg:translate-x-0 lg:shadow-none",
          menuOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex h-[84px] items-center justify-between border-b border-ink-100 px-5 lg:h-[96px]">
          <img src="/logo.png" alt="AiSchool" className="h-14 w-auto object-contain lg:h-16" />
          <button type="button" onClick={() => setMenuOpen(false)} aria-label="إغلاق القائمة" className="rounded-full p-2 text-ink-600 hover:bg-ink-100 lg:hidden">
            <X size={22} />
          </button>
        </div>

        <nav onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setMenuOpen(false); }} className="thin-scrollbar flex-1 overflow-y-auto px-3 pb-4">
          {canViewDashboard && (
            <>
              <NavSectionLabel>عام</NavSectionLabel>
              <NavItem to="/dashboard" icon={LayoutDashboard} label={translate("ar", "nav_dashboard")} />
            </>
          )}

          {(canViewFinanceSection || canViewCRMSection || canViewMarketingSection) && <NavSectionLabel>الأقسام</NavSectionLabel>}

          {canViewFinanceSection && (
            <NavGroup
              icon={Wallet}
              label="الشؤون المالية"
              isOpen={openGroup === "finance"}
              onToggle={() => setOpenGroup((prev) => (prev === "finance" ? null : "finance"))}
              isActive={isFinanceRoute}
            >
              {canViewReports && <NavItem indented to="/finance/overview" icon={LayoutDashboard} label="نظرة عامة" />}
              {canViewExpenses && <NavItem indented to="/finance/expenses" icon={Receipt} label={translate("ar", "nav_expenses")} />}
              {canViewBudget && <NavItem indented to="/finance/budget-lines" icon={Wallet} label="بنود الميزانية" />}
              {canViewCategories && <NavItem indented to="/finance/categories" icon={FolderTree} label={translate("ar", "nav_categories")} />}
              {canViewCategories && <NavItem indented to="/finance/chart-of-accounts" icon={GitBranch} label="شجرة الحسابات" />}
              {canViewStaff && <NavItem indented to="/finance/staff" icon={GraduationCap} label="الموظفين" />}
              {canViewReports && <NavItem indented to="/finance/reports" icon={BarChart3} label={translate("ar", "nav_reports")} />}
            </NavGroup>
          )}

          {canViewMarketingSection && (
            <NavGroup
              icon={Megaphone}
              label="المشتركون والتسويق"
              isOpen={openGroup === "marketing"}
              onToggle={() => setOpenGroup((prev) => (prev === "marketing" ? null : "marketing"))}
              isActive={isMarketingRoute}
            >
              {canViewSubscriptions && <NavItem indented to="/marketing/subscriptions" icon={BadgeCheck} label="الاشتراكات" />}
              {canViewCampaigns && <NavItem indented to="/marketing/campaigns" icon={Megaphone} label="الحملات الإعلانية" />}
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
              {canViewLeads && <NavItem indented to="/crm/dashboard" icon={LayoutDashboard} label="لوحة التحكم" />}
              {canViewLeads && <NavItem indented to="/crm/all-leads" icon={Users} label="كل العملاء" />}
              {canViewLeads && <NavItem indented to="/crm/leads" icon={UserPlus} label="العملاء المحتملون" />}
              {canViewLeads && <NavItem indented to="/crm/bookings" icon={CalendarCheck} label="الحجوزات" />}
              {canViewLeads && <NavItem indented to="/crm/interested" icon={Star} label="عملاء مهتمون" />}
              {canViewLeads && <NavItem indented to="/crm/schedule" icon={Calendar} label="جدول المواعيد" />}
              {canViewCRMTeachers && <NavItem indented to="/crm/teachers" icon={GraduationCap} label="المعلمين والمواعيد" />}
              {canViewLeads && <NavItem indented to="/crm/whatsapp" icon={MessageCircle} label="واتساب" />}
              {canViewLeads && <NavItem indented to="/crm/whatsapp/templates" icon={MessageCircle} label="قوالب الرسائل" />}
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

        <div className="border-t border-ink-100 p-3">
          <button
            onClick={handleLogout}
            className="group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start transition-colors hover:bg-ink-100"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-brand-800 text-[14px] font-semibold text-white shadow-sm">
              {initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold text-ink-900">{user?.full_name}</span>
              <span className="block truncate text-[13px] text-ink-600">{user?.email}</span>
            </span>
            <LogOut size={15} className="shrink-0 text-ink-400 transition-colors group-hover:text-danger-500" />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-[#dcdfeb] bg-white/95 px-4 backdrop-blur lg:hidden">
          <button
            type="button" onClick={() => setMenuOpen(true)} aria-label="فتح القائمة" aria-expanded={menuOpen} aria-controls="app-sidebar"
            className="-me-1 rounded-full p-2 text-ink-800 hover:bg-ink-100"
          >
            <Menu size={24} />
          </button>
          <img src="/logo.png" alt="AiSchool" className="h-11 w-auto object-contain" />
        </header>
        <main className="thin-scrollbar min-w-0 flex-1">
          <div className="mx-auto max-w-[1360px] px-4 py-5 sm:px-6 sm:py-8 lg:px-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
