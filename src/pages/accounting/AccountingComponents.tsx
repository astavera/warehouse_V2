import { Link, useLocation } from 'react-router-dom';
import { useEffect, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  formatAccountingMoney,
  hasCreditApplied,
  isDueSoon,
  isHighAmount,
  isInvoicePaid,
  isOverdue,
  type AccountingInvoice,
} from '@/lib/accounting';

const ACCOUNTING_NAV = [
  { to: '/accounting', label: 'Dashboard' },
  { to: '/accounting/invoices', label: 'Invoices' },
  { to: '/accounting/paid-invoices', label: 'Paid invoices' },
  { to: '/accounting/vendors', label: 'Vendors' },
  { to: '/accounting/credit-card-payments', label: 'Card payments' },
  { to: '/accounting/personal-bills', label: 'Personal bills' },
  { to: '/accounting/truck', label: 'Truck' },
  { to: '/accounting/imports', label: 'Imports' },
  { to: '/accounting/catalogs', label: 'Catalogs' },
];

const ACCOUNTING_ROUTE_PRELOADERS: Record<string, () => Promise<unknown>> = {
  '/accounting': () => import('@/pages/accounting/AccountingDashboardPreviewPage'),
  '/accounting/catalogs': () => import('@/pages/accounting/AccountingCatalogsPage'),
  '/accounting/credit-card-payments': () => import('@/pages/accounting/AccountingLedgerPages'),
  '/accounting/imports': () => import('@/pages/accounting/AccountingImportsPage'),
  '/accounting/invoices': () => import('@/pages/accounting/AccountingInvoicesPage'),
  '/accounting/paid-invoices': () => import('@/pages/accounting/AccountingLedgerPages'),
  '/accounting/personal-bills': () => import('@/pages/accounting/AccountingLedgerPages'),
  '/accounting/truck': () => import('@/pages/accounting/AccountingLedgerPages'),
  '/accounting/vendors': () => import('@/pages/accounting/AccountingVendorsPage'),
};

function preloadAccountingRoute(path: string) {
  void ACCOUNTING_ROUTE_PRELOADERS[path]?.();
}

export function AccountingTabs() {
  const { pathname } = useLocation();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      ACCOUNTING_NAV
        .filter(item => item.to !== pathname)
        .forEach(item => preloadAccountingRoute(item.to));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return (
    <nav className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/30 p-1">
      {ACCOUNTING_NAV.map(item => (
        <Link
          key={item.to}
          to={item.to}
          onFocus={() => preloadAccountingRoute(item.to)}
          onMouseEnter={() => preloadAccountingRoute(item.to)}
          className={cn(
            'whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors',
            pathname === item.to
              ? 'bg-white text-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-white/70 hover:text-foreground'
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function AccountingPageHeader({
  actions,
  description,
  title,
}: {
  actions?: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      <AccountingTabs />
    </div>
  );
}

export function LoadingState({ label = 'Loading accounting data...' }: { label?: string }) {
  return <div className="py-16 text-center text-sm text-muted-foreground">{label}</div>;
}

export function EmptyState({ label }: { label: string }) {
  return <div className="rounded-lg border bg-muted/20 py-12 text-center text-sm text-muted-foreground">{label}</div>;
}

export function MoneyText({ value }: { value: string | number | null | undefined }) {
  return <span className="tabular-nums">{formatAccountingMoney(value)}</span>;
}

export function InvoiceStatusBadges({ invoice }: { invoice: AccountingInvoice }) {
  const paid = isInvoicePaid(invoice);
  const overdue = isOverdue(invoice);
  const dueSoon = isDueSoon(invoice, 7);
  const credit = hasCreditApplied(invoice);
  const high = isHighAmount(invoice);
  return (
    <div className="flex flex-wrap gap-1">
      <Badge variant={paid ? 'default' : 'secondary'}>{paid ? 'Paid' : 'Pending'}</Badge>
      {overdue && <Badge variant="destructive">Overdue</Badge>}
      {!overdue && dueSoon && <Badge variant="outline">Due soon</Badge>}
      {credit && <Badge variant="outline">Credit applied</Badge>}
      {high && <Badge variant="outline">High amount</Badge>}
    </div>
  );
}

export function SummaryCard({
  label,
  tone = 'default',
  value,
}: {
  label: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  value: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div
          className={cn(
            'text-2xl font-bold',
            tone === 'success' && 'text-emerald-700',
            tone === 'warning' && 'text-amber-700',
            tone === 'danger' && 'text-rose-700'
          )}
        >
          {value}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
