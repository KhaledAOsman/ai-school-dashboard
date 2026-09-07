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
import { ReportsPage } from "@/modules/finance/pages/ReportsPage";

export function FinanceSectionPage() {
  return (
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
  );
}
