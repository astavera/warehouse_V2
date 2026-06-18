import { lazy, Suspense, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/AppLayout";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { canAccessModule, getDefaultLandingPath, type AppModule } from "@/lib/permissions";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const ReceivePage = lazy(() => import("@/pages/ReceivePage"));
const HistoryPage = lazy(() => import("@/pages/HistoryPage"));
const ExpectedBoxesPage = lazy(() => import("@/pages/ExpectedBoxesPage"));
const SuppliersPage = lazy(() => import("@/pages/SuppliersPage"));
const CarriersPage = lazy(() => import("@/pages/CarriersPage"));
const PricesPage = lazy(() => import("@/pages/PricesPage"));
const PricesPrintPage = lazy(() => import("@/pages/PricesPrintPage"));
const InventoryAuditPage = lazy(() => import("@/pages/InventoryAuditPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const AccountingDashboardPreviewPage = lazy(() => import("@/pages/accounting/AccountingDashboardPreviewPage"));
const AccountingInvoicesPage = lazy(() => import("@/pages/accounting/AccountingInvoicesPage"));
const AccountingImportsPage = lazy(() => import("@/pages/accounting/AccountingImportsPage"));
const AccountingCatalogsPage = lazy(() => import("@/pages/accounting/AccountingCatalogsPage"));
const AccountingVendorsPage = lazy(() => import("@/pages/accounting/AccountingVendorsPage"));
const AccountingPaidInvoicesPage = lazy(() =>
  import("@/pages/accounting/AccountingLedgerPages").then(module => ({ default: module.AccountingPaidInvoicesPage }))
);
const AccountingCreditCardPaymentsPage = lazy(() =>
  import("@/pages/accounting/AccountingLedgerPages").then(module => ({ default: module.AccountingCreditCardPaymentsPage }))
);
const AccountingPersonalBillsPage = lazy(() =>
  import("@/pages/accounting/AccountingLedgerPages").then(module => ({ default: module.AccountingPersonalBillsPage }))
);
const AccountingTruckPage = lazy(() =>
  import("@/pages/accounting/AccountingLedgerPages").then(module => ({ default: module.AccountingTruckPage }))
);
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const PreviewDashboardPage = lazy(() => import("@/pages/PreviewDashboardPage"));

function PageLoadingFallback() {
  return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>;
}

function LoginRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <PageLoadingFallback />;
  }

  if (user) {
    return <Navigate to={getDefaultLandingPath(user)} replace />;
  }

  return <LoginPage />;
}

function RequireModule({ children, module }: { children: ReactNode; module: AppModule }) {
  const { user } = useAuth();

  if (!canAccessModule(user, module)) {
    return <Navigate to={getDefaultLandingPath(user)} replace />;
  }

  return <>{children}</>;
}

function ProtectedApp() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <PageLoadingFallback />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <Routes>
      {/* Printable sheet: rendered outside AppLayout so it prints without app chrome. */}
      <Route path="/prices/print" element={<RequireModule module="prices"><PricesPrintPage /></RequireModule>} />
      <Route
        path="*"
        element={
          <AppLayout>
            <Routes>
              <Route path="/" element={<RequireModule module="receiving"><DashboardPage /></RequireModule>} />
              <Route path="/receive" element={<RequireModule module="receiving"><ReceivePage /></RequireModule>} />
              <Route path="/expected-boxes" element={<RequireModule module="expected_boxes"><ExpectedBoxesPage /></RequireModule>} />
              <Route path="/history" element={<RequireModule module="receiving"><HistoryPage /></RequireModule>} />
              <Route path="/suppliers" element={<RequireModule module="receiving"><SuppliersPage /></RequireModule>} />
              <Route path="/carriers" element={<RequireModule module="receiving"><CarriersPage /></RequireModule>} />
              <Route path="/prices" element={<RequireModule module="prices"><PricesPage /></RequireModule>} />
              <Route path="/inventory-audit" element={<RequireModule module="audit"><InventoryAuditPage /></RequireModule>} />
              <Route path="/accounting" element={<RequireModule module="accounting"><AccountingDashboardPreviewPage /></RequireModule>} />
              <Route path="/accounting/preview" element={<Navigate to="/accounting" replace />} />
              <Route path="/accounting/invoices" element={<RequireModule module="accounting"><AccountingInvoicesPage /></RequireModule>} />
              <Route path="/accounting/paid-invoices" element={<RequireModule module="accounting"><AccountingPaidInvoicesPage /></RequireModule>} />
              <Route path="/accounting/vendors" element={<RequireModule module="accounting"><AccountingVendorsPage /></RequireModule>} />
              <Route path="/accounting/credit-card-payments" element={<RequireModule module="accounting"><AccountingCreditCardPaymentsPage /></RequireModule>} />
              <Route path="/accounting/personal-bills" element={<RequireModule module="accounting"><AccountingPersonalBillsPage /></RequireModule>} />
              <Route path="/accounting/truck" element={<RequireModule module="accounting"><AccountingTruckPage /></RequireModule>} />
              <Route path="/accounting/imports" element={<RequireModule module="accounting"><AccountingImportsPage /></RequireModule>} />
              <Route path="/accounting/catalogs" element={<RequireModule module="accounting"><AccountingCatalogsPage /></RequireModule>} />
              <Route path="/settings" element={<RequireModule module="settings"><SettingsPage /></RequireModule>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppLayout>
        }
      />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoadingFallback />}>
            <Routes>
              <Route path="/login" element={<LoginRoute />} />
              {/* TEMPORAL: preview publico del dashboard de 21st.dev - eliminar tras revision */}
              <Route path="/preview-dashboard" element={<PreviewDashboardPage />} />
              <Route path="/*" element={<ProtectedApp />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
