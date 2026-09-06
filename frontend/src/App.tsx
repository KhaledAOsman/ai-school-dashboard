import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthContext";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { LoginPage } from "@/auth/LoginPage";
import { AppLayout } from "@/layouts/AppLayout";
import { DashboardPage } from "@/dashboard/DashboardPage";
import { FinanceSectionPage } from "@/modules/finance/pages/FinanceSectionPage";
import { LeadsListPage } from "@/modules/crm/pages/LeadsListPage";
import { LeadDetailPage } from "@/modules/crm/pages/LeadDetailPage";
import { CRMTeachersPage } from "@/modules/crm/pages/CRMTeachersPage";
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

            {/*
              Every /finance/* path (expenses, budget-lines, categories,
              chart-of-accounts, staff, reports) is now handled inside
              FinanceSectionPage itself via its own nested <Routes>, so the
              sidebar only needs a single "الماليات" entry pointing at
              /finance/expenses (see AppLayout) instead of one item per
              sub-page.
            */}
            <Route
              path="/finance/*"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <FinanceSectionPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/crm/leads"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <LeadsListPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/crm/leads/:id"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <LeadDetailPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/crm/teachers"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <CRMTeachersPage />
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
