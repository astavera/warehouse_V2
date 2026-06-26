import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  FileSpreadsheet,
  PackageCheck,
  RefreshCw,
  ReceiptText,
  TrendingUp,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAccountingDashboard, useAccountingInvoicePayments, useAccountingInvoices } from '@/hooks/useAccountingData';
import { useExpectedBoxes, type ExpectedBox } from '@/hooks/useExpectedBoxes';
import { useSuppliers, useTodayBatches, type BatchWithItems } from '@/hooks/useSupabaseData';
import { cn } from '@/lib/utils';
import {
  centsToDecimalString,
  decimalStringToCents,
  formatAccountingMoney,
  isDueWithin,
  isInvoicePaid,
  isOverdue,
  invoiceFinalAmount,
  normalizeText,
  type AccountingInvoice,
  type AccountingInvoicePayment,
  type VendorBalanceSummary,
} from '@/lib/accounting';
import {
  AccountingPageHeader,
  EmptyState,
  InvoiceStatusBadges,
  LoadingState,
  MoneyText,
} from './AccountingComponents';

type Tone = 'danger' | 'default' | 'success' | 'warning';

type Kpi = {
  actionLabel: string;
  detail: string;
  href: string;
  icon: LucideIcon;
  label: string;
  tone: Tone;
  value: string | number | null | undefined;
};

type QuickAction = {
  actionLabel: string;
  eyebrow: string;
  helper: string;
  href: string;
  icon: LucideIcon;
  label: string;
  tone: Tone;
  value: string | number | null | undefined;
  valueKind?: 'money' | 'text';
  valueLabel?: string;
};

type PressureMetricKey = 'amount' | 'cumulative' | 'remaining' | 'urgent';

type PressureMetric = {
  color: string;
  description: string;
  key: PressureMetricKey;
  label: string;
  value: string;
};

type WarehouseInvoiceRow = {
  deliveredCount: number;
  hasInvoice: boolean;
  invoiceAmount: string;
  invoiceCount: number;
  latestAt: string | null;
  receivedCount: number;
  supplierName: string;
  trackingCount: number;
};

type WarehouseActivityRow = Omit<WarehouseInvoiceRow, 'hasInvoice' | 'invoiceAmount' | 'invoiceCount'>;

const HIDDEN_WAREHOUSE_ARRIVALS_KEY = 'accounting.preview.hiddenWarehouseArrivals';

function moneySubtract(left: string | number | null | undefined, right: string | number | null | undefined) {
  const cents = decimalStringToCents(left) - decimalStringToCents(right);
  return centsToDecimalString(cents < 0n ? 0n : cents);
}

function moneyAfter(values: Array<string | number | null | undefined>, subtractValues: Array<string | number | null | undefined>) {
  const cents =
    values.reduce((sum, value) => sum + decimalStringToCents(value), 0n) -
    subtractValues.reduce((sum, value) => sum + decimalStringToCents(value), 0n);
  return centsToDecimalString(cents < 0n ? 0n : cents);
}

function compactMoneyTick(value: string | number) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '';
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 0,
    notation: 'compact',
    style: 'currency',
  }).format(numericValue);
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

function expectedBoxArrivalDate(box: ExpectedBox) {
  return box.warehouse_received_at || box.carrier_delivered_at || box.carrier_eta || box.updated_at || box.created_at || null;
}

function warehouseSupplierKey(supplierName: string) {
  return normalizeText(supplierName) || supplierName;
}

function warehouseArrivalKey(row: Pick<WarehouseInvoiceRow, 'latestAt' | 'supplierName'>) {
  return `${warehouseSupplierKey(row.supplierName)}:${row.latestAt?.slice(0, 10) || 'no-date'}`;
}

function readHiddenWarehouseArrivals() {
  if (typeof window === 'undefined') return [];
  try {
    const value = window.localStorage.getItem(HIDDEN_WAREHOUSE_ARRIVALS_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeHiddenWarehouseArrivals(keys: Set<string>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(HIDDEN_WAREHOUSE_ARRIVALS_KEY, JSON.stringify([...keys]));
}

function vendorNamesLikelyMatch(left: string, right: string) {
  const leftKey = normalizeText(left);
  const rightKey = normalizeText(right);
  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;
  if (leftKey.length < 4 || rightKey.length < 4) return false;
  return leftKey.includes(rightKey) || rightKey.includes(leftKey);
}

function invoicesForSupplier(supplierName: string, invoices: AccountingInvoice[]) {
  return invoices.filter(invoice => {
    const vendorName = invoice.accounting_vendors?.name || '';
    return vendorNamesLikelyMatch(supplierName, vendorName);
  });
}

function createInvoiceSearchForSupplier(supplierName: string) {
  return `?${new URLSearchParams({
    create: '1',
    source: 'warehouse',
    vendorName: supplierName,
  }).toString()}`;
}

function buildExpectedBoxActivityRows(boxes: ExpectedBox[]): WarehouseActivityRow[] {
  const relevantBoxes = boxes.filter(
    box => box.status === 'received' || box.status === 'delivered' || Boolean(box.warehouse_received_at || box.carrier_delivered_at)
  );
  const rows = new Map<string, WarehouseActivityRow>();

  relevantBoxes.forEach(box => {
    const supplierName = box.suppliers?.name || 'Unknown supplier';
    const key = warehouseSupplierKey(supplierName) || box.supplier_id || box.id;
    const arrivalDate = expectedBoxArrivalDate(box);
    const current = rows.get(key) || {
      deliveredCount: 0,
      latestAt: arrivalDate,
      receivedCount: 0,
      supplierName,
      trackingCount: 0,
    };

    current.trackingCount += 1;
    if (box.status === 'received' || box.warehouse_received_at) current.receivedCount += 1;
    if (box.status === 'delivered' || box.carrier_delivered_at) current.deliveredCount += 1;
    if (arrivalDate && (!current.latestAt || new Date(arrivalDate).getTime() > new Date(current.latestAt).getTime())) {
      current.latestAt = arrivalDate;
    }
    rows.set(key, current);
  });

  return [...rows.values()];
}

function buildReceivedBatchActivityRows(
  batches: BatchWithItems[],
  suppliers: Array<{ id: string; name: string }>
): WarehouseActivityRow[] {
  const supplierNamesById = new Map(suppliers.map(supplier => [supplier.id, supplier.name]));
  const rows = new Map<string, WarehouseActivityRow>();

  batches.forEach(batch => {
    batch.receipt_items.forEach(item => {
      const supplierName = supplierNamesById.get(item.supplier_id) || 'Unknown supplier';
      const key = warehouseSupplierKey(supplierName) || item.supplier_id || item.id;
      const current = rows.get(key) || {
        deliveredCount: 0,
        latestAt: batch.received_at,
        receivedCount: 0,
        supplierName,
        trackingCount: 0,
      };

      current.receivedCount += Math.max(0, item.package_count || 0);
      current.trackingCount += item.tracking_number ? 1 : 0;
      if (batch.received_at && (!current.latestAt || new Date(batch.received_at).getTime() > new Date(current.latestAt).getTime())) {
        current.latestAt = batch.received_at;
      }
      rows.set(key, current);
    });
  });

  return [...rows.values()];
}

function mergeWarehouseActivityRows(rows: WarehouseActivityRow[]): WarehouseActivityRow[] {
  const merged = new Map<string, WarehouseActivityRow>();

  rows.forEach(row => {
    const key = warehouseSupplierKey(row.supplierName);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...row });
      return;
    }

    current.deliveredCount = Math.max(current.deliveredCount, row.deliveredCount);
    current.receivedCount = Math.max(current.receivedCount, row.receivedCount);
    current.trackingCount = Math.max(current.trackingCount, row.trackingCount);
    if (row.latestAt && (!current.latestAt || new Date(row.latestAt).getTime() > new Date(current.latestAt).getTime())) {
      current.latestAt = row.latestAt;
    }
  });

  return [...merged.values()];
}

function addInvoiceCoverageToWarehouseRows(rows: WarehouseActivityRow[], invoices: AccountingInvoice[]): WarehouseInvoiceRow[] {
  return rows
    .map(row => {
      const matchedInvoices = invoicesForSupplier(row.supplierName, invoices);
      const invoiceAmount = matchedInvoices.reduce(
        (sum, invoice) => sum + decimalStringToCents(invoiceFinalAmount(invoice)),
        0n
      );
      return {
        ...row,
        hasInvoice: matchedInvoices.length > 0,
        invoiceAmount: centsToDecimalString(invoiceAmount),
        invoiceCount: matchedInvoices.length,
      };
    })
    .sort((a, b) => {
      const latestDiff = new Date(b.latestAt || 0).getTime() - new Date(a.latestAt || 0).getTime();
      if (latestDiff !== 0) return latestDiff;
      if (a.hasInvoice !== b.hasInvoice) return a.hasInvoice ? 1 : -1;
      return a.supplierName.localeCompare(b.supplierName);
    });
}

function buildWarehouseInvoiceRows(
  boxes: ExpectedBox[],
  batches: BatchWithItems[],
  suppliers: Array<{ id: string; name: string }>,
  invoices: AccountingInvoice[]
): WarehouseInvoiceRow[] {
  const activityRows = mergeWarehouseActivityRows([
    ...buildExpectedBoxActivityRows(boxes),
    ...buildReceivedBatchActivityRows(batches, suppliers),
  ]);
  return addInvoiceCoverageToWarehouseRows(activityRows, invoices);
}

function toneAccentClasses(tone: Tone) {
  return cn(
    tone === 'danger' && 'bg-rose-500 text-rose-400',
    tone === 'warning' && 'bg-amber-400 text-amber-300',
    tone === 'success' && 'bg-emerald-400 text-emerald-300',
    tone === 'default' && 'bg-sky-400 text-sky-300'
  );
}

function toneDarkIconClasses(tone: Tone) {
  return cn(
    tone === 'danger' && 'border-rose-400/35 bg-rose-400/10 text-rose-200',
    tone === 'warning' && 'border-amber-300/35 bg-amber-300/10 text-amber-100',
    tone === 'success' && 'border-emerald-300/35 bg-emerald-300/10 text-emerald-100',
    tone === 'default' && 'border-sky-300/35 bg-sky-300/10 text-sky-100'
  );
}

function toneTextClasses(tone: Tone) {
  return cn(
    tone === 'danger' && 'text-rose-700',
    tone === 'warning' && 'text-amber-700',
    tone === 'success' && 'text-emerald-700',
    tone === 'default' && 'text-sky-700'
  );
}

function toneBorderClasses(tone: Tone) {
  return cn(
    tone === 'danger' && 'border-rose-200 hover:border-rose-300',
    tone === 'warning' && 'border-amber-200 hover:border-amber-300',
    tone === 'success' && 'border-emerald-200 hover:border-emerald-300',
    tone === 'default' && 'border-sky-200 hover:border-sky-300'
  );
}

function tonePillClasses(tone: Tone) {
  return cn(
    tone === 'danger' && 'bg-rose-600 text-white shadow-rose-900/10 group-hover:bg-rose-700',
    tone === 'warning' && 'bg-amber-500 text-white shadow-amber-900/10 group-hover:bg-amber-600',
    tone === 'success' && 'bg-emerald-500 text-white shadow-emerald-900/10 group-hover:bg-emerald-600',
    tone === 'default' && 'bg-sky-500 text-white shadow-sky-900/10 group-hover:bg-sky-600'
  );
}

function toneCardTheme(tone: Tone) {
  if (tone === 'danger') {
    return {
      accent: '244, 63, 94',
      glow: 'rgba(244, 63, 94, 0.22)',
      soft: 'rgba(255, 241, 242, 0.74)',
    };
  }
  if (tone === 'warning') {
    return {
      accent: '245, 158, 11',
      glow: 'rgba(245, 158, 11, 0.22)',
      soft: 'rgba(255, 251, 235, 0.78)',
    };
  }
  if (tone === 'success') {
    return {
      accent: '16, 185, 129',
      glow: 'rgba(16, 185, 129, 0.2)',
      soft: 'rgba(236, 253, 245, 0.76)',
    };
  }
  return {
    accent: '14, 165, 233',
    glow: 'rgba(14, 165, 233, 0.2)',
    soft: 'rgba(240, 249, 255, 0.78)',
  };
}

function riskCardStyle(tone: Tone): CSSProperties {
  const theme = toneCardTheme(tone);
  return {
    backgroundImage: `
      radial-gradient(circle at 1px 1px, rgba(${theme.accent}, 0.14) 1px, transparent 0),
      radial-gradient(circle at 92% 0%, rgba(${theme.accent}, 0.12), transparent 28%),
      linear-gradient(135deg, rgba(255,255,255,0.99), rgba(255,255,255,0.96) 58%, ${theme.soft})
    `,
    backgroundSize: '0.5rem 0.5rem, 100% 100%, 100% 100%',
    boxShadow: `0 20px 44px -34px ${theme.glow}`,
  };
}

const riskCardVariants: Variants = {
  hidden: { opacity: 0, scale: 0.98, y: 10 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.32, ease: 'easeOut' },
    y: 0,
  },
};

function KpiTile({ item }: { item: Kpi }) {
  const Icon = item.icon;

  return (
    <Card className="group overflow-hidden border-slate-800/80 bg-slate-950 p-0 text-white shadow-sm transition-shadow hover:shadow-lg">
      <CardContent className="relative min-h-[132px] overflow-hidden bg-gradient-to-br from-slate-950 via-teal-950 to-slate-900 p-4">
        <div className={cn('absolute inset-x-0 top-0 h-1', toneAccentClasses(item.tone))} />
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.18) 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase text-slate-300">{item.label}</p>
              <span className={cn('h-2 w-2 rounded-full shadow-[0_0_16px_currentColor]', toneAccentClasses(item.tone))} />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-white tabular-nums">
              {typeof item.value === 'number' ? item.value : <MoneyText value={item.value} />}
            </p>
          </div>
          <div className={cn('rounded-md border p-2 shadow-sm', toneDarkIconClasses(item.tone))}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="relative mt-3 min-h-4 text-xs leading-4 text-slate-300">{item.detail}</p>
      </CardContent>
      <div className="border-t border-white/10 bg-slate-950 px-4 py-2.5">
        <Link to={item.href} className="inline-flex items-center gap-1 text-xs font-medium text-slate-200 hover:text-white">
          {item.actionLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </Card>
  );
}

function QuickActionTile({ action }: { action: QuickAction }) {
  const Icon = action.icon;

  return (
    <motion.div animate="visible" initial="hidden" variants={riskCardVariants} whileHover={{ y: -3 }}>
      <Link
        to={action.href}
        className={cn(
          'group relative flex min-h-[190px] overflow-hidden rounded-2xl border bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          toneBorderClasses(action.tone)
        )}
        style={riskCardStyle(action.tone)}
      >
        <Icon className={cn('absolute right-6 top-6 h-5 w-5', toneTextClasses(action.tone))} />

        <div className="relative flex w-full flex-col justify-between pr-12">
          <div>
            <p className={cn('text-xs font-bold uppercase tracking-wide', toneTextClasses(action.tone))}>
              {action.eyebrow}
            </p>
            <h3 className="mt-2 text-base font-bold leading-5 text-slate-950">{action.label}</h3>
            <p className="mt-2 max-w-[84%] text-sm leading-5 text-slate-600">{action.helper}</p>
          </div>

          <div className="my-5 h-px w-full bg-slate-200/80" />

          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p
                className={cn(
                  'font-black tracking-tight text-slate-950 tabular-nums',
                  action.valueKind === 'text' ? 'text-4xl' : 'text-3xl'
                )}
              >
                {action.valueKind === 'text' ? action.value : <MoneyText value={action.value} />}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {action.valueLabel || (action.valueKind === 'text' ? 'vendor signals' : 'amount to track')}
              </p>
            </div>
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-full px-4 py-2 text-xs font-bold shadow-sm transition-all group-hover:-translate-y-0.5',
                tonePillClasses(action.tone)
              )}
            >
              {action.actionLabel}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function chartTooltipStyle() {
  return {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 8,
    boxShadow: '0 10px 28px rgba(15, 23, 42, 0.12)',
  };
}

function ScheduleBadge({ tone }: { tone: Tone }) {
  if (tone === 'danger') return <Badge variant="destructive">Pay now</Badge>;
  if (tone === 'warning') return <Badge variant="secondary">Queued</Badge>;
  if (tone === 'success') return <Badge variant="outline">Planned</Badge>;
  return <Badge variant="outline">Review</Badge>;
}

function vendorProgress(row: VendorBalanceSummary, maxAmount: bigint) {
  if (maxAmount <= 0n) return 0;
  return Math.max(8, Math.min(100, Math.round((Number(decimalStringToCents(row.totalAmount)) / Number(maxAmount)) * 100)));
}

function invoiceLabel(invoice: AccountingInvoice) {
  const vendor = invoice.accounting_vendors?.name || 'No vendor';
  const invoiceNumber = invoice.invoice_number || 'No invoice';
  return `${vendor} - ${invoiceNumber}`.slice(0, 46);
}

function invoiceNumberLabel(invoice: AccountingInvoice) {
  return (invoice.invoice_number || '')
    .split(/[\n,]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .join(', ') || 'No invoice #';
}

function invoiceLink(invoice: AccountingInvoice | null | undefined) {
  if (!invoice) return '/accounting/invoices';
  return `/accounting/invoices?${new URLSearchParams({ invoiceId: invoice.id }).toString()}`;
}

function moneySum(values: Array<string | number | null | undefined>) {
  return centsToDecimalString(values.reduce((sum, value) => sum + decimalStringToCents(value), 0n));
}

function rawPaymentKind(payment: AccountingInvoicePayment) {
  const rawPayload = payment.raw_payload as Record<string, unknown> | null | undefined;
  const kind = rawPayload?.payment_method_kind;
  return typeof kind === 'string' ? normalizeText(kind) : '';
}

function paymentKind(payment: AccountingInvoicePayment): 'check' | 'credit_card' | 'other' {
  const rawKind = rawPaymentKind(payment);
  const methodName = normalizeText(payment.accounting_payment_methods?.name);
  const accountName = normalizeText(payment.accounting_accounts?.name);
  const status = normalizeText(payment.status);
  const combined = `${rawKind} ${methodName} ${accountName} ${status}`;

  if (combined.includes('credit card') || combined.includes('creditcard') || combined.includes('card')) {
    return 'credit_card';
  }
  if (payment.check_number?.trim()) return 'check';
  if (combined.includes('check') || combined.includes('checking') || combined.includes('bank check')) {
    return 'check';
  }
  return 'other';
}

function paymentReference(payment: AccountingInvoicePayment, kind: 'check' | 'credit_card') {
  if (kind === 'check' && payment.check_number?.trim()) {
    const checks = payment.check_number.split(/\r?\n/).map(row => row.trim()).filter(Boolean).slice(0, 2);
    return checks.length ? `Check ${checks.join(', ')}` : 'Check payment';
  }
  if (payment.accounting_accounts?.name) return payment.accounting_accounts.name;
  if (payment.reference_number) return payment.reference_number;
  return payment.accounting_payment_methods?.name || payment.status || 'Payment';
}

export default function AccountingDashboardPreviewPage() {
  const { data, isLoading, isFetching, refetch } = useAccountingDashboard();
  const { data: invoiceRows = [], isLoading: invoicesLoading } = useAccountingInvoices();
  const { data: invoicePaymentRows = [], isLoading: paymentsLoading } = useAccountingInvoicePayments();
  const { boxes: expectedBoxes, loading: expectedBoxesLoading } = useExpectedBoxes();
  const { batches: todayBatches, loading: todayBatchesLoading } = useTodayBatches();
  const { suppliers, loading: suppliersLoading } = useSuppliers();
  const [selectedPressureMetric, setSelectedPressureMetric] = useState<PressureMetricKey>('amount');
  const [hiddenWarehouseArrivalKeys, setHiddenWarehouseArrivalKeys] = useState(
    () => new Set(readHiddenWarehouseArrivals())
  );
  const summary = data?.summary;
  const vendorRows = data?.vendorBalances || [];
  const vendorRiskCount = vendorRows.filter(vendor =>
    decimalStringToCents(vendor.overdueAmount) > 0n || decimalStringToCents(vendor.dueNext15Amount) > 0n
  ).length;
  const overdueAmountCents = decimalStringToCents(summary?.overdueAmount);
  const dueThisWeekCents = decimalStringToCents(summary?.dueNext7Amount);
  const dueNext15Cents = decimalStringToCents(summary?.dueNext15Amount);
  const urgentPaymentWindow = moneyAfter([summary?.overdueAmount, summary?.dueNext15Amount], []);
  const dashboardInvoices = data?.invoices?.length ? data.invoices : invoiceRows;
  const highestOverdueInvoice = [...dashboardInvoices]
    .filter(invoice => isOverdue(invoice))
    .sort((left, right) => {
      const leftAmount = decimalStringToCents(invoiceFinalAmount(left));
      const rightAmount = decimalStringToCents(invoiceFinalAmount(right));
      if (leftAmount !== rightAmount) return leftAmount > rightAmount ? -1 : 1;
      return invoiceLabel(left).localeCompare(invoiceLabel(right));
    })[0];
  const highestOverdueVendor = highestOverdueInvoice?.accounting_vendors?.name || 'No vendor';
  const highestOverdueNumber = highestOverdueInvoice ? invoiceNumberLabel(highestOverdueInvoice) : '';

  const kpis: Kpi[] = [
    {
      actionLabel: 'Open invoices',
      detail: `${summary?.pendingCount || 0} open invoices`,
      href: '/accounting/invoices',
      icon: ReceiptText,
      label: 'To pay',
      tone: 'warning',
      value: summary?.pendingAmount || '0.00',
    },
    {
      actionLabel: 'Review overdue',
      detail: `${summary?.overdueCount || 0} invoices past due`,
      href: '/accounting/invoices',
      icon: AlertTriangle,
      label: 'Overdue',
      tone: 'danger',
      value: summary?.overdueAmount || '0.00',
    },
    {
      actionLabel: 'Open due list',
      detail: `${summary?.dueSoonCount || 0} invoices due in 7 days`,
      href: '/accounting/invoices',
      icon: CalendarClock,
      label: 'Due this week',
      tone: dueThisWeekCents > 0n ? 'warning' : 'default',
      value: summary?.dueNext7Amount || '0.00',
    },
    {
      actionLabel: 'Paid invoices',
      detail: `${summary?.paidCount || 0} paid invoices in scope`,
      href: '/accounting/paid-invoices',
      icon: CheckCircle2,
      label: 'Paid this month',
      tone: 'success',
      value: summary?.paidThisMonth || '0.00',
    },
  ];

  const quickActions: QuickAction[] = [
    {
      actionLabel: highestOverdueInvoice ? 'Open invoice' : 'Review overdue',
      eyebrow: 'Priority queue',
      helper: highestOverdueInvoice
        ? `${highestOverdueVendor} / ${highestOverdueNumber}`
        : `${summary?.overdueCount || 0} invoices past due`,
      href: invoiceLink(highestOverdueInvoice),
      icon: AlertTriangle,
      label: highestOverdueInvoice ? 'Highest overdue invoice' : 'Pay overdue',
      tone: overdueAmountCents > 0n ? 'danger' : 'success',
      value: highestOverdueInvoice ? invoiceFinalAmount(highestOverdueInvoice) : summary?.overdueAmount || '0.00',
      valueLabel: highestOverdueInvoice ? 'invoice amount overdue' : 'amount to track',
    },
    {
      actionLabel: 'Open due list',
      eyebrow: 'Due date',
      helper: `${summary?.dueSoonCount || 0} invoices due in 7 days`,
      href: '/accounting/invoices',
      icon: CalendarClock,
      label: 'Due this week',
      tone: dueThisWeekCents > 0n ? 'warning' : 'default',
      value: summary?.dueNext7Amount || '0.00',
    },
    {
      actionLabel: 'Plan checks',
      eyebrow: 'Check run',
      helper: 'Plan checks before due dates',
      href: '/accounting/invoices',
      icon: ReceiptText,
      label: 'Due in 15 days',
      tone: dueNext15Cents > 0n ? 'default' : 'success',
      value: summary?.dueNext15Amount || '0.00',
    },
    {
      actionLabel: 'Review vendors',
      eyebrow: 'Vendor risk',
      helper: 'vendors with overdue or upcoming balances',
      href: '/accounting/vendors',
      icon: TrendingUp,
      label: 'Vendor review',
      tone: vendorRiskCount ? 'danger' : 'success',
      value: vendorRiskCount,
      valueKind: 'text',
    },
  ];

  const agingData = summary
    ? [
        { amount: Number(summary.overdueAmount), bucket: 'Overdue' },
        { amount: Number(summary.dueNext7Amount), bucket: '0-7 days' },
        { amount: Number(moneySubtract(summary.dueNext15Amount, summary.dueNext7Amount)), bucket: '8-15 days' },
        { amount: Number(moneySubtract(summary.dueNext30Amount, summary.dueNext15Amount)), bucket: '16-30 days' },
        {
          amount: Number(moneyAfter([summary.pendingAmount], [summary.overdueAmount, summary.dueNext30Amount])),
          bucket: '31+ days',
        },
      ]
    : [];

  let runningPressureAmount = 0;
  const totalPendingAmount = Number(summary?.pendingAmount || 0);
  const pressureChartData = agingData.map((row, index) => {
    runningPressureAmount += row.amount;
    return {
      ...row,
      cumulative: runningPressureAmount,
      remaining: Math.max(totalPendingAmount - runningPressureAmount, 0),
      urgent: index <= 2 ? row.amount : 0,
    };
  });

  const pressureMetrics: PressureMetric[] = [
    {
      color: '#0f766e',
      description: 'Open dollars by due bucket',
      key: 'amount',
      label: 'Due buckets',
      value: summary?.pendingAmount || '0.00',
    },
    {
      color: '#dc2626',
      description: 'Overdue through 15-day window',
      key: 'urgent',
      label: 'Urgent to pay',
      value: urgentPaymentWindow,
    },
    {
      color: '#2563eb',
      description: 'Running exposure by date window',
      key: 'cumulative',
      label: 'Cumulative',
      value: summary?.pendingAmount || '0.00',
    },
    {
      color: '#7c3aed',
      description: 'Exposure left after each bucket',
      key: 'remaining',
      label: 'Remaining',
      value: moneyAfter([summary?.pendingAmount], [summary?.overdueAmount, summary?.dueNext15Amount]),
    },
  ];
  const selectedPressure = pressureMetrics.find(metric => metric.key === selectedPressureMetric) || pressureMetrics[0];

  const scheduleRows = summary
    ? [
        {
          amount: summary.overdueAmount,
          count: summary.overdueCount,
          label: 'Invoices already past due',
          title: 'Overdue',
          tone: 'danger' as Tone,
        },
        {
          amount: summary.dueNext7Amount,
          count: summary.dueSoonCount,
          label: 'Due in the next 7 days',
          title: 'This week',
          tone: 'warning' as Tone,
        },
        {
          amount: summary.dueNext15Amount,
          count: null,
          label: 'Due inside the 15 day payment window',
          title: 'Next 15 days',
          tone: 'default' as Tone,
        },
        {
          amount: summary.dueNext30Amount,
          count: null,
          label: 'Plan checks and card payments ahead',
          title: 'Next 30 days',
          tone: 'success' as Tone,
        },
      ]
    : [];

  const maxVendorAmount = vendorRows.reduce((max, row) => {
    const amount = decimalStringToCents(row.totalAmount);
    return amount > max ? amount : max;
  }, 0n);

  const checkPayments = invoicePaymentRows.filter(payment => paymentKind(payment) === 'check');
  const creditCardPayments = invoicePaymentRows.filter(payment => paymentKind(payment) === 'credit_card');
  const paymentMethodGroups = [
    {
      count: checkPayments.length,
      href: '/accounting/paid-invoices',
      icon: Banknote,
      label: 'Checks',
      rows: checkPayments.slice(0, 4),
      total: moneySum(checkPayments.map(payment => payment.amount_paid)),
      tone: 'emerald',
    },
    {
      count: creditCardPayments.length,
      href: '/accounting/paid-invoices',
      icon: CreditCard,
      label: 'Credit cards',
      rows: creditCardPayments.slice(0, 4),
      total: moneySum(creditCardPayments.map(payment => payment.amount_paid)),
      tone: 'sky',
    },
  ];
  const topOverdueVendors = [...vendorRows]
    .filter(vendor => decimalStringToCents(vendor.overdueAmount) > 0n)
    .sort((left, right) => {
      const leftAmount = decimalStringToCents(left.overdueAmount);
      const rightAmount = decimalStringToCents(right.overdueAmount);
      if (leftAmount === rightAmount) return left.vendorName.localeCompare(right.vendorName);
      return leftAmount > rightAmount ? -1 : 1;
    })
    .slice(0, 3);
  const paymentWindowVendorRows = [
    ...dashboardInvoices
      .filter(invoice => {
        const vendorTerms = invoice.accounting_vendors?.payment_terms_days || 0;
        return !isInvoicePaid(invoice) && isDueWithin(invoice, 15) && vendorTerms > 0;
      })
      .reduce((rows, invoice) => {
        const vendorName = invoice.accounting_vendors?.name || 'No vendor';
        const key = normalizeText(vendorName) || vendorName;
        const current = rows.get(key) || { invoiceCount: 0, vendorName };
        current.invoiceCount += 1;
        rows.set(key, current);
        return rows;
      }, new Map<string, { invoiceCount: number; vendorName: string }>())
      .values(),
  ]
    .sort((left, right) => {
      if (left.invoiceCount === right.invoiceCount) return left.vendorName.localeCompare(right.vendorName);
      return right.invoiceCount - left.invoiceCount;
    })
    .slice(0, 5);
  const largestOpenInvoices = [...dashboardInvoices]
    .filter(invoice => !isInvoicePaid(invoice))
    .sort((left, right) => {
      const leftAmount = decimalStringToCents(invoiceFinalAmount(left));
      const rightAmount = decimalStringToCents(invoiceFinalAmount(right));
      if (leftAmount === rightAmount) return invoiceLabel(left).localeCompare(invoiceLabel(right));
      return leftAmount > rightAmount ? -1 : 1;
    })
    .slice(0, 3);
  const warehouseInvoiceRows = buildWarehouseInvoiceRows(expectedBoxes, todayBatches, suppliers, dashboardInvoices);
  const warehouseVisibleRows = warehouseInvoiceRows.filter(
    row => !hiddenWarehouseArrivalKeys.has(warehouseArrivalKey(row))
  );
  const hiddenWarehouseArrivalCount = warehouseInvoiceRows.length - warehouseVisibleRows.length;
  const warehouseRowsMissingInvoices = warehouseVisibleRows.filter(row => !row.hasInvoice);
  const hideWarehouseArrival = (row: WarehouseInvoiceRow) => {
    setHiddenWarehouseArrivalKeys(current => {
      const next = new Set(current);
      next.add(warehouseArrivalKey(row));
      writeHiddenWarehouseArrivals(next);
      return next;
    });
  };
  const restoreHiddenWarehouseArrivals = () => {
    const next = new Set<string>();
    writeHiddenWarehouseArrivals(next);
    setHiddenWarehouseArrivalKeys(next);
  };

  return (
    <div className="space-y-5">
      <AccountingPageHeader
        title="Overview"
        variant="overview"
        actions={
          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap lg:justify-end">
            <Button
              variant="outline"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="!h-9 !min-h-[36px] gap-1.5 !rounded-lg !border-slate-200 !bg-white/90 px-3 text-[0.8125rem] font-semibold !text-slate-700 !shadow-sm !shadow-slate-950/5 hover:!border-slate-300 hover:!bg-slate-50 hover:!text-slate-950 [&_svg]:!opacity-70"
            >
              <RefreshCw className={isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Refresh
            </Button>
            <Button className="accounting-rainbow-button !h-9 !min-h-[36px] !min-w-[116px] gap-1.5 !rounded-lg px-3 text-[0.8125rem]" asChild>
              <Link to="/accounting/imports">
                <FileSpreadsheet className="h-4 w-4" />
                Imports
              </Link>
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <LoadingState />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map(item => (
              <KpiTile item={item} key={item.label} />
            ))}
          </section>

          <section className="grid gap-3 2xl:grid-cols-[minmax(280px,0.45fr)_minmax(0,1.55fr)]">
            <Card className="border-primary/20 bg-gradient-to-br from-sky-50 via-background to-emerald-50">
              <CardContent className="h-full p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CalendarClock className="h-4 w-4 text-primary" />
                  Terms due next 15d
                </div>
                <p className="mt-2 text-xs leading-4 text-muted-foreground">Vendors with terms and invoices due in 15 days.</p>
                <div className="mt-4 space-y-2">
                  {invoicesLoading ? (
                    <div className="rounded-md border bg-background/75 px-3 py-3 text-sm text-muted-foreground">
                      Loading vendors...
                    </div>
                  ) : paymentWindowVendorRows.length ? (
                    paymentWindowVendorRows.map(vendor => (
                      <div
                        className="flex items-center justify-between gap-3 rounded-md border bg-background/80 px-3 py-2.5"
                        key={vendor.vendorName}
                      >
                        <p className="min-w-0 truncate text-sm font-semibold text-slate-950">{vendor.vendorName}</p>
                        <Badge variant="secondary" className="shrink-0">
                          {vendor.invoiceCount} invoice{vendor.invoiceCount === 1 ? '' : 's'}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-md border bg-background/75 px-3 py-3 text-sm text-muted-foreground">
                      No vendors with terms due in the next 15 days.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {quickActions.map(action => (
                <QuickActionTile action={action} key={action.label} />
              ))}
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
            <Card className="flex flex-col overflow-hidden border-slate-200/80 shadow-sm">
              <CardHeader className="border-b bg-gradient-to-r from-slate-950 via-teal-950 to-slate-900 p-0 text-white">
                <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <CalendarClock className="h-4 w-4 text-teal-200" />
                      Payment pressure
                    </CardTitle>
                    <CardDescription className="text-slate-300">Due-date view with urgency signals and payment exposure</CardDescription>
                  </div>
                  <Badge variant="secondary" className="gap-1.5 bg-white/10 text-white hover:bg-white/15">
                    Pending <MoneyText value={summary?.pendingAmount || '0.00'} />
                  </Badge>
                </div>
                <div className="grid border-t border-white/10 sm:grid-cols-2 xl:grid-cols-4">
                  {pressureMetrics.map(metric => {
                    const isSelected = metric.key === selectedPressureMetric;
                    return (
                      <button
                        className={cn(
                          'border-t border-white/10 px-4 py-3 text-left transition-colors first:border-t-0 sm:border-l sm:first:border-l-0 sm:[&:nth-child(2)]:border-t-0 xl:border-t-0',
                          isSelected ? 'bg-white/12' : 'hover:bg-white/8'
                        )}
                        key={metric.key}
                        onClick={() => setSelectedPressureMetric(metric.key)}
                        type="button"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-300">{metric.label}</span>
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: metric.color }}
                          />
                        </div>
                        <p className="mt-1 text-lg font-bold tracking-tight tabular-nums">
                          <MoneyText value={metric.value} />
                        </p>
                        <p className="mt-1 truncate text-[11px] text-slate-400">{metric.description}</p>
                      </button>
                    );
                  })}
                </div>
              </CardHeader>
              <CardContent className="relative flex flex-1 flex-col overflow-hidden bg-gradient-to-b from-slate-50 via-background to-teal-50/60 p-0">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-4 rounded-lg opacity-70"
                  style={{
                    backgroundImage: 'radial-gradient(circle, rgba(100, 116, 139, 0.25) 1px, transparent 1.5px)',
                    backgroundSize: '18px 18px',
                    maskImage: 'linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)',
                  }}
                />
                {pressureChartData.length ? (
                  <div className="relative min-h-[330px] flex-1 p-4 pt-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={pressureChartData} margin={{ bottom: 8, left: 4, right: 18, top: 30 }}>
                      <defs>
                        <linearGradient id="pressureSelectedGradient" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor={selectedPressure.color} stopOpacity={0.95} />
                          <stop offset="100%" stopColor={selectedPressure.color} stopOpacity={0.24} />
                        </linearGradient>
                        <filter id="pressureLineGlow" x="-50%" y="-50%" width="200%" height="200%">
                          <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor={selectedPressure.color} floodOpacity="0.35" />
                        </filter>
                      </defs>
                      <CartesianGrid strokeDasharray="4 8" stroke="hsl(var(--border))" strokeOpacity={0.55} vertical={false} />
                      <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={compactMoneyTick} tick={{ fontSize: 12 }} width={72} />
                      <RechartsTooltip
                        contentStyle={chartTooltipStyle()}
                        cursor={{ fill: 'hsl(var(--muted))', opacity: 0.35 }}
                        formatter={(value: number) => [formatAccountingMoney(value), selectedPressure.label]}
                      />
                      <ReferenceLine y={0} stroke="hsl(var(--border))" />
                      <Bar dataKey={selectedPressureMetric} radius={[10, 10, 4, 4]} barSize={44}>
                        <LabelList
                          dataKey={selectedPressureMetric}
                          formatter={(value: number) => (value > 0 ? compactMoneyTick(value) : '')}
                          position="top"
                          className="fill-muted-foreground text-[11px]"
                        />
                        {pressureChartData.map(row => (
                          <Cell fill="url(#pressureSelectedGradient)" key={row.bucket} />
                        ))}
                      </Bar>
                      <Line
                        activeDot={{ fill: selectedPressure.color, r: 6, stroke: 'white', strokeWidth: 2 }}
                        dataKey={selectedPressureMetric}
                        dot={{ fill: selectedPressure.color, r: 3, stroke: 'white', strokeWidth: 2 }}
                        filter="url(#pressureLineGlow)"
                        stroke={selectedPressure.color}
                        strokeWidth={2.5}
                        type="monotone"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="relative min-h-[330px] flex-1">
                    <EmptyState label="No aging data available." />
                  </div>
                )}
                <div className="relative border-t border-slate-200 bg-white/95 p-4 backdrop-blur">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-950">Highest exposure now</h3>
                      <p className="text-xs text-muted-foreground">Top overdue vendors and largest open invoices</p>
                    </div>
                    <Badge variant="outline" className="bg-white">
                      Live invoice data
                    </Badge>
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-md border border-rose-200 bg-gradient-to-br from-white to-rose-50/80 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-rose-600" />
                          <p className="text-xs font-semibold uppercase text-rose-700">Top overdue vendors</p>
                        </div>
                        <span className="text-[11px] text-muted-foreground">by open overdue</span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {topOverdueVendors.length ? (
                          topOverdueVendors.map((vendor, index) => (
                            <div className="flex items-center justify-between gap-3 rounded-md border border-white/70 bg-white/90 px-3 py-2 shadow-sm" key={vendor.vendorId || vendor.vendorName}>
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-700">
                                  {index + 1}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-950">{vendor.vendorName}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {vendor.invoiceCount} open invoice{vendor.invoiceCount === 1 ? '' : 's'}
                                  </p>
                                </div>
                              </div>
                              <p className="shrink-0 text-right text-sm font-bold tabular-nums text-rose-700">
                                <MoneyText value={vendor.overdueAmount} />
                              </p>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-md border bg-white/80 px-3 py-3 text-sm text-muted-foreground">
                            No overdue vendors right now.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-md border border-sky-200 bg-gradient-to-br from-white to-sky-50/80 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Banknote className="h-4 w-4 text-sky-700" />
                          <p className="text-xs font-semibold uppercase text-sky-700">Largest open invoices</p>
                        </div>
                        <span className="text-[11px] text-muted-foreground">by final amount</span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {invoicesLoading ? (
                          <div className="rounded-md border bg-white/80 px-3 py-3 text-sm text-muted-foreground">
                            Loading largest invoices...
                          </div>
                        ) : largestOpenInvoices.length ? (
                          largestOpenInvoices.map((invoice, index) => (
                            <div className="flex items-center justify-between gap-3 rounded-md border border-white/70 bg-white/90 px-3 py-2 shadow-sm" key={invoice.id}>
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">
                                  {index + 1}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-950">
                                    {invoice.accounting_vendors?.name || 'No vendor'}
                                  </p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {invoice.invoice_number || 'No invoice #'} - Due {formatShortDate(invoice.due_date)}
                                  </p>
                                </div>
                              </div>
                              <p className="shrink-0 text-right text-sm font-bold tabular-nums text-sky-700">
                                <MoneyText value={invoiceFinalAmount(invoice)} />
                              </p>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-md border bg-white/80 px-3 py-3 text-sm text-muted-foreground">
                            No open invoices right now.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <PackageCheck className="h-4 w-4 text-emerald-700" />
                  Warehouse arrivals
                </CardTitle>
                <CardDescription>Vendors received in warehouse and invoice coverage</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {expectedBoxesLoading || todayBatchesLoading || suppliersLoading ? (
                  <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                    Loading warehouse arrivals...
                  </div>
                ) : warehouseVisibleRows.length ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-md border bg-slate-50 p-3">
                        <p className="text-2xl font-bold tabular-nums">{warehouseVisibleRows.length}</p>
                        <p className="text-xs text-muted-foreground">visible vendors</p>
                      </div>
                      <div className={cn('rounded-md border p-3', warehouseRowsMissingInvoices.length ? 'border-amber-200 bg-amber-50' : 'bg-emerald-50 border-emerald-200')}>
                        <p className="text-2xl font-bold tabular-nums">{warehouseRowsMissingInvoices.length}</p>
                        <p className="text-xs text-muted-foreground">need invoice match</p>
                      </div>
                    </div>
                    {hiddenWarehouseArrivalCount > 0 && (
                      <Button variant="outline" size="sm" className="w-full" onClick={restoreHiddenWarehouseArrivals}>
                        Show hidden arrivals ({hiddenWarehouseArrivalCount})
                      </Button>
                    )}

                    <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                      <div className="sticky top-0 z-10 rounded-md border bg-white/95 px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
                        Showing {warehouseVisibleRows.length} warehouse arrivals - newest first
                      </div>
                      {warehouseVisibleRows.map(row => (
                        <div
                          className={cn(
                            'rounded-md border p-3',
                            row.hasInvoice ? 'bg-white' : 'border-amber-200 bg-amber-50/55'
                          )}
                          key={row.supplierName}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{row.supplierName}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {row.receivedCount} WH received / {row.deliveredCount} delivered / {row.trackingCount} tracking
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <Badge variant={row.hasInvoice ? 'outline' : 'secondary'}>
                                {row.hasInvoice ? 'Invoice found' : 'Needs invoice'}
                              </Badge>
                              <Button
                                aria-label={`Hide ${row.supplierName} from warehouse arrivals`}
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => hideWarehouseArrival(row)}
                                size="icon"
                                title="Hide from dashboard"
                                variant="ghost"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="text-muted-foreground">Latest {formatShortDate(row.latestAt)}</span>
                            {row.hasInvoice ? (
                              <span className="font-medium text-emerald-700">
                                {row.invoiceCount} invoice{row.invoiceCount === 1 ? '' : 's'} / <MoneyText value={row.invoiceAmount} />
                              </span>
                            ) : (
                              <Button size="sm" className="accounting-rainbow-button h-8 gap-1.5" asChild>
                                <Link
                                  to={{
                                    pathname: '/accounting/invoices',
                                    search: createInvoiceSearchForSupplier(row.supplierName),
                                  }}
                                >
                                  Enter invoice
                                  <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/expected-boxes">Open warehouse</Link>
                      </Button>
                      <Button className="accounting-rainbow-button" size="sm" asChild>
                        <Link to="/accounting/invoices">Review invoices</Link>
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <EmptyState
                      label={
                        hiddenWarehouseArrivalCount > 0
                          ? 'All warehouse arrivals are hidden from this dashboard.'
                          : 'No warehouse arrivals found yet.'
                      }
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/expected-boxes">Open warehouse</Link>
                      </Button>
                      {hiddenWarehouseArrivalCount > 0 ? (
                        <Button className="accounting-rainbow-button" size="sm" onClick={restoreHiddenWarehouseArrivals}>
                          Show hidden arrivals
                        </Button>
                      ) : (
                        <Button className="accounting-rainbow-button" size="sm" asChild>
                          <Link to="/accounting/invoices">Review invoices</Link>
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(360px,0.95fr)_minmax(0,1.05fr)]">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Vendor balances
                </CardTitle>
                <CardDescription>Top open balances with near-term risk</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {vendorRows.length ? (
                  vendorRows.slice(0, 6).map(vendor => (
                    <div className="rounded-md border p-3" key={vendor.vendorId || vendor.vendorName}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{vendor.vendorName}</p>
                          <p className="text-xs text-muted-foreground">{vendor.invoiceCount} open invoices</p>
                        </div>
                        <p className="text-right text-sm font-bold tabular-nums">
                          <MoneyText value={vendor.totalAmount} />
                        </p>
                      </div>
                      <div className="mt-3 space-y-2">
                        <Progress value={vendorProgress(vendor, maxVendorAmount)} className="h-2" />
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-muted-foreground">
                            Due 15d <MoneyText value={vendor.dueNext15Amount} />
                          </span>
                          <span
                            className={cn(
                              'font-medium',
                              decimalStringToCents(vendor.overdueAmount) > 0n ? 'text-red-700' : 'text-emerald-700'
                            )}
                          >
                            Overdue <MoneyText value={vendor.overdueAmount} />
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState label="No open vendor balances found." />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ReceiptText className="h-4 w-4 text-primary" />
                  Payments by method
                </CardTitle>
                <CardDescription>Paid invoice rows separated by checks and credit cards</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {paymentsLoading ? (
                  <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                    Loading payments...
                  </div>
                ) : checkPayments.length || creditCardPayments.length ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {paymentMethodGroups.map(group => {
                        const Icon = group.icon;
                        const isCard = group.tone === 'sky';
                        return (
                          <div
                            className={cn(
                              'rounded-md border p-3',
                              isCard ? 'border-sky-200 bg-sky-50/70' : 'border-emerald-200 bg-emerald-50/70'
                            )}
                            key={group.label}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <Icon className={cn('h-4 w-4', isCard ? 'text-sky-700' : 'text-emerald-700')} />
                                  <p className="text-xs font-semibold uppercase text-slate-600">{group.label}</p>
                                </div>
                                <p className="mt-2 text-2xl font-bold tabular-nums text-slate-950">
                                  <MoneyText value={group.total} />
                                </p>
                              </div>
                              <Badge variant="outline" className="bg-white">
                                {group.count} row{group.count === 1 ? '' : 's'}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      {paymentMethodGroups.map(group => {
                        const Icon = group.icon;
                        const isCard = group.tone === 'sky';
                        return (
                          <div className="rounded-md border bg-white" key={`${group.label}-recent`}>
                            <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <Icon className={cn('h-4 w-4', isCard ? 'text-sky-700' : 'text-emerald-700')} />
                                <p className="text-sm font-semibold">{group.label}</p>
                              </div>
                              <Button variant="ghost" size="sm" asChild className="h-7 px-2 text-xs">
                                <Link to={group.href}>Open</Link>
                              </Button>
                            </div>
                            <div className="space-y-2 p-3">
                              {group.rows.length ? (
                                group.rows.map(payment => {
                                  const kind = paymentKind(payment) === 'credit_card' ? 'credit_card' : 'check';
                                  return (
                                    <div className="rounded-md border bg-slate-50 px-3 py-2" key={payment.id}>
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-medium text-slate-950">
                                            {payment.accounting_vendors?.name || 'No vendor'}
                                          </p>
                                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                            {paymentReference(payment, kind)} - {formatShortDate(payment.payment_date)}
                                          </p>
                                        </div>
                                        <p className="shrink-0 text-right text-sm font-bold tabular-nums">
                                          <MoneyText value={payment.amount_paid} />
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="rounded-md border border-dashed bg-slate-50 px-3 py-4 text-center text-sm text-muted-foreground">
                                  No {group.label.toLowerCase()} payments found.
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <EmptyState label="No check or credit card payments found." />
                )}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(320px,0.75fr)_minmax(0,1.25fr)]">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="h-4 w-4 text-primary" />
                  Payment schedule
                </CardTitle>
                <CardDescription>Next payment decisions by urgency</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {scheduleRows.map(item => (
                  <div className="flex items-start justify-between gap-3 rounded-md border p-3" key={item.title}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{item.title}</p>
                        <ScheduleBadge tone={item.tone} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{item.label}</p>
                      {item.count != null && <p className="mt-2 text-xs text-muted-foreground">{item.count} invoices</p>}
                    </div>
                    <p className="text-right text-sm font-bold tabular-nums">
                      <MoneyText value={item.amount} />
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ReceiptText className="h-4 w-4 text-primary" />
                  Recent payments
                </CardTitle>
                <CardDescription>Compact ledger follow-up view</CardDescription>
              </CardHeader>
              <CardContent>
                {data?.recentPayments?.length ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vendor</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.recentPayments.slice(0, 8).map(payment => (
                          <TableRow key={payment.id}>
                            <TableCell className="min-w-[180px] font-medium">{payment.accounting_vendors?.name || '-'}</TableCell>
                            <TableCell>{payment.payment_date || '-'}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{payment.accounting_payment_methods?.name || payment.status || 'Payment'}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">
                              <MoneyText value={payment.amount_paid} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <EmptyState label="No recent payments found." />
                )}
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                High amount invoice watchlist
              </CardTitle>
              <CardDescription>Large unpaid items that need review before payment</CardDescription>
            </CardHeader>
            <CardContent>
              {data?.highAmountInvoices?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Final</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.highAmountInvoices.map(invoice => (
                      <TableRow key={invoice.id}>
                        <TableCell>{invoice.accounting_vendors?.name || '-'}</TableCell>
                        <TableCell>{invoice.invoice_number || '-'}</TableCell>
                        <TableCell><InvoiceStatusBadges invoice={invoice} /></TableCell>
                        <TableCell className="text-right font-medium">{formatAccountingMoney(invoiceFinalAmount(invoice))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState label="No high amount invoices found." />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
