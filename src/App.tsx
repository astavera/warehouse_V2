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
import LoginPage from "@/pages/LoginPage";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function LoginRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <LoginPage />;
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
    <AppLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/receive" element={<ReceivePage />} />
        <Route path="/expected-boxes" element={<ExpectedBoxesPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/suppliers" element={<SuppliersPage />} />
        <Route path="/carriers" element={<CarriersPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
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
