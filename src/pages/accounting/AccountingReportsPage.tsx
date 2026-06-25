import { Fragment, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { DateRange } from 'react-day-picker';
import { CalendarClock, Download, FileText, Loader2, Printer, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ACCOUNTING_INITIAL_LIST_LIMIT, useAccountingCatalogs, useAccountingInvoices } from '@/hooks/useAccountingData';
import {
  addDaysToIsoDate,
  addMoney,
  buildVendorPaymentReport,
  parseMoney,
  type AccountingInvoice,
  type VendorPaymentReportRow,
} from '@/lib/accounting';
import { AccountingPageHeader, EmptyState, LoadingState, MoneyText } from './AccountingComponents';

type AmountComparison = 'greater_than' | 'less_than';

const REPORT_HEADER_ACTIONS_CLASS = 'grid w-full grid-cols-2 gap-2 sm:w-auto sm:min-w-[360px]';
const REPORT_HEADER_ACTIONS_LOADED_CLASS = 'grid w-full grid-cols-1 gap-2 min-[520px]:grid-cols-3 sm:w-auto sm:min-w-[480px]';
const REPORT_HEADER_BUTTON_CLASS = 'h-10 w-full !min-w-0 justify-center gap-2 rounded-lg px-3 text-sm leading-none';
const REPORT_HEADER_SECONDARY_BUTTON_CLASS =
  `${REPORT_HEADER_BUTTON_CLASS} !border-slate-200 !bg-white !text-slate-700 !shadow-sm hover:!bg-slate-50 hover:!text-slate-950`;
const REPORT_HEADER_PRIMARY_BUTTON_CLASS =
  `${REPORT_HEADER_BUTTON_CLASS} !border-slate-700 !bg-slate-800 !text-white !shadow-sm hover:!bg-slate-900`;
const REPORT_PRINT_TEMPLATE_CLASS = 'max-h-[680px] overflow-auto rounded-md border bg-white p-5 text-slate-950 shadow-sm';
const DEFAULT_REPORT_RANGE_DAYS = 30;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function defaultRangeStartDate() {
  return todayIso();
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

function dateToIsoDate(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function formatIsoDateForReport(value: string | null | undefined) {
  const date = isoToCalendarDate(value);
  if (!date) return value || '-';
  return `${padDatePart(date.getMonth() + 1)}/${padDatePart(date.getDate())}/${date.getFullYear()}`;
}

function formatReportDateRange(startDate: string, endDate: string) {
  return `${formatIsoDateForReport(startDate)} - ${formatIsoDateForReport(endDate)}`;
}

function isoToCalendarDate(value: string | null | undefined) {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function daysBetweenIsoDates(start: string, end: string) {
  const startDate = isoToCalendarDate(start);
  const endDate = isoToCalendarDate(end);
  if (!startDate || !endDate) return 0;
  const startTime = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endTime = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  return Math.max(0, Math.round((endTime - startTime) / 86400000));
}

function defaultRangeEndDate(startDate: string) {
  return addDaysToIsoDate(startDate, DEFAULT_REPORT_RANGE_DAYS) || startDate;
}

function rangeDurationLabel(days: number) {
  if (days === 0) return 'Same day';
  if (days === 1) return '1 day';
  return `${days} days`;
}

function compactMultiLine(value: string | null | undefined) {
  return (value || '')
    .split(/[\n,]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .join(', ');
}

function normalizeSearch(value: unknown) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s#.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function dueWindowLabel(days: number) {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days}d`;
}

function amountComparisonLabel(comparison: AmountComparison) {
  return comparison === 'less_than' ? 'less than' : 'greater than';
}

function generatedAtLabel() {
  return new Date().toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function csvCell(value: string | number | boolean | null | undefined) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function vendorPaymentReportCsv({
  amountComparison,
  amountThreshold,
  rangeEndDate,
  rangeDays,
  rangeStartDate,
  includeOverdue,
  rows,
}: {
  amountComparison: AmountComparison;
  amountThreshold: string;
  rangeEndDate: string;
  rangeDays: number;
  rangeStartDate: string;
  includeOverdue: boolean;
  rows: VendorPaymentReportRow[];
}) {
  const header = [
    'Range Start Date',
    'Range End Date',
    'Range Days',
    'Amount Condition',
    'Amount Threshold',
    'Include Before Start',
    'Vendor',
    'Invoice Number',
    'Store',
    'Due Date',
    'Days Until Due',
    'Invoice Amount',
    'Vendor Report Total',
  ];
  const records = rows.flatMap(row =>
    row.invoices.map(invoice => [
      formatIsoDateForReport(rangeStartDate),
      formatIsoDateForReport(rangeEndDate),
      rangeDays,
      amountComparisonLabel(amountComparison),
      amountThreshold,
      includeOverdue,
      row.vendorName,
      compactMultiLine(invoice.invoiceNumber),
      invoice.storeName || '',
      formatIsoDateForReport(invoice.dueDate),
      invoice.daysUntilDue,
      invoice.amount,
      row.totalAmount,
    ])
  );
  return [header, ...records].map(row => row.map(csvCell).join(',')).join('\n');
}

function downloadVendorPaymentReportCsv(options: {
  amountComparison: AmountComparison;
  amountThreshold: string;
  rangeEndDate: string;
  rangeDays: number;
  rangeStartDate: string;
  includeOverdue: boolean;
  rows: VendorPaymentReportRow[];
}) {
  if (typeof document === 'undefined') return;
  const csv = vendorPaymentReportCsv(options);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `vendor-payment-report-${options.rangeStartDate}-to-${options.rangeEndDate}-${options.amountComparison}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function attachCatalogRelations(
  invoices: AccountingInvoice[],
  catalogs: ReturnType<typeof useAccountingCatalogs>['data']
) {
  if (!catalogs) return invoices;
  const vendorsById = new Map(catalogs.vendors.map(vendor => [vendor.id, vendor]));
  const storesById = new Map(catalogs.stores.map(store => [store.id, store]));
  const categoriesById = new Map(catalogs.categories.map(category => [category.id, category]));
  return invoices.map(invoice => ({
    ...invoice,
    accounting_invoice_categories: invoice.category_id ? categoriesById.get(invoice.category_id) || null : null,
    accounting_stores: invoice.store_id ? storesById.get(invoice.store_id) || null : null,
    accounting_vendors: invoice.vendor_id ? vendorsById.get(invoice.vendor_id) || null : null,
  }));
}

export default function AccountingReportsPage() {
  const location = useLocation();
  const [includeAllInvoices, setIncludeAllInvoices] = useState(false);
  const [amountComparison, setAmountComparison] = useState<AmountComparison>('greater_than');
  const [amountThreshold, setAmountThreshold] = useState('1000.00');
  const [balanceSearch, setBalanceSearch] = useState('');
  const [includeOverdue, setIncludeOverdue] = useState(false);
  const [rangeStartDate, setRangeStartDate] = useState(defaultRangeStartDate);
  const [rangeEndDate, setRangeEndDate] = useState(() => defaultRangeEndDate(defaultRangeStartDate()));
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [pendingCalendarStartDate, setPendingCalendarStartDate] = useState<string | null>(null);
  const [vendorFilter, setVendorFilter] = useState('all');
  const { data: invoices = [], isFetching, isLoading } = useAccountingInvoices({ includeAll: includeAllInvoices });
  const { data: catalogs } = useAccountingCatalogs();

  const displayInvoices = useMemo(() => attachCatalogRelations(invoices, catalogs), [catalogs, invoices]);
  const normalizedAmountThreshold = parseMoney(amountThreshold) || '1000.00';
  const effectiveRangeStartDate = rangeStartDate || defaultRangeStartDate();
  const effectiveRangeEndDate = rangeEndDate || defaultRangeEndDate(effectiveRangeStartDate);
  const selectedRangeDays = daysBetweenIsoDates(effectiveRangeStartDate, effectiveRangeEndDate);
  const selectedRangeLabel = rangeDurationLabel(selectedRangeDays);
  const selectedDateRangeLabel = formatReportDateRange(effectiveRangeStartDate, effectiveRangeEndDate);
  const selectedDateRange = useMemo<DateRange>(
    () => ({
      from: isoToCalendarDate(effectiveRangeStartDate),
      to: isoToCalendarDate(effectiveRangeEndDate),
    }),
    [effectiveRangeEndDate, effectiveRangeStartDate]
  );
  const reportRows = useMemo(
    () =>
      buildVendorPaymentReport(displayInvoices, {
        amountComparison,
        amountThreshold: normalizedAmountThreshold,
        dueFromDate: effectiveRangeStartDate,
        dueToDate: effectiveRangeEndDate,
        includeOverdue,
      }),
    [amountComparison, displayInvoices, effectiveRangeEndDate, effectiveRangeStartDate, includeOverdue, normalizedAmountThreshold]
  );
  const visibleReportRows = useMemo(() => {
    const query = normalizeSearch(balanceSearch);
    const vendorRows = vendorFilter === 'all'
      ? reportRows
      : reportRows.filter(row => (row.vendorId || 'none') === vendorFilter);
    return query ? vendorRows.filter(row => normalizeSearch(row.vendorName).includes(query)) : vendorRows;
  }, [balanceSearch, reportRows, vendorFilter]);
  const reportTotal = useMemo(() => addMoney(visibleReportRows.map(row => row.totalAmount)), [visibleReportRows]);
  const reportInvoiceCount = useMemo(
    () => visibleReportRows.reduce((count, row) => count + row.invoiceCount, 0),
    [visibleReportRows]
  );
  const reportHeaderActionsClass = includeAllInvoices ? REPORT_HEADER_ACTIONS_LOADED_CLASS : REPORT_HEADER_ACTIONS_CLASS;
  const showPrintTemplatePreview = useMemo(
    () => new URLSearchParams(location.search).get('templatePreview') === '1',
    [location.search]
  );
  const printTemplateClassName = showPrintTemplatePreview
    ? REPORT_PRINT_TEMPLATE_CLASS
    : `${REPORT_PRINT_TEMPLATE_CLASS} hidden`;
  const selectedVendorLabel = useMemo(() => {
    if (vendorFilter === 'all') return 'All vendors';
    if (vendorFilter === 'none') return 'No vendor';
    return catalogs?.vendors.find(vendor => vendor.id === vendorFilter)?.name || 'Selected vendor';
  }, [catalogs?.vendors, vendorFilter]);

  const resetFilters = () => {
    const start = defaultRangeStartDate();
    const end = defaultRangeEndDate(start);
    setAmountComparison('greater_than');
    setAmountThreshold('1000.00');
    setBalanceSearch('');
    setIncludeOverdue(false);
    setRangeStartDate(start);
    setRangeEndDate(end);
    setPendingCalendarStartDate(null);
    setVendorFilter('all');
  };

  const updateCalendarRange = (start: string, end: string) => {
    setRangeStartDate(start);
    setRangeEndDate(end);
  };

  const selectCalendarDay = (date: Date) => {
    const clickedDate = dateToIsoDate(date);
    if (!pendingCalendarStartDate) {
      setPendingCalendarStartDate(clickedDate);
      updateCalendarRange(clickedDate, clickedDate);
      return;
    }

    const start = pendingCalendarStartDate <= clickedDate ? pendingCalendarStartDate : clickedDate;
    const end = pendingCalendarStartDate <= clickedDate ? clickedDate : pendingCalendarStartDate;
    updateCalendarRange(start, end);
    setPendingCalendarStartDate(null);
  };

  const exportReport = () => {
    downloadVendorPaymentReportCsv({
      amountComparison,
      amountThreshold: normalizedAmountThreshold,
      rangeEndDate: effectiveRangeEndDate,
      rangeDays: selectedRangeDays,
      rangeStartDate: effectiveRangeStartDate,
      includeOverdue,
      rows: visibleReportRows,
    });
  };

  const printReport = () => {
    if (typeof window === 'undefined') return;
    window.print();
  };

  return (
    <div className="space-y-6">
      <style>
        {`
          @media print {
            @page { margin: 12mm; }
            body { background: #fff !important; }
            body * { visibility: hidden !important; }
            #accounting-vendor-report-print-template,
            #accounting-vendor-report-print-template * {
              visibility: visible !important;
            }
            #accounting-vendor-report-print-template {
              display: block !important;
              position: absolute !important;
              inset: 0 auto auto 0 !important;
              width: 100% !important;
              max-height: none !important;
              overflow: visible !important;
              border: 0 !important;
              box-shadow: none !important;
            }
            #accounting-vendor-report-print-template a {
              color: inherit !important;
              text-decoration: none !important;
            }
            .accounting-report-print-row {
              break-inside: avoid;
              page-break-inside: avoid;
            }
          }
        `}
      </style>

      <AccountingPageHeader
        title="Reports"
        description="Custom vendor payment report by due date range and invoice amount condition."
        actions={
          <div className={reportHeaderActionsClass}>
            {!includeAllInvoices && (
              <Button
                variant="outline"
                onClick={() => setIncludeAllInvoices(true)}
                disabled={isFetching}
                className={REPORT_HEADER_SECONDARY_BUTTON_CLASS}
              >
                {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Load all invoices
              </Button>
            )}
            <Button variant="outline" onClick={resetFilters} className={REPORT_HEADER_SECONDARY_BUTTON_CLASS}>
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button onClick={exportReport} disabled={!visibleReportRows.length} className={REPORT_HEADER_PRIMARY_BUTTON_CLASS}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="outline" onClick={printReport} className={REPORT_HEADER_SECONDARY_BUTTON_CLASS}>
              <Printer className="h-4 w-4" />
              Print report
            </Button>
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold tabular-nums">{visibleReportRows.length}</div>
            <div className="mt-1 text-xs text-muted-foreground">vendors in report</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold tabular-nums">{reportInvoiceCount}</div>
            <div className="mt-1 text-xs text-muted-foreground">matching invoices</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold tabular-nums"><MoneyText value={reportTotal} /></div>
            <div className="mt-1 text-xs text-muted-foreground">report total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-semibold">{amountComparisonLabel(amountComparison)} <MoneyText value={normalizedAmountThreshold} /></div>
            <div className="mt-1 text-xs text-muted-foreground">
              {selectedDateRangeLabel}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Report filters</h2>
            {!includeAllInvoices && <Badge variant="secondary">First {ACCOUNTING_INITIAL_LIST_LIMIT}</Badge>}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.9fr)_minmax(520px,1.1fr)]">
            <div className="space-y-2">
              <Label>Date range</Label>
              <Popover
                open={dateRangeOpen}
                onOpenChange={open => {
                  setDateRangeOpen(open);
                  if (!open) setPendingCalendarStartDate(null);
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-11 w-full justify-start gap-2 rounded-lg border-slate-200 bg-white px-3 text-left font-semibold shadow-sm"
                  >
                    <CalendarClock className="h-4 w-4 text-primary" />
                    <span className="truncate">
                      {selectedDateRangeLabel}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0">
                  <Calendar
                    mode="range"
                    numberOfMonths={2}
                    selected={selectedDateRange}
                    defaultMonth={selectedDateRange.from}
                    onDayClick={selectCalendarDay}
                  />
                </PopoverContent>
              </Popover>
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <CalendarClock className="h-4 w-4 text-primary" />
                <span className="font-medium">{selectedDateRangeLabel}</span>
                <Badge variant="outline" className="bg-white">{selectedRangeLabel}</Badge>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Amount condition</Label>
                <Select value={amountComparison} onValueChange={value => setAmountComparison(value as AmountComparison)}>
                  <SelectTrigger className="h-11 rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="greater_than">Greater than</SelectItem>
                    <SelectItem value="less_than">Less than</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="report-amount">Invoice amount</Label>
                <Input
                  id="report-amount"
                  value={amountThreshold}
                  onBlur={() => setAmountThreshold(normalizedAmountThreshold)}
                  onChange={event => setAmountThreshold(event.target.value)}
                  placeholder="1000.00"
                  className="h-11 rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Vendor</Label>
                <Select value={vendorFilter} onValueChange={setVendorFilter}>
                  <SelectTrigger className="h-11 rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All vendors</SelectItem>
                    <SelectItem value="none">No vendor</SelectItem>
                    {catalogs?.vendors.map(vendor => (
                      <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="report-vendor-search">Find vendor</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="report-vendor-search"
                    value={balanceSearch}
                    onChange={event => setBalanceSearch(event.target.value)}
                    placeholder="Search vendor in report"
                    className="h-11 rounded-lg pl-9"
                  />
                </div>
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={includeOverdue}
              onCheckedChange={checked => setIncludeOverdue(checked === true)}
            />
            Include invoices due before the range start
          </label>
        </CardContent>
      </Card>

      <section
        id="accounting-vendor-report-print-template"
        className={printTemplateClassName}
      >
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">All Zentro Solutions</div>
            <h2 className="mt-1 text-2xl font-bold tracking-normal text-slate-950">Vendor Payment Report</h2>
            <div className="mt-1 text-sm text-slate-600">Modern State accounting | Generated {generatedAtLabel()}</div>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Report total</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-slate-950">
              <MoneyText value={reportTotal} />
            </div>
            <div className="mt-1 text-sm text-slate-600">{reportInvoiceCount} invoices | {visibleReportRows.length} vendors</div>
          </div>
        </div>

        <div className="grid gap-3 border-b border-slate-200 py-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date range</div>
            <div className="mt-1 font-semibold">{selectedDateRangeLabel}</div>
            <div className="text-xs text-slate-500">{selectedRangeLabel}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amount condition</div>
            <div className="mt-1 font-semibold">{amountComparisonLabel(amountComparison)} <MoneyText value={normalizedAmountThreshold} /></div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vendor filter</div>
            <div className="mt-1 font-semibold">{selectedVendorLabel}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Before range start</div>
            <div className="mt-1 font-semibold">{includeOverdue ? 'Included' : 'Not included'}</div>
          </div>
        </div>

        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-semibold">Vendor / invoice</th>
              <th className="py-2 pr-3 font-semibold">Store</th>
              <th className="py-2 pr-3 font-semibold">Due date</th>
              <th className="py-2 pr-3 font-semibold">Status</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {visibleReportRows.length ? (
              visibleReportRows.map(row => (
                <Fragment key={row.vendorId || row.vendorName}>
                  <tr className="accounting-report-print-row border-b border-slate-200 bg-slate-50">
                    <td className="py-2 pr-3 font-bold text-slate-950" colSpan={3}>{row.vendorName}</td>
                    <td className="py-2 pr-3 text-slate-600">{row.invoiceCount} invoices</td>
                    <td className="py-2 text-right font-bold tabular-nums"><MoneyText value={row.totalAmount} /></td>
                  </tr>
                  {row.invoices.map(invoice => (
                    <tr key={invoice.id} className="accounting-report-print-row border-b border-slate-100">
                      <td className="py-2 pr-3 font-medium">{compactMultiLine(invoice.invoiceNumber) || 'No invoice #'}</td>
                      <td className="py-2 pr-3 text-slate-600">{invoice.storeName || '-'}</td>
                      <td className="py-2 pr-3 tabular-nums">{formatIsoDateForReport(invoice.dueDate)}</td>
                      <td className="py-2 pr-3 text-slate-600">{dueWindowLabel(invoice.daysUntilDue)}</td>
                      <td className="py-2 text-right font-semibold tabular-nums"><MoneyText value={invoice.amount} /></td>
                    </tr>
                  ))}
                </Fragment>
              ))
            ) : (
              <tr>
                <td className="py-8 text-center text-slate-500" colSpan={5}>No vendors match this report.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <Card>
        <CardContent className="p-0">
          <div className="border-b p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <FileText className="h-4 w-4 text-primary" />
                  Vendor payment report
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pending invoices for {selectedDateRangeLabel}
                  {' '}({selectedRangeLabel}), amount {amountComparisonLabel(amountComparison)}{' '}
                  <MoneyText value={normalizedAmountThreshold} />.
                </p>
              </div>
              <Badge variant="outline" className="w-fit">
                <CalendarClock className="mr-1 h-3.5 w-3.5" />
                {visibleReportRows.length} vendors
              </Badge>
            </div>
          </div>

          {isLoading ? (
            <LoadingState label="Loading report..." />
          ) : visibleReportRows.length ? (
            <div className="max-h-[560px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-white">
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Invoices</TableHead>
                    <TableHead>Next due</TableHead>
                    <TableHead>Matching invoices</TableHead>
                    <TableHead className="text-right">Report total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleReportRows.map(row => (
                    <TableRow key={row.vendorId || row.vendorName}>
                      <TableCell className="min-w-[180px] font-medium">{row.vendorName}</TableCell>
                      <TableCell className="text-right">{row.invoiceCount}</TableCell>
                      <TableCell className="min-w-[120px]">
                        <div className="font-medium">{formatIsoDateForReport(row.earliestDueDate)}</div>
                        <div className="text-xs text-muted-foreground">{dueWindowLabel(row.earliestDueInDays)}</div>
                      </TableCell>
                      <TableCell className="min-w-[360px]">
                        <div className="space-y-1">
                          {row.invoices.slice(0, 4).map(invoice => (
                            <Link
                              key={invoice.id}
                              to={`/accounting/invoices?${new URLSearchParams({ invoiceId: invoice.id }).toString()}`}
                              className="grid grid-cols-[minmax(110px,1fr)_90px_90px] gap-2 rounded-sm px-2 py-1 text-xs hover:bg-muted"
                            >
                              <span className="min-w-0 truncate font-medium">
                                {compactMultiLine(invoice.invoiceNumber) || 'No invoice #'}
                              </span>
                              <span className="text-muted-foreground">{dueWindowLabel(invoice.daysUntilDue)}</span>
                              <span className="text-right font-semibold tabular-nums"><MoneyText value={invoice.amount} /></span>
                            </Link>
                          ))}
                          {row.invoices.length > 4 && (
                            <div className="px-2 text-xs text-muted-foreground">
                              +{row.invoices.length - 4} more invoice{row.invoices.length - 4 === 1 ? '' : 's'} in CSV
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold"><MoneyText value={row.totalAmount} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="p-4">
              <EmptyState label="No vendors match this report." />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
