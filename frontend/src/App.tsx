import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthContext";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { HomeRedirect } from "@/auth/HomeRedirect";
import { LoginPage } from "@/auth/LoginPage";
import { AppLayout } from "@/layouts/AppLayout";
import { DashboardPage } from "@/dashboard/DashboardPage";
import { FinanceSectionPage } from "@/modules/finance/pages/FinanceSectionPage";
import { LeadsListPage } from "@/modules/crm/pages/LeadsListPage";
import { BookingsPage } from "@/modules/crm/pages/BookingsPage";
import { InterestedPage } from "@/modules/crm/pages/InterestedPage";
import { LeadDetailPage } from "@/modules/crm/pages/LeadDetailPage";
import { CRMTeachersPage } from "@/modules/crm/pages/CRMTeachersPage";
import { CRMDashboardPage } from "@/modules/crm/pages/CRMDashboardPage";
import { AllLeadsOverviewPage } from "@/modules/crm/pages/AllLeadsOverviewPage";
import { SchedulePage } from "@/modules/crm/pages/SchedulePage";
import { WhatsAppConnectionPage } from "@/modules/whatsapp/pages/WhatsAppConnectionPage";
import { TemplatesPage } from "@/modules/whatsapp/pages/TemplatesPage";
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
              path="/crm/dashboard"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <CRMDashboardPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/crm/all-leads"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <AllLeadsOverviewPage />
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
              path="/crm/bookings"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <BookingsPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/crm/interested"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <InterestedPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/crm/schedule"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <SchedulePage />
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
              path="/crm/whatsapp"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <WhatsAppConnectionPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/crm/whatsapp/templates"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <TemplatesPage />
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

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <HomeRedirect />
                </ProtectedRoute>
              }
            />
            <Route
              path="*"
              element={
                <ProtectedRoute>
                  <HomeRedirect />
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
