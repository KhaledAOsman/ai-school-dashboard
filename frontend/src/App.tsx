import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthContext";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { HomeRedirect } from "@/auth/HomeRedirect";
import { LoginPage } from "@/auth/LoginPage";
import { AppLayout } from "@/layouts/AppLayout";
const DashboardPage = lazy(() => import("@/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const FinanceSectionPage = lazy(() => import("@/modules/finance/pages/FinanceSectionPage").then((m) => ({ default: m.FinanceSectionPage })));
const LeadsListPage = lazy(() => import("@/modules/crm/pages/LeadsListPage").then((m) => ({ default: m.LeadsListPage })));
const BookingsPage = lazy(() => import("@/modules/crm/pages/BookingsPage").then((m) => ({ default: m.BookingsPage })));
const LegacyBookingsPage = lazy(() => import("@/modules/crm/pages/LegacyBookingsPage").then((m) => ({ default: m.LegacyBookingsPage })));
const InterestedPage = lazy(() => import("@/modules/crm/pages/InterestedPage").then((m) => ({ default: m.InterestedPage })));
const LeadDetailPage = lazy(() => import("@/modules/crm/pages/LeadDetailPage").then((m) => ({ default: m.LeadDetailPage })));
const CRMTeachersPage = lazy(() => import("@/modules/crm/pages/CRMTeachersPage").then((m) => ({ default: m.CRMTeachersPage })));
const CRMDashboardPage = lazy(() => import("@/modules/crm/pages/CRMDashboardPage").then((m) => ({ default: m.CRMDashboardPage })));
const AllLeadsOverviewPage = lazy(() => import("@/modules/crm/pages/AllLeadsOverviewPage").then((m) => ({ default: m.AllLeadsOverviewPage })));
const SchedulePage = lazy(() => import("@/modules/crm/pages/SchedulePage").then((m) => ({ default: m.SchedulePage })));
const WhatsAppConnectionPage = lazy(() => import("@/modules/whatsapp/pages/WhatsAppConnectionPage").then((m) => ({ default: m.WhatsAppConnectionPage })));
const TemplatesPage = lazy(() => import("@/modules/whatsapp/pages/TemplatesPage").then((m) => ({ default: m.TemplatesPage })));
const SubscriptionsPage = lazy(() => import("@/modules/marketing/pages/SubscriptionsPage").then((m) => ({ default: m.SubscriptionsPage })));
const CampaignsPage = lazy(() => import("@/modules/marketing/pages/CampaignsPage").then((m) => ({ default: m.CampaignsPage })));
const UsersPage = lazy(() => import("@/modules/finance/pages/UsersPage").then((m) => ({ default: m.UsersPage })));
const RolesPage = lazy(() => import("@/modules/finance/pages/RolesPage").then((m) => ({ default: m.RolesPage })));
const AuditLogPage = lazy(() => import("@/modules/finance/pages/AuditLogPage").then((m) => ({ default: m.AuditLogPage })));
const SecurityLogPage = lazy(() => import("@/modules/finance/pages/SecurityLogPage").then((m) => ({ default: m.SecurityLogPage })));

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
          <Suspense fallback={<div className="p-10 text-center text-[15px] text-ink-600">جارٍ التحميل…</div>}>
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

            <Route path="/kpi-dashboard" element={<Navigate to="/dashboard" replace />} />

            <Route
              path="/marketing/subscriptions"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <SubscriptionsPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/marketing/campaigns"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <CampaignsPage />
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
              path="/crm/legacy-bookings"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <LegacyBookingsPage />
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
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
