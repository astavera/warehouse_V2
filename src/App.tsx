import { lazy, Suspense, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/AppLayout";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { canAccessModule, getDefaultLandingPath, type AppModule } from "@/lib/permissions";
import {
  loadAccountingCatalogsPage,
  loadAccountingDashboardPage,
  loadAccountingImportsPage,
  loadAccountingInvoicesPage,
  loadAccountingLedgerPages,
  loadAccountingReportsPage,
  loadAccountingVendorsPage,
  loadCarriersPage,
  loadDashboardPage,
  loadExpectedBoxesPage,
  loadHistoryPage,
  loadInventoryAuditPage,
  loadLoginPage,
  loadNavbarPreviewPage,
  loadPreviewDashboardPage,
  loadPricesPage,
  loadPricesPrintPage,
  loadReceivePage,
  loadResetPasswordPage,
  loadSettingsPage,
  loadSuppliersPage,
} from "@/lib/routePreloaders";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const DashboardPage = lazy(loadDashboardPage);
const ReceivePage = lazy(loadReceivePage);
const HistoryPage = lazy(loadHistoryPage);
const ExpectedBoxesPage = lazy(loadExpectedBoxesPage);
const SuppliersPage = lazy(loadSuppliersPage);
const CarriersPage = lazy(loadCarriersPage);
const PricesPage = lazy(loadPricesPage);
const PricesPrintPage = lazy(loadPricesPrintPage);
const InventoryAuditPage = lazy(loadInventoryAuditPage);
const SettingsPage = lazy(loadSettingsPage);
const AccountingDashboardPreviewPage = lazy(loadAccountingDashboardPage);
const AccountingInvoicesPage = lazy(loadAccountingInvoicesPage);
const AccountingImportsPage = lazy(loadAccountingImportsPage);
const AccountingCatalogsPage = lazy(loadAccountingCatalogsPage);
const AccountingVendorsPage = lazy(loadAccountingVendorsPage);
const AccountingReportsPage = lazy(loadAccountingReportsPage);
const AccountingPaidInvoicesPage = lazy(() =>
  loadAccountingLedgerPages().then(module => ({ default: module.AccountingPaidInvoicesPage }))
);
const AccountingCreditCardPaymentsPage = lazy(() =>
  loadAccountingLedgerPages().then(module => ({ default: module.AccountingCreditCardPaymentsPage }))
);
const AccountingPersonalBillsPage = lazy(() =>
  loadAccountingLedgerPages().then(module => ({ default: module.AccountingPersonalBillsPage }))
);
const AccountingTruckPage = lazy(() =>
  loadAccountingLedgerPages().then(module => ({ default: module.AccountingTruckPage }))
);
const LoginPage = lazy(loadLoginPage);
const ResetPasswordPage = lazy(loadResetPasswordPage);
const PreviewDashboardPage = lazy(loadPreviewDashboardPage);
const NavbarPreviewPage = lazy(loadNavbarPreviewPage);

function PageLoadingFallback() {
  return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>;
}

function RouteLoadingFallback() {
  return (
    <div className="animate-in fade-in-0 duration-150">
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/70" />
      </div>
      <div className="mt-4 rounded-lg border bg-white p-5 text-sm text-muted-foreground shadow-sm">
        Opening section...
      </div>
    </div>
  );
}

function LoginRoute() {
  const { user } = useAuth();

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
            <Suspense fallback={<RouteLoadingFallback />}>
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
                <Route path="/accounting/reports" element={<RequireModule module="accounting"><AccountingReportsPage /></RequireModule>} />
                <Route path="/accounting/vendors" element={<RequireModule module="accounting"><AccountingVendorsPage /></RequireModule>} />
                <Route path="/accounting/credit-card-payments" element={<RequireModule module="accounting"><AccountingCreditCardPaymentsPage /></RequireModule>} />
                <Route path="/accounting/personal-bills" element={<RequireModule module="accounting"><AccountingPersonalBillsPage /></RequireModule>} />
                <Route path="/accounting/truck" element={<RequireModule module="accounting"><AccountingTruckPage /></RequireModule>} />
                <Route path="/accounting/imports" element={<RequireModule module="accounting"><AccountingImportsPage /></RequireModule>} />
                <Route path="/accounting/catalogs" element={<RequireModule module="accounting"><AccountingCatalogsPage /></RequireModule>} />
                <Route path="/settings" element={<RequireModule module="settings"><SettingsPage /></RequireModule>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
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
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              {/* TEMPORAL: preview publico del dashboard de 21st.dev - eliminar tras revision */}
              <Route path="/preview-dashboard" element={<PreviewDashboardPage />} />
              <Route path="/navbar-preview" element={<NavbarPreviewPage />} />
              <Route path="/*" element={<ProtectedApp />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
