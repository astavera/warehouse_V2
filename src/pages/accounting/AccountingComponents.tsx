import { Link, useLocation } from 'react-router-dom';
import { useEffect, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { preloadRoute } from '@/lib/routePreloaders';
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
  { to: '/accounting', label: 'Overview' },
  { to: '/accounting/invoices', label: 'Invoices' },
  { to: '/accounting/paid-invoices', label: 'Paid invoices' },
  { to: '/accounting/reports', label: 'Reports' },
  { to: '/accounting/vendors', label: 'Vendors' },
  { to: '/accounting/credit-card-payments', label: 'Card payments' },
  { to: '/accounting/personal-bills', label: 'Personal bills' },
  { to: '/accounting/truck', label: 'Truck' },
  { to: '/accounting/imports', label: 'Imports' },
  { to: '/accounting/catalogs', label: 'Catalogs' },
];

export function AccountingTabs() {
  const { pathname } = useLocation();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      ACCOUNTING_NAV
        .filter(item => item.to !== pathname)
        .forEach(item => preloadRoute(item.to));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return (
    <nav className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200/80 bg-white/85 p-1 shadow-sm shadow-slate-950/5">
      {ACCOUNTING_NAV.map(item => (
        <Link
          key={item.to}
          to={item.to}
          onFocus={() => preloadRoute(item.to)}
          onMouseEnter={() => preloadRoute(item.to)}
          onPointerDown={() => preloadRoute(item.to)}
          className={cn(
            'whitespace-nowrap rounded-lg px-3 py-2 text-[0.8125rem] font-semibold transition-all duration-150',
            pathname === item.to
              ? 'bg-slate-950 text-white shadow-sm shadow-slate-950/15'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'
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
  variant = 'default',
  title,
}: {
  actions?: ReactNode;
  description?: string;
  title: string;
  variant?: 'default' | 'overview';
}) {
  const isOverview = variant === 'overview';

  return (
    <div className={cn(isOverview ? 'space-y-2' : 'space-y-3')}>
      <div
        className={cn(
          'flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'
        )}
      >
        <div className="min-w-0">
          <h1
            className={cn(
              'font-black leading-none tracking-normal text-slate-950',
              isOverview ? 'text-4xl sm:text-5xl' : 'text-3xl sm:text-4xl'
            )}
          >
            {title}
          </h1>
        </div>
        {actions && (
          <div
            className={cn(
              'shrink-0',
              '[&_a]:!h-9 [&_a]:!min-h-[36px] [&_button]:!h-9 [&_button]:!min-h-[36px]',
              '[&_.app-rainbow-button]:!min-w-[116px] [&_.app-rainbow-button]:!rounded-lg [&_.app-rainbow-button]:px-3 [&_.app-rainbow-button]:text-[0.8125rem]',
              '[&_.app-secondary-ghost-button]:!rounded-lg [&_.app-secondary-ghost-button]:!border-slate-200 [&_.app-secondary-ghost-button]:!bg-white/90 [&_.app-secondary-ghost-button]:!text-slate-700 [&_.app-secondary-ghost-button]:!shadow-sm [&_.app-secondary-ghost-button]:!shadow-slate-950/5',
              '[&_.app-secondary-ghost-button:hover]:!border-slate-300 [&_.app-secondary-ghost-button:hover]:!bg-slate-50 [&_.app-secondary-ghost-button:hover]:!text-slate-950',
              '[&_.app-secondary-ghost-button_svg]:!opacity-70'
            )}
          >
            {actions}
          </div>
        )}
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
