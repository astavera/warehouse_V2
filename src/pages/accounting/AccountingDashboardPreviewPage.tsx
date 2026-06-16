import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  Landmark,
  RefreshCw,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { cn } from '@/lib/utils';
import { formatAccountingMoney } from '@/lib/accounting';

type Tone = 'danger' | 'default' | 'success' | 'warning';

type Kpi = {
  detail: string;
  icon: LucideIcon;
  label: string;
  tone: Tone;
  value: string;
};

const kpis: Kpi[] = [
  {
    detail: '42 open invoices',
    icon: ReceiptText,
    label: 'Pending AP',
    tone: 'warning',
    value: '184230.55',
  },
  {
    detail: '9 invoices past due',
    icon: AlertTriangle,
    label: 'Overdue',
    tone: 'danger',
    value: '41210.90',
  },
  {
    detail: '18 invoices in the payment window',
    icon: CalendarClock,
    label: 'Due next 15 days',
    tone: 'default',
    value: '72640.18',
  },
  {
    detail: '31 payments reconciled',
    icon: CheckCircle2,
    label: 'Paid this month',
    tone: 'success',
    value: '132910.40',
  },
];

const agingData = [
  { amount: 41210.9, bucket: 'Overdue', invoices: 9 },
  { amount: 31430.18, bucket: '0-7 days', invoices: 8 },
  { amount: 41210, bucket: '8-15 days', invoices: 10 },
  { amount: 36920.25, bucket: '16-30 days', invoices: 11 },
  { amount: 33459.22, bucket: '31-90 days', invoices: 4 },
];

const cashFlowData = [
  { day: 'Mon', paid: 12400, scheduled: 18600 },
  { day: 'Tue', paid: 18250, scheduled: 14200 },
  { day: 'Wed', paid: 22100, scheduled: 19850 },
  { day: 'Thu', paid: 16640, scheduled: 23800 },
  { day: 'Fri', paid: 28600, scheduled: 27200 },
  { day: 'Sat', paid: 9400, scheduled: 12600 },
  { day: 'Sun', paid: 7600, scheduled: 10900 },
];

const vendorExposure = [
  {
    dueNext15: '22340.18',
    invoices: 7,
    name: 'Con Edison',
    overdue: '8240.18',
    progress: 86,
    terms: 'Net 15',
    total: '38120.18',
  },
  {
    dueNext15: '14490.00',
    invoices: 5,
    name: 'PepsiCo Beverages',
    overdue: '0.00',
    progress: 68,
    terms: 'Net 30',
    total: '29870.00',
  },
  {
    dueNext15: '11920.55',
    invoices: 4,
    name: 'National Grid',
    overdue: '11920.55',
    progress: 62,
    terms: 'Due on receipt',
    total: '21920.55',
  },
  {
    dueNext15: '9500.00',
    invoices: 6,
    name: 'Verizon Business',
    overdue: '2400.00',
    progress: 55,
    terms: 'Net 20',
    total: '18320.00',
  },
];

const paymentSchedule = [
  { amount: '18240.18', count: 5, date: 'Today', label: 'Utilities, rent, card auto-pay', tone: 'danger' as Tone },
  { amount: '14360.00', count: 4, date: 'Tomorrow', label: 'Vendor checks ready to print', tone: 'warning' as Tone },
  { amount: '39940.00', count: 9, date: 'This week', label: 'Food and beverage invoices', tone: 'default' as Tone },
  { amount: '22130.90', count: 6, date: 'Next week', label: 'Insurance, telecom, services', tone: 'success' as Tone },
];

const recentPayments = [
  { account: 'Chase 3942', amount: '8240.18', date: '2026-06-15', method: 'ACH', vendor: 'Con Edison' },
  { account: 'Amex 1008', amount: '4118.40', date: '2026-06-14', method: 'Card', vendor: 'Restaurant Depot' },
  { account: 'Chase 3942', amount: '3150.00', date: '2026-06-14', method: 'Check', vendor: 'Verizon Business' },
  { account: 'Capital One 8820', amount: '1290.32', date: '2026-06-13', method: 'Card', vendor: 'Amazon Business' },
];

const statusColors = ['#0f766e', '#2563eb', '#ca8a04', '#dc2626', '#64748b'];

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

function toneClasses(tone: Tone) {
  return cn(
    tone === 'danger' && 'border-red-200 bg-red-50/70 text-red-800',
    tone === 'warning' && 'border-amber-200 bg-amber-50/80 text-amber-900',
    tone === 'success' && 'border-emerald-200 bg-emerald-50/80 text-emerald-800',
    tone === 'default' && 'border-sky-200 bg-sky-50/80 text-sky-900'
  );
}

function KpiTile({ item }: { item: Kpi }) {
  const Icon = item.icon;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-muted-foreground">{item.label}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">{formatAccountingMoney(item.value)}</p>
          </div>
          <div className={cn('rounded-md border p-2', toneClasses(item.tone))}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="mt-3 truncate text-xs text-muted-foreground">{item.detail}</p>
      </CardContent>
    </Card>
  );
}

function ScheduleBadge({ tone }: { tone: Tone }) {
  if (tone === 'danger') return <Badge variant="destructive">Pay now</Badge>;
  if (tone === 'warning') return <Badge variant="secondary">Queued</Badge>;
  if (tone === 'success') return <Badge variant="outline">Planned</Badge>;
  return <Badge variant="outline">Review</Badge>;
}

export default function AccountingDashboardPreviewPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-5 md:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <Landmark className="h-3.5 w-3.5" />
                Accounting preview
              </Badge>
              <Badge variant="secondary">Modern State AP dataset</Badge>
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-normal md:text-3xl">Accounting Command Center</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              A tighter dashboard concept focused on payables urgency, vendor exposure, import health, and payment follow-through.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-1.5" asChild>
              <Link to="/accounting">
                <ArrowRight className="h-4 w-4" />
                Live dashboard
              </Link>
            </Button>
            <Button variant="outline" className="gap-1.5">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button className="gap-1.5" asChild>
              <Link to="/accounting/imports">
                <FileSpreadsheet className="h-4 w-4" />
                Imports
              </Link>
            </Button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map(item => (
            <KpiTile item={item} key={item.label} />
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarClock className="h-4 w-4 text-primary" />
                    AP aging and payment pressure
                  </CardTitle>
                  <CardDescription>Open invoices grouped by due window</CardDescription>
                </div>
                <Badge variant="secondary">72% due within 30 days</Badge>
              </div>
            </CardHeader>
            <CardContent className="h-[330px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agingData} margin={{ bottom: 6, left: 4, right: 16, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={compactMoneyTick} tick={{ fontSize: 12 }} width={72} />
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [
                      name === 'amount' ? formatAccountingMoney(value) : value,
                      name === 'amount' ? 'Open amount' : 'Invoices',
                    ]}
                  />
                  <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                    {agingData.map((row, index) => (
                      <Cell fill={statusColors[index % statusColors.length]} key={row.bucket} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-emerald-700" />
                Import health
              </CardTitle>
              <CardDescription>Latest workbook run and reconciliation signal</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">_Modern State 2026 (1).xlsx</p>
                    <p className="text-xs text-muted-foreground">Imported Jun 16, 2026 at 9:42 AM</p>
                  </div>
                  <Badge variant="outline">idempotent</Badge>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border p-3">
                  <p className="text-lg font-bold tabular-nums">1,248</p>
                  <p className="text-xs text-muted-foreground">processed</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-lg font-bold tabular-nums">76</p>
                  <p className="text-xs text-muted-foreground">updated</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-lg font-bold tabular-nums">3</p>
                  <p className="text-xs text-muted-foreground">warnings</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Rows reconciled</span>
                  <span className="font-medium">98%</span>
                </div>
                <Progress value={98} className="h-2" />
              </div>
              <div className="grid gap-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Duplicate source rows</span>
                  <span className="font-medium">0</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Missing vendor terms</span>
                  <span className="font-medium">3</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Unmatched stores</span>
                  <span className="font-medium">1</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(360px,0.95fr)_minmax(0,1.05fr)]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-primary" />
                Vendor exposure
              </CardTitle>
              <CardDescription>Top open balances with near-term risk</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {vendorExposure.map(vendor => (
                <div className="rounded-md border p-3" key={vendor.name}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{vendor.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {vendor.invoices} invoices - {vendor.terms}
                      </p>
                    </div>
                    <p className="text-right text-sm font-bold tabular-nums">{formatAccountingMoney(vendor.total)}</p>
                  </div>
                  <div className="mt-3 space-y-2">
                    <Progress value={vendor.progress} className="h-2" />
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">Due next 15: {formatAccountingMoney(vendor.dueNext15)}</span>
                      <span className={cn('font-medium', Number(vendor.overdue) > 0 ? 'text-red-700' : 'text-emerald-700')}>
                        Overdue {formatAccountingMoney(vendor.overdue)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Banknote className="h-4 w-4 text-primary" />
                Paid vs scheduled cash flow
              </CardTitle>
              <CardDescription>Weekly payment activity against the planned AP queue</CardDescription>
            </CardHeader>
            <CardContent className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cashFlowData} margin={{ bottom: 6, left: 4, right: 20, top: 12 }}>
                  <defs>
                    <linearGradient id="paidGradient" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#0f766e" stopOpacity={0.34} />
                      <stop offset="95%" stopColor="#0f766e" stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="scheduledGradient" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={compactMoneyTick} tick={{ fontSize: 12 }} width={72} />
                  <RechartsTooltip formatter={(value: number) => formatAccountingMoney(value)} />
                  <Area dataKey="paid" fill="url(#paidGradient)" name="Paid" stroke="#0f766e" strokeWidth={2} type="monotone" />
                  <Area dataKey="scheduled" fill="url(#scheduledGradient)" name="Scheduled" stroke="#2563eb" strokeWidth={2} type="monotone" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(320px,0.75fr)_minmax(0,1.25fr)]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock3 className="h-4 w-4 text-primary" />
                Payment schedule
              </CardTitle>
              <CardDescription>Next AP decisions by urgency</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {paymentSchedule.map(item => (
                <div className="flex items-start justify-between gap-3 rounded-md border p-3" key={item.date}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{item.date}</p>
                      <ScheduleBadge tone={item.tone} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{item.label}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{item.count} invoices</p>
                  </div>
                  <p className="text-right text-sm font-bold tabular-nums">{formatAccountingMoney(item.amount)}</p>
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
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentPayments.map(payment => (
                      <TableRow key={`${payment.vendor}-${payment.date}`}>
                        <TableCell className="min-w-[180px] font-medium">{payment.vendor}</TableCell>
                        <TableCell>{payment.date}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{payment.method}</Badge>
                        </TableCell>
                        <TableCell>{payment.account}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatAccountingMoney(payment.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
