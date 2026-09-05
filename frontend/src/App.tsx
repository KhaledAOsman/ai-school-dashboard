import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthContext";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { LoginPage } from "@/auth/LoginPage";
import { AppLayout } from "@/layouts/AppLayout";
import { DashboardPage } from "@/dashboard/DashboardPage";
import { ExpensesListPage } from "@/modules/finance/pages/ExpensesListPage";
import { ExpenseDetailPage } from "@/modules/finance/pages/ExpenseDetailPage";
import { ExpenseFormPage } from "@/modules/finance/pages/ExpenseFormPage";
import { CategoriesPage } from "@/modules/finance/pages/CategoriesPage";
import { ChartOfAccountsPage } from "@/modules/finance/pages/ChartOfAccountsPage";
import { BudgetLinesPage } from "@/modules/finance/pages/BudgetLinesPage";
import { StaffPage } from "@/modules/finance/pages/StaffPage";
import { ReportsPage } from "@/modules/finance/pages/ReportsPage";
import { UsersPage } from "@/modules/finance/pages/UsersPage";
import { RolesPage } from "@/modules/finance/pages/RolesPage";
import { AuditLogPage } from "@/modules/finance/pages/AuditLogPage";
import { SecurityLogPage } from "@/modules/finance/pages/SecurityLogPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <DashboardPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/finance/expenses"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <ExpensesListPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/expenses/new"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <ExpenseFormPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance/expenses/:expenseId"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <ExpenseDetailPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/finance/categories"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <CategoriesPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/finance/chart-of-accounts"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <ChartOfAccountsPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/finance/budget-lines"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <BudgetLinesPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/finance/staff"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <StaffPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/finance/reports"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <ReportsPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/users"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <UsersPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/roles"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <RolesPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/audit-log"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <AuditLogPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/security-log"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <SecurityLogPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
