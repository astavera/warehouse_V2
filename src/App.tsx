import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/AppLayout";
import DashboardPage from "@/pages/DashboardPage";
import ReceivePage from "@/pages/ReceivePage";
import HistoryPage from "@/pages/HistoryPage";
import ExpectedBoxesPage from "@/pages/ExpectedBoxesPage";
import SuppliersPage from "@/pages/SuppliersPage";
import CarriersPage from "@/pages/CarriersPage";
import PricesPage from "@/pages/PricesPage";
import PricesPrintPage from "@/pages/PricesPrintPage";
import InventoryAuditPage from "@/pages/InventoryAuditPage";
import SettingsPage from "@/pages/SettingsPage";
import AccountingDashboardPage from "@/pages/accounting/AccountingDashboardPage";
import AccountingInvoicesPage from "@/pages/accounting/AccountingInvoicesPage";
import AccountingImportsPage from "@/pages/accounting/AccountingImportsPage";
import AccountingCatalogsPage from "@/pages/accounting/AccountingCatalogsPage";
import AccountingVendorsPage from "@/pages/accounting/AccountingVendorsPage";
import {
  AccountingCreditCardPaymentsPage,
  AccountingPaidInvoicesPage,
  AccountingPersonalBillsPage,
  AccountingTruckPage,
} from "@/pages/accounting/AccountingLedgerPages";
import LoginPage from "@/pages/LoginPage";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { canAccessModule, getDefaultLandingPath, type AppModule } from "@/lib/permissions";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function LoginRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  }

  if (user) {
    return <Navigate to={getDefaultLandingPath(user)} replace />;
  }

  return <LoginPage />;
}

function RequireModule({ children, module }: { children: React.ReactNode; module: AppModule }) {
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
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>;
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
              <Route path="/accounting" element={<RequireModule module="accounting"><AccountingDashboardPage /></RequireModule>} />
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
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/*" element={<ProtectedApp />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
