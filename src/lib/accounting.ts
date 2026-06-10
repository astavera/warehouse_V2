export type AccountingStatus = 'pending' | 'paid' | 'cancelled' | 'unknown';

export type AccountingVendor = {
  account_number?: string | null;
  address?: string | null;
  contact_name?: string | null;
  default_payment_method_id?: string | null;
  email?: string | null;
  id: string;
  name: string;
  notes?: string | null;
  normalized_name: string;
  phone?: string | null;
  source?: string | null;
  raw_payload?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type VendorLocationAccountRow = {
  account_number: string | null;
  store_id: string | null;
  store_name: string | null;
};

export type AccountingStore = {
  id: string;
  name: string;
  normalized_name: string;
  created_at: string;
  updated_at: string;
};

export function vendorLocationAccountRows(vendor: Pick<AccountingVendor, 'raw_payload'> | null | undefined): VendorLocationAccountRow[] {
  const rawPayload = vendor?.raw_payload && typeof vendor.raw_payload === 'object' ? vendor.raw_payload : {};
  const storedRows = (rawPayload as Record<string, unknown>).vendor_location_account_rows;
  if (!Array.isArray(storedRows)) return [];
  return storedRows
    .map(item => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return {
        account_number: row.account_number ? String(row.account_number) : null,
        store_id: row.store_id ? String(row.store_id) : null,
        store_name: row.store_name ? String(row.store_name) : null,
      };
    })
    .filter(row => row.account_number || row.store_id || row.store_name);
}

export function vendorAccountNumberForStore(
  vendor: Pick<AccountingVendor, 'account_number' | 'raw_payload'> | null | undefined,
  storeId: string | null | undefined
) {
  const locationRows = vendorLocationAccountRows(vendor);
  const locationMatch = locationRows.find(row => row.store_id && row.store_id === storeId);
  return locationMatch?.account_number || vendor?.account_number || '';
}

export type AccountingAccount = {
  id: string;
  name: string;
  normalized_name: string;
  store_id?: string | null;
  account_type?: string | null;
  brand?: string | null;
  last_four?: string | null;
  active: boolean;
  raw_payload?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  accounting_stores?: Pick<AccountingStore, 'id' | 'name' | 'normalized_name'> | null;
};

export type AccountingPaymentMethod = {
  id: string;
  name: string;
  normalized_name: string;
  created_at: string;
  updated_at: string;
};

export type AccountingCategory = {
  id: string;
  name: string;
  normalized_name: string;
  created_at: string;
  updated_at: string;
};

export type AccountingInvoice = {
  id: string;
  vendor_id: string | null;
  store_id: string | null;
  invoice_number: string | null;
  order_number?: string | null;
  issue_date: string | null;
  due_date: string | null;
  amount: string | null;
  credit: string;
  final_amount_to_pay?: string | null;
  status: AccountingStatus;
  paid: boolean;
  category_id: string | null;
  batch_number?: string | null;
  cloud?: string | null;
  notes: string | null;
  excel_comments?: string | null;
  source_file_name: string;
  source_file_sha256: string;
  source_sheet: string;
  source_row: number;
  source_row_hash: string;
  import_batch_id: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  accounting_vendors?: Pick<AccountingVendor, 'id' | 'name' | 'normalized_name'> | null;
  accounting_stores?: Pick<AccountingStore, 'id' | 'name' | 'normalized_name'> | null;
  accounting_invoice_categories?: Pick<AccountingCategory, 'id' | 'name' | 'normalized_name'> | null;
};

export type AccountingInvoicePayment = {
  account_number?: string | null;
  id: string;
  invoice_id: string | null;
  vendor_id: string | null;
  invoice_number?: string | null;
  payment_date: string | null;
  payment_method_id: string | null;
  account_id: string | null;
  check_number: string | null;
  reference_number: string | null;
  amount_paid: string | null;
  status: string | null;
  category_id?: string | null;
  notes: string | null;
  source_file_name: string;
  source_file_sha256: string;
  source_sheet: string;
  source_row: number;
  source_row_hash: string;
  import_batch_id: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  accounting_vendors?: Pick<AccountingVendor, 'id' | 'name' | 'normalized_name'> | null;
  accounting_accounts?: Pick<AccountingAccount, 'id' | 'name' | 'normalized_name'> | null;
  accounting_payment_methods?: Pick<AccountingPaymentMethod, 'id' | 'name' | 'normalized_name'> | null;
  accounting_invoices?: Pick<AccountingInvoice, 'id' | 'invoice_number' | 'status'> | null;
};

export type AccountingCreditCardPayment = {
  id: string;
  account_id: string | null;
  payment_date: string | null;
  amount: string | null;
  confirmation_number: string | null;
  status: string | null;
  notes: string | null;
  source_file_name: string;
  source_file_sha256: string;
  source_sheet: string;
  source_row: number;
  source_row_hash: string;
  import_batch_id: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  accounting_accounts?: Pick<AccountingAccount, 'id' | 'name' | 'normalized_name'> | null;
};

export type AccountingPersonalBill = {
  id: string;
  bill_name: string | null;
  vendor_id: string | null;
  payer: string | null;
  payment_method_id: string | null;
  payment_date: string | null;
  amount: string | null;
  status: string | null;
  notes: string | null;
  source_file_name: string;
  source_file_sha256: string;
  source_sheet: string;
  source_row: number;
  source_row_hash: string;
  import_batch_id: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  accounting_vendors?: Pick<AccountingVendor, 'id' | 'name' | 'normalized_name'> | null;
  accounting_payment_methods?: Pick<AccountingPaymentMethod, 'id' | 'name' | 'normalized_name'> | null;
};

export type AccountingTruckViolation = {
  id: string;
  violation_number: string | null;
  violation_date: string | null;
  description: string | null;
  amount: string | null;
  receipt_number: string | null;
  payment_method: string | null;
  paid_amount: string | null;
  payment_date: string | null;
  is_possible_duplicate: boolean;
  duplicate_group_key: string | null;
  notes: string | null;
  source_file_name: string;
  source_file_sha256: string;
  source_sheet: string;
  source_row: number;
  source_row_hash: string;
  import_batch_id: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AccountingImportBatch = {
  id: string;
  source_file_name: string;
  source_file_sha256: string;
  imported_at: string;
  imported_by: string | null;
  sheets_processed: unknown;
  rows_processed: number;
  rows_inserted: number;
  rows_updated: number;
  rows_skipped: number;
  warnings_count: number;
  errors_count: number;
  reconciliation_summary: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AccountingImportWarning = {
  id: string;
  import_batch_id: string | null;
  source_file_name: string | null;
  source_sheet: string | null;
  source_row: number | null;
  severity: string;
  code: string;
  message: string;
  raw_payload: Record<string, unknown>;
  created_at: string;
};

export type AccountingDashboardSummary = {
  pendingAmount: string;
  overdueAmount: string;
  dueNext7Amount: string;
  dueNext15Amount: string;
  dueNext30Amount: string;
  paidThisMonth: string;
  totalCreditApplied: string;
  pendingCount: number;
  paidCount: number;
  overdueCount: number;
  dueSoonCount: number;
  creditAppliedCount: number;
  highAmountCount: number;
};

export type VendorBalanceSummary = {
  dueNext30Amount: string;
  invoiceCount: number;
  overdueAmount: string;
  totalAmount: string;
  vendorId: string | null;
  vendorName: string;
};

const MONEY_SCALE = 100n;

export function normalizeText(value: unknown) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s#.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function parseMoney(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return parseMoneyTextToDecimal(value.toFixed(6));

  const text = String(value)
    .replace(/\$/g, '')
    .replace(/,/g, '')
    .replace(/\(([^)]+)\)/, '-$1')
    .trim();
  if (!text || text === '-' || text.startsWith('=')) return null;

  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  return parseMoneyTextToDecimal(match[0]);
}

function parseMoneyTextToDecimal(value: string) {
  const [wholeRaw, decimalRaw = ''] = value.split('.');
  const sign = wholeRaw.startsWith('-') ? -1n : 1n;
  const whole = BigInt(wholeRaw.replace('-', '') || '0');
  const padded = `${decimalRaw}000`;
  let decimals = BigInt(padded.slice(0, 2));
  if (Number(padded[2] || '0') >= 5) decimals += 1n;
  const cents = sign * (whole * MONEY_SCALE + decimals);
  return centsToDecimalString(cents);
}

export function decimalStringToCents(value: string | number | null | undefined) {
  const parsed = parseMoney(value);
  if (!parsed) return 0n;
  const [wholeRaw, decimalRaw = '00'] = parsed.split('.');
  const sign = wholeRaw.startsWith('-') ? -1n : 1n;
  const whole = BigInt(wholeRaw.replace('-', '') || '0');
  return sign * (whole * MONEY_SCALE + BigInt((decimalRaw + '00').slice(0, 2)));
}

export function centsToDecimalString(value: bigint | number) {
  const cents = typeof value === 'bigint' ? value : BigInt(value);
  const sign = cents < 0n ? '-' : '';
  const abs = cents < 0n ? -cents : cents;
  const whole = abs / MONEY_SCALE;
  const decimal = String(abs % MONEY_SCALE).padStart(2, '0');
  return `${sign}${whole}.${decimal}`;
}

export function finalAmountToPay(amount: string | number | null | undefined, credit: string | number | null | undefined) {
  return centsToDecimalString(decimalStringToCents(amount) - decimalStringToCents(credit));
}

export function addMoney(values: Array<string | number | null | undefined>) {
  return centsToDecimalString(values.reduce((total, value) => total + decimalStringToCents(value), 0n));
}

export function parsePaidStatus(value: unknown): AccountingStatus {
  if (value === true) return 'paid';
  if (value === false || value == null || value === '') return 'pending';

  const normalized = normalizeText(value);
  if (['paid', 'yes', 'y', 'true', '1', 'x'].includes(normalized)) return 'paid';
  if (['cancelled', 'canceled', 'void'].includes(normalized)) return 'cancelled';
  if (['pending', 'no', 'n', 'false', '0'].includes(normalized)) return 'pending';
  return 'unknown';
}

export function toIsoDate(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function parseExcelDate(value: Date | string | number | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return toIsoDate(value);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + Math.round(value) * 86400000).toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (!text || text === '-') return null;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;
  const [, month, day, yearRaw] = match;
  const year = Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw);
  return new Date(Date.UTC(year, Number(month) - 1, Number(day))).toISOString().slice(0, 10);
}

function todayKey(today = new Date()) {
  return today.toISOString().slice(0, 10);
}

function daysFromToday(date: string | null | undefined, today = new Date()) {
  if (!date) return null;
  const start = new Date(`${todayKey(today)}T00:00:00`);
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.floor((target.getTime() - start.getTime()) / 86400000);
}

export function daysUntilDue(date: string | null | undefined, today = new Date()) {
  return daysFromToday(date, today);
}

export function isInvoicePaid(invoice: Pick<AccountingInvoice, 'status' | 'paid'>) {
  return invoice.status === 'paid' || invoice.paid;
}

export function isOverdue(invoice: Pick<AccountingInvoice, 'due_date' | 'status' | 'paid'>, today = new Date()) {
  const days = daysFromToday(invoice.due_date, today);
  return days != null && days < 0 && !isInvoicePaid(invoice);
}

export function isDueSoon(invoice: Pick<AccountingInvoice, 'due_date' | 'status' | 'paid'>, days: number, today = new Date()) {
  const diff = daysFromToday(invoice.due_date, today);
  return diff != null && diff >= 0 && diff <= days && !isInvoicePaid(invoice);
}

export function hasCreditApplied(invoice: Pick<AccountingInvoice, 'credit'>) {
  return decimalStringToCents(invoice.credit) > 0n;
}

export function invoiceFinalAmount(invoice: Pick<AccountingInvoice, 'amount' | 'credit' | 'final_amount_to_pay'>) {
  return invoice.final_amount_to_pay || finalAmountToPay(invoice.amount, invoice.credit);
}

export function isHighAmount(invoice: Pick<AccountingInvoice, 'amount' | 'credit' | 'final_amount_to_pay'>, threshold = '7000.00') {
  return decimalStringToCents(invoiceFinalAmount(invoice)) >= decimalStringToCents(threshold);
}

export function isDueWithin(invoice: Pick<AccountingInvoice, 'due_date' | 'status' | 'paid'>, days: number, today = new Date()) {
  const diff = daysFromToday(invoice.due_date, today);
  return diff != null && diff >= 0 && diff <= days && !isInvoicePaid(invoice);
}

export function formatAccountingMoney(value: string | number | null | undefined) {
  if (value == null || value === '') return '-';
  const parsed = parseMoney(value);
  if (!parsed) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(parsed));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sourceRowHash(payload: Record<string, unknown>) {
  const text = stableJson(payload);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function sourceRowKey(sourceFileSha256: string, sourceSheet: string, sourceRow: number) {
  return `${sourceFileSha256}:${sourceSheet.trim()}:${sourceRow}`;
}

export function truckDuplicateGroupKey(violationNumber: string | null | undefined) {
  const normalized = normalizeText(violationNumber);
  return normalized || null;
}

export function findTruckDuplicateGroups(rows: Array<Pick<AccountingTruckViolation, 'violation_number'>>) {
  const counts = new Map<string, number>();
  rows.forEach(row => {
    const key = truckDuplicateGroupKey(row.violation_number);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  });
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
}

export function summarizeAccountingDashboard(
  invoices: AccountingInvoice[],
  payments: AccountingInvoicePayment[],
  today = new Date()
): AccountingDashboardSummary {
  const pendingInvoices = invoices.filter(invoice => !isInvoicePaid(invoice));
  const paidInvoices = invoices.filter(isInvoicePaid);
  const currentMonth = today.toISOString().slice(0, 7);
  const paidThisMonth = payments.filter(payment => payment.payment_date?.startsWith(currentMonth));
  const overdueInvoices = pendingInvoices.filter(invoice => isOverdue(invoice, today));
  const dueSoonInvoices = pendingInvoices.filter(invoice => isDueSoon(invoice, 7, today));

  return {
    pendingAmount: addMoney(pendingInvoices.map(invoiceFinalAmount)),
    overdueAmount: addMoney(overdueInvoices.map(invoiceFinalAmount)),
    dueNext7Amount: addMoney(pendingInvoices.filter(invoice => isDueSoon(invoice, 7, today)).map(invoiceFinalAmount)),
    dueNext15Amount: addMoney(pendingInvoices.filter(invoice => isDueSoon(invoice, 15, today)).map(invoiceFinalAmount)),
    dueNext30Amount: addMoney(pendingInvoices.filter(invoice => isDueSoon(invoice, 30, today)).map(invoiceFinalAmount)),
    paidThisMonth: addMoney(paidThisMonth.map(payment => payment.amount_paid)),
    totalCreditApplied: addMoney(invoices.map(invoice => invoice.credit)),
    pendingCount: pendingInvoices.length,
    paidCount: paidInvoices.length,
    overdueCount: overdueInvoices.length,
    dueSoonCount: dueSoonInvoices.length,
    creditAppliedCount: invoices.filter(hasCreditApplied).length,
    highAmountCount: invoices.filter(invoice => isHighAmount(invoice)).length,
  };
}

export function summarizeVendorBalances(invoices: AccountingInvoice[], today = new Date()): VendorBalanceSummary[] {
  const rows = new Map<string, VendorBalanceSummary>();
  invoices
    .filter(invoice => !isInvoicePaid(invoice))
    .forEach(invoice => {
      const vendorId = invoice.vendor_id || null;
      const key = vendorId || invoice.accounting_vendors?.name || 'unknown';
      const current = rows.get(key) || {
        dueNext30Amount: '0.00',
        invoiceCount: 0,
        overdueAmount: '0.00',
        totalAmount: '0.00',
        vendorId,
        vendorName: invoice.accounting_vendors?.name || 'No vendor',
      };
      const amount = invoiceFinalAmount(invoice);
      current.invoiceCount += 1;
      current.totalAmount = addMoney([current.totalAmount, amount]);
      if (isOverdue(invoice, today)) current.overdueAmount = addMoney([current.overdueAmount, amount]);
      if (isDueWithin(invoice, 30, today)) current.dueNext30Amount = addMoney([current.dueNext30Amount, amount]);
      rows.set(key, current);
    });
  return [...rows.values()].sort((a, b) => Number(b.totalAmount) - Number(a.totalAmount));
}
