/**
 * Finance section shell: a single sidebar entry ("الماليات") that houses
 * every finance sub-page as an internal tab, rather than each one being
 * its own top-level sidebar item. This groups all finance detail under
 * one icon/tab as requested, and leaves room to add sibling top-level
 * sections later (e.g. "خدمة العملاء", "CRM") without the sidebar growing
 * unbounded with finance sub-items.
 *
 * Each tab still renders its existing page component unchanged - this is
 * purely a navigation/grouping wrapper, not a rewrite of the underlying
 * pages.
 */
import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import { Receipt, Wallet, FolderTree, GitBranch, GraduationCap, BarChart3 } from "lucide-react";
import clsx from "clsx";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";
import { translate } from "@/i18n";
import { ExpensesListPage } from "@/modules/finance/pages/ExpensesListPage";
import { ExpenseFormPage } from "@/modules/finance/pages/ExpenseFormPage";
import { ExpenseDetailPage } from "@/modules/finance/pages/ExpenseDetailPage";
import { BudgetLinesPage } from "@/modules/finance/pages/BudgetLinesPage";
import { CategoriesPage } from "@/modules/finance/pages/CategoriesPage";
import { ChartOfAccountsPage } from "@/modules/finance/pages/ChartOfAccountsPage";
import { StaffPage } from "@/modules/finance/pages/StaffPage";
import { ReportsPage } from "@/modules/finance/pages/ReportsPage";

function FinanceTab({ to, icon: Icon, label }: { to: string; icon: typeof Receipt; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === "/finance/expenses"}
      className={({ isActive }) =>
        clsx(
          "flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-3 text-[13.5px] font-medium transition-colors",
          isActive
            ? "border-brand-600 text-brand-700"
            : "border-transparent text-ink-500 hover:border-ink-200 hover:text-ink-800"
        )
      }
    >
      <Icon size={16} strokeWidth={2} />
      {label}
    </NavLink>
  );
}

export function FinanceSectionPage() {
  const canViewExpenses = usePermission(PERMISSIONS.FINANCE_EXPENSE_VIEW);
  const canViewBudget = usePermission(PERMISSIONS.FINANCE_BUDGET_VIEW);
  const canViewCategories = usePermission(PERMISSIONS.FINANCE_CATEGORY_VIEW);
  const canViewStaff = usePermission(PERMISSIONS.FINANCE_STAFF_VIEW);
  const canViewReports = usePermission(PERMISSIONS.FINANCE_REPORT_VIEW);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-tight text-ink-900">الماليات</h1>
        <p className="mt-1 text-sm text-ink-500">كل ما يخص المصروفات والميزانيات والتقارير المالية في مكان واحد</p>
      </div>

      <div className="mb-7 flex gap-1 overflow-x-auto border-b border-ink-200">
        {canViewExpenses && <FinanceTab to="/finance/expenses" icon={Receipt} label={translate("ar", "nav_expenses")} />}
        {canViewBudget && <FinanceTab to="/finance/budget-lines" icon={Wallet} label="بنود الميزانية" />}
        {canViewCategories && <FinanceTab to="/finance/categories" icon={FolderTree} label={translate("ar", "nav_categories")} />}
        {canViewCategories && <FinanceTab to="/finance/chart-of-accounts" icon={GitBranch} label="شجرة الحسابات" />}
        {canViewStaff && <FinanceTab to="/finance/staff" icon={GraduationCap} label="الموظفين" />}
        {canViewReports && <FinanceTab to="/finance/reports" icon={BarChart3} label={translate("ar", "nav_reports")} />}
      </div>

      <Routes>
        <Route index element={<Navigate to="expenses" replace />} />
        <Route path="expenses" element={<ExpensesListPage />} />
        <Route path="expenses/new" element={<ExpenseFormPage />} />
        <Route path="expenses/:id" element={<ExpenseDetailPage />} />
        <Route path="budget-lines" element={<BudgetLinesPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="chart-of-accounts" element={<ChartOfAccountsPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="reports" element={<ReportsPage />} />
      </Routes>
    </div>
  );
}
