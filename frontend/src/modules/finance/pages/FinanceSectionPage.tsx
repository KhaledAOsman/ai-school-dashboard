/**
 * Finance section content router. Navigation between finance sub-pages now
 * lives entirely in the sidebar accordion (see AppLayout's "الشؤون
 * المالية" NavGroup) - this component only renders the matched sub-page's
 * content for whichever /finance/* path is active, with no in-page tab bar
 * of its own (that duplicate top-of-page tab strip was removed so there's
 * a single, consistent place to navigate between finance pages).
 */
import { Routes, Route, Navigate } from "react-router-dom";
import { ExpensesListPage } from "@/modules/finance/pages/ExpensesListPage";
import { ExpenseFormPage } from "@/modules/finance/pages/ExpenseFormPage";
import { ExpenseDetailPage } from "@/modules/finance/pages/ExpenseDetailPage";
import { BudgetLinesPage } from "@/modules/finance/pages/BudgetLinesPage";
import { CategoriesPage } from "@/modules/finance/pages/CategoriesPage";
import { ChartOfAccountsPage } from "@/modules/finance/pages/ChartOfAccountsPage";
import { StaffPage } from "@/modules/finance/pages/StaffPage";
import { FundingPage } from "@/modules/finance/pages/FundingPage";
import { RevenuePage } from "@/modules/finance/pages/RevenuePage";
import { AccountingLayout } from "@/modules/finance/accounting/AccountingLayout";
import { AccountingHome } from "@/modules/finance/accounting/AccountingHome";
import { JournalPage } from "@/modules/finance/accounting/JournalPage";
import { LedgerPage } from "@/modules/finance/accounting/LedgerPage";
import { TrialBalancePage } from "@/modules/finance/accounting/TrialBalancePage";
import { IncomeStatementPage } from "@/modules/finance/accounting/IncomeStatementPage";
import { BalanceSheetPage } from "@/modules/finance/accounting/BalanceSheetPage";
import { CashFlowPage } from "@/modules/finance/accounting/CashFlowPage";
import { ReportsPage } from "@/modules/finance/pages/ReportsPage";
import { FinanceOverviewPage } from "@/modules/finance/pages/FinanceOverviewPage";
import { usePermission } from "@/permissions/usePermission";
import { PERMISSIONS } from "@/permissions/constants";

export function FinanceSectionPage() {
  // The finance section opens on its overview when the user may see
  // finance reports; otherwise on the expenses list.
  const canViewReports = usePermission(PERMISSIONS.FINANCE_REPORT_VIEW);
  return (
    <Routes>
      <Route index element={<Navigate to={canViewReports ? "overview" : "expenses"} replace />} />
      <Route path="overview" element={<FinanceOverviewPage />} />
      <Route path="expenses" element={<ExpensesListPage />} />
      <Route path="expenses/new" element={<ExpenseFormPage />} />
      <Route path="expenses/:id" element={<ExpenseDetailPage />} />
      <Route path="expenses/:id/edit" element={<ExpenseFormPage />} />
      <Route path="funding" element={<FundingPage />} />
      <Route path="revenue" element={<RevenuePage />} />
      <Route path="accounting" element={<AccountingLayout />}>
        <Route index element={<AccountingHome />} />
        <Route path="journal" element={<JournalPage />} />
        <Route path="ledger" element={<LedgerPage />} />
        <Route path="trial-balance" element={<TrialBalancePage />} />
        <Route path="income-statement" element={<IncomeStatementPage />} />
        <Route path="balance-sheet" element={<BalanceSheetPage />} />
        <Route path="cash-flow" element={<CashFlowPage />} />
      </Route>
      <Route path="budget-lines" element={<BudgetLinesPage />} />
      <Route path="categories" element={<CategoriesPage />} />
      <Route path="chart-of-accounts" element={<ChartOfAccountsPage />} />
      <Route path="staff" element={<StaffPage />} />
      <Route path="reports" element={<ReportsPage />} />
    </Routes>
  );
}
