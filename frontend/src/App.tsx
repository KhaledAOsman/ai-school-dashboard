import { Suspense, lazy, type ComponentType } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthContext";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { HomeRedirect } from "@/auth/HomeRedirect";
import { LoginPage } from "@/auth/LoginPage";
import { AppLayout } from "@/layouts/AppLayout";

/**
 * Route chunks have hashed names, so after a redeploy an already-open tab asks
 * for chunks that no longer exist and the page would hang on "loading".
 * On such a failure reload once to pick up the new build.
 */
function lazyPage<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    factory().catch((err) => {
      const key = "chunk-reload-at";
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last > 30000) {
        sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    })
  );
}
const DashboardPage = lazyPage(() => import("@/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const FinanceSectionPage = lazyPage(() => import("@/modules/finance/pages/FinanceSectionPage").then((m) => ({ default: m.FinanceSectionPage })));
const LeadsListPage = lazyPage(() => import("@/modules/crm/pages/LeadsListPage").then((m) => ({ default: m.LeadsListPage })));
const BookingsPage = lazyPage(() => import("@/modules/crm/pages/BookingsPage").then((m) => ({ default: m.BookingsPage })));
const InterestedPage = lazyPage(() => import("@/modules/crm/pages/InterestedPage").then((m) => ({ default: m.InterestedPage })));
const LeadDetailPage = lazyPage(() => import("@/modules/crm/pages/LeadDetailPage").then((m) => ({ default: m.LeadDetailPage })));
const CRMTeachersPage = lazyPage(() => import("@/modules/crm/pages/CRMTeachersPage").then((m) => ({ default: m.CRMTeachersPage })));
const CRMDashboardPage = lazyPage(() => import("@/modules/crm/pages/CRMDashboardPage").then((m) => ({ default: m.CRMDashboardPage })));
const AllLeadsOverviewPage = lazyPage(() => import("@/modules/crm/pages/AllLeadsOverviewPage").then((m) => ({ default: m.AllLeadsOverviewPage })));
const SchedulePage = lazyPage(() => import("@/modules/crm/pages/SchedulePage").then((m) => ({ default: m.SchedulePage })));
const WhatsAppConnectionPage = lazyPage(() => import("@/modules/whatsapp/pages/WhatsAppConnectionPage").then((m) => ({ default: m.WhatsAppConnectionPage })));
const TemplatesPage = lazyPage(() => import("@/modules/whatsapp/pages/TemplatesPage").then((m) => ({ default: m.TemplatesPage })));
const SubscriptionsPage = lazyPage(() => import("@/modules/marketing/pages/SubscriptionsPage").then((m) => ({ default: m.SubscriptionsPage })));
const CampaignsPage = lazyPage(() => import("@/modules/marketing/pages/CampaignsPage").then((m) => ({ default: m.CampaignsPage })));
const UsersPage = lazyPage(() => import("@/modules/finance/pages/UsersPage").then((m) => ({ default: m.UsersPage })));
const RolesPage = lazyPage(() => import("@/modules/finance/pages/RolesPage").then((m) => ({ default: m.RolesPage })));
const AuditLogPage = lazyPage(() => import("@/modules/finance/pages/AuditLogPage").then((m) => ({ default: m.AuditLogPage })));
const FinModelSection = lazyPage(() => import("@/modules/fin-model/FinModelSection").then((m) => ({ default: m.FinModelSection })));
const SecurityLogPage = lazyPage(() => import("@/modules/finance/pages/SecurityLogPage").then((m) => ({ default: m.SecurityLogPage })));

const queryClient: QueryClient = new QueryClient({
  // Any successful save marks cached data stale so every page shows the new
  // numbers (only what is on screen is re-fetched right away).
  mutationCache: new MutationCache({ onSuccess: () => queryClient.invalidateQueries() }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Lists/reports are reused across pages for half a minute instead of
      // being re-fetched on every navigation; mutations invalidate them.
      staleTime: 30_000,
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
              path="/financial-model/*"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <FinModelSection />
                  </AppLayout>
                </ProtectedRoute>
              }
            />

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
