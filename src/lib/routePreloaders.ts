export const loadDashboardPage = () => import('@/pages/DashboardPage');
export const loadReceivePage = () => import('@/pages/ReceivePage');
export const loadHistoryPage = () => import('@/pages/HistoryPage');
export const loadExpectedBoxesPage = () => import('@/pages/ExpectedBoxesPage');
export const loadSuppliersPage = () => import('@/pages/SuppliersPage');
export const loadCarriersPage = () => import('@/pages/CarriersPage');
export const loadPricesPage = () => import('@/pages/PricesPage');
export const loadPricesPrintPage = () => import('@/pages/PricesPrintPage');
export const loadInventoryAuditPage = () => import('@/pages/InventoryAuditPage');
export const loadSettingsPage = () => import('@/pages/SettingsPage');
export const loadLoginPage = () => import('@/pages/LoginPage');
export const loadResetPasswordPage = () => import('@/pages/ResetPasswordPage');
export const loadPreviewDashboardPage = () => import('@/pages/PreviewDashboardPage');
export const loadNavbarPreviewPage = () => import('@/pages/NavbarPreviewPage');

export const loadAccountingDashboardPage = () => import('@/pages/accounting/AccountingDashboardPreviewPage');
export const loadAccountingInvoicesPage = () => import('@/pages/accounting/AccountingInvoicesPage');
export const loadAccountingImportsPage = () => import('@/pages/accounting/AccountingImportsPage');
export const loadAccountingCatalogsPage = () => import('@/pages/accounting/AccountingCatalogsPage');
export const loadAccountingVendorsPage = () => import('@/pages/accounting/AccountingVendorsPage');
export const loadAccountingReportsPage = () => import('@/pages/accounting/AccountingReportsPage');
export const loadAccountingLedgerPages = () => import('@/pages/accounting/AccountingLedgerPages');

const ROUTE_PRELOADERS: Record<string, () => Promise<unknown>> = {
  '/': loadDashboardPage,
  '/receive': loadReceivePage,
  '/expected-boxes': loadExpectedBoxesPage,
  '/history': loadHistoryPage,
  '/suppliers': loadSuppliersPage,
  '/carriers': loadCarriersPage,
  '/prices': loadPricesPage,
  '/prices/print': loadPricesPrintPage,
  '/inventory-audit': loadInventoryAuditPage,
  '/settings': loadSettingsPage,
  '/login': loadLoginPage,
  '/reset-password': loadResetPasswordPage,
  '/preview-dashboard': loadPreviewDashboardPage,
  '/navbar-preview': loadNavbarPreviewPage,
  '/accounting': loadAccountingDashboardPage,
  '/accounting/preview': loadAccountingDashboardPage,
  '/accounting/invoices': loadAccountingInvoicesPage,
  '/accounting/paid-invoices': loadAccountingLedgerPages,
  '/accounting/reports': loadAccountingReportsPage,
  '/accounting/vendors': loadAccountingVendorsPage,
  '/accounting/credit-card-payments': loadAccountingLedgerPages,
  '/accounting/personal-bills': loadAccountingLedgerPages,
  '/accounting/truck': loadAccountingLedgerPages,
  '/accounting/imports': loadAccountingImportsPage,
  '/accounting/catalogs': loadAccountingCatalogsPage,
};

const preloadedRoutes = new Set<string>();

export function preloadRoute(path: string) {
  const preload = ROUTE_PRELOADERS[path];
  if (!preload || preloadedRoutes.has(path)) return;

  preloadedRoutes.add(path);
  void preload().catch(() => {
    preloadedRoutes.delete(path);
  });
}

export function preloadRoutes(paths: string[], stepMs = 80) {
  const uniquePaths = [...new Set(paths)];
  const timers = uniquePaths.map((path, index) => window.setTimeout(() => preloadRoute(path), index * stepMs));
  return () => timers.forEach(timer => window.clearTimeout(timer));
}
