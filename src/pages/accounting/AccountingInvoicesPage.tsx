import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Camera, CreditCard, Edit, ListChecks, Loader2, MapPin, Plus, RotateCcw, Save, Search, SlidersHorizontal, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ACCOUNTING_INITIAL_LIST_LIMIT,
  fetchAccountingInvoiceById,
  uploadAccountingCheckPhoto,
  useAccountingCatalogs,
  useAccountingInvoiceMutations,
  useAccountingInvoices,
  useAccountingPaymentMutations,
} from '@/hooks/useAccountingData';
import { cn } from '@/lib/utils';
import {
  addMoney,
  addDaysToIsoDate,
  daysUntilDue,
  decimalStringToCents,
  finalAmountToPay,
  hasCreditApplied,
  invoiceFinalAmount,
  isDueSoon,
  isHighAmount,
  isInvoicePaid,
  isOverdue,
  normalizeText,
  paymentTermsLabel,
  parseMoney,
  summarizeVendorBalances,
  vendorAccountNumberForStore,
  type AccountingAccount,
  type AccountingInvoice,
  type AccountingStatus,
  type AccountingVendor,
} from '@/lib/accounting';
import {
  AccountingPageHeader,
  EmptyState,
  InvoiceStatusBadges,
  LoadingState,
  MoneyText,
} from './AccountingComponents';

type CreditLine = {
  amount: string;
  id: string;
  reason: string;
};

type InvoiceLocationAccountRow = {
  account_id: string;
  account_number: string;
  id: string;
  store_id: string;
  store_name: string;
};

type CheckPaymentLine = {
  amount: string;
  check_number: string;
  detected_address: string;
  id: string;
  ocr_status: 'idle' | 'scanning' | 'found' | 'not_found' | 'unavailable' | 'error';
  ocr_text: string;
  photo_blob: Blob | null;
  photo_name: string;
  photo_path: string;
  photo_preview: string;
  sent_date: string;
  sent_to_address: string;
};

type InvoiceFormState = {
  amount: string;
  category_id: string;
  creditLines: CreditLine[];
  due_date: string;
  invoiceInput: string;
  invoiceNumbers: string[];
  issue_date: string;
  locationAccounts: InvoiceLocationAccountRow[];
  notes: string;
  status: AccountingStatus;
  store_id: string;
  vendor_id: string;
};

const EMPTY_FORM: InvoiceFormState = {
  amount: '',
  category_id: 'none',
  creditLines: [],
  due_date: '',
  invoiceInput: '',
  invoiceNumbers: [],
  issue_date: '',
  locationAccounts: [],
  notes: '',
  status: 'pending',
  store_id: 'none',
  vendor_id: 'none',
};

type PayInvoiceFormState = {
  account_id: string;
  account_number: string;
  amount_paid: string;
  category_id: string;
  checkLines: CheckPaymentLine[];
  check_number: string;
  notes: string;
  payment_date: string;
  payment_method_kind: 'credit_card' | 'check';
  payment_method_id: string;
  reference_number: string;
};

type CombinedInvoicePaymentFormState = {
  account_id: string;
  account_number: string;
  category_id: string;
  checkLines: CheckPaymentLine[];
  notes: string;
  payment_date: string;
  payment_method_id: string;
  reference_number: string;
  selectedInvoiceIds: string[];
  sent_to_address: string;
  vendor_id: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function compactMultiLine(value: string | null | undefined) {
  return (value || '')
    .split(/[\n,]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .join(', ');
}

function parseInvoiceNumbers(value: string | null | undefined) {
  return (value || '')
    .split(/[\n,;]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .filter((item, index, rows) => rows.findIndex(candidate => candidate.toLowerCase() === item.toLowerCase()) === index);
}

function invoiceNumbersToText(values: string[]) {
  return values.map(value => value.trim()).filter(Boolean).join('\n');
}

function createLocalId(prefix: string) {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createCheckPaymentLine(amount = '', sentDate = ''): CheckPaymentLine {
  return {
    amount,
    check_number: '',
    detected_address: '',
    id: createLocalId('check-payment'),
    ocr_status: 'idle',
    ocr_text: '',
    photo_blob: null,
    photo_name: '',
    photo_path: '',
    photo_preview: '',
    sent_date: sentDate,
    sent_to_address: '',
  };
}

function createCombinedInvoicePaymentForm(): CombinedInvoicePaymentFormState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    account_id: 'none',
    account_number: '',
    category_id: 'none',
    checkLines: [createCheckPaymentLine('', today)],
    notes: '',
    payment_date: today,
    payment_method_id: 'none',
    reference_number: '',
    selectedInvoiceIds: [],
    sent_to_address: '',
    vendor_id: 'none',
  };
}

function normalizeCheckPaymentLines(lines: CheckPaymentLine[]) {
  return lines
    .map(line => ({
      amount: parseMoney(line.amount) || '',
      check_number: line.check_number.trim(),
      confirmed_address: line.sent_to_address.trim(),
      detected_address: line.detected_address.trim() || null,
      ocr_text: line.ocr_text || null,
      ocr_status: line.ocr_status,
      photo_data_url: line.photo_preview || null,
      photo_name: line.photo_name || null,
      photo_path: line.photo_path || null,
      sent_date: line.sent_date || null,
      sent_to_address: line.sent_to_address.trim(),
    }))
    .filter(line => line.amount || line.check_number || line.sent_to_address || line.photo_data_url || line.photo_path);
}

function checkPhotoExtension(line: CheckPaymentLine) {
  const fromName = line.photo_name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName === 'jpeg' ? 'jpg' : fromName;
  if (line.photo_blob?.type.includes('png')) return 'png';
  if (line.photo_blob?.type.includes('webp')) return 'webp';
  return 'jpg';
}

async function prepareCheckPaymentLinesForSave(lines: CheckPaymentLine[], paymentId: string) {
  const prepared = await Promise.all(lines.map(async line => {
    let photoPath = line.photo_path || '';
    let localPhotoDataUrl = '';

    if (line.photo_blob) {
      const extension = checkPhotoExtension(line);
      const upload = await uploadAccountingCheckPhoto(
        line.photo_blob,
        `invoice-payments/${paymentId}/${line.id}.${extension}`
      );
      photoPath = upload.path;
      localPhotoDataUrl = upload.dataUrl || '';
    }

    return {
      amount: parseMoney(line.amount) || '',
      check_number: line.check_number.trim(),
      confirmed_address: line.sent_to_address.trim(),
      detected_address: line.detected_address.trim() || null,
      ocr_text: line.ocr_text || null,
      ocr_status: line.ocr_status,
      photo_data_url: localPhotoDataUrl || (!photoPath ? line.photo_preview : null),
      photo_name: line.photo_name || null,
      photo_path: photoPath || null,
      sent_date: line.sent_date || null,
      sent_to_address: line.sent_to_address.trim(),
    };
  }));
  return prepared.filter(line => line.amount || line.check_number || line.sent_to_address || line.photo_data_url || line.photo_path);
}

function checkPaymentTotal(lines: CheckPaymentLine[]) {
  return addMoney(normalizeCheckPaymentLines(lines).map(line => line.amount || '0.00'));
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error('Could not load image'));
    image.onload = () => resolve(image);
    image.src = src;
  });
}

async function resizeCheckPhoto(file: File) {
  const source = await fileToDataUrl(file);
  const image = await loadImage(source);
  const maxWidth = 1200;
  const maxHeight = 900;
  const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
  if (scale >= 1 && file.size < 450_000) return source;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) return source;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.72);
}

function dataUrlToBlob(dataUrl: string) {
  const [header, body] = dataUrl.split(',');
  const mimeMatch = header.match(/data:([^;]+)/);
  const mimeType = mimeMatch?.[1] || 'image/jpeg';
  const binary = atob(body || '');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function guessAddressFromText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const streetIndex = lines.findIndex(line =>
    /\b\d{1,6}\s+[A-Z0-9]/i.test(line) &&
    /\b(st|street|ave|avenue|rd|road|dr|drive|blvd|boulevard|ln|lane|ct|court|pl|place|way|pkwy|parkway)\b/i.test(line)
  );
  if (streetIndex >= 0) {
    const zipIndex = lines.findIndex((line, index) => index >= streetIndex && /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(line));
    const end = zipIndex >= 0 ? zipIndex + 1 : streetIndex + 3;
    return lines.slice(Math.max(0, streetIndex - 1), Math.min(lines.length, end)).join('\n');
  }
  const zipIndex = lines.findIndex(line => /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(line));
  if (zipIndex >= 0) return lines.slice(Math.max(0, zipIndex - 2), zipIndex + 1).join('\n');
  return '';
}

type BrowserTextDetector = new () => {
  detect: (image: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

async function detectAddressFromPhoto(file: File) {
  const Detector = (globalThis as typeof globalThis & { TextDetector?: BrowserTextDetector }).TextDetector;
  if (!Detector || typeof globalThis.createImageBitmap !== 'function') {
    return { address: '', status: 'unavailable' as CheckPaymentLine['ocr_status'], text: '' };
  }
  const bitmap = await createImageBitmap(file);
  try {
    const results = await new Detector().detect(bitmap);
    const text = results.map(result => result.rawValue || '').filter(Boolean).join('\n');
    const address = guessAddressFromText(text);
    return {
      address,
      status: address ? 'found' as const : 'not_found' as const,
      text,
    };
  } finally {
    bitmap.close();
  }
}

function cleanCreditLines(lines: CreditLine[]) {
  return lines
    .map(line => ({
      amount: parseMoney(line.amount) || '',
      reason: line.reason.trim(),
    }))
    .filter(line => line.amount || line.reason);
}

function creditTotal(lines: CreditLine[]) {
  return addMoney(cleanCreditLines(lines).map(line => line.amount || '0.00'));
}

function creditLinesFromInvoice(invoice: AccountingInvoice): CreditLine[] {
  const rawPayload = invoice.raw_payload && typeof invoice.raw_payload === 'object' ? invoice.raw_payload : {};
  const storedLines = (rawPayload as Record<string, unknown>).manual_credit_lines;
  if (Array.isArray(storedLines)) {
    return storedLines
      .map(item => {
        const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
        return {
          amount: parseMoney(row.amount) || '',
          id: createLocalId('credit-line'),
          reason: String(row.reason || ''),
        };
      })
      .filter(line => line.amount || line.reason);
  }

  if (Number(parseMoney(invoice.credit) || 0) > 0) {
    return [{
      amount: invoice.credit || '0.00',
      id: createLocalId('credit-line'),
      reason: String((rawPayload as Record<string, unknown>).manual_credit_reason_summary || ''),
    }];
  }
  return [];
}

function creditSummary(invoice: AccountingInvoice) {
  const lines = creditLinesFromInvoice(invoice);
  if (!lines.length) return '';
  if (lines.length > 1) return `${lines.length} credits`;
  return lines[0]?.reason || '1 credit';
}

function locationAccountRowsFromInvoice(invoice: AccountingInvoice): InvoiceLocationAccountRow[] {
  const rawPayload = invoice.raw_payload && typeof invoice.raw_payload === 'object' ? invoice.raw_payload : {};
  const storedRows = (rawPayload as Record<string, unknown>).manual_location_account_rows;
  if (!Array.isArray(storedRows)) return [];
  return storedRows
    .map(item => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return {
        account_id: String(row.account_id || 'none'),
        account_number: String(row.account_number || ''),
        id: String(row.id || createLocalId('invoice-location-account')),
        store_id: String(row.store_id || 'none'),
        store_name: String(row.store_name || ''),
      };
    })
    .filter(row => row.store_id !== 'none' || row.store_name || row.account_number || row.account_id !== 'none');
}

function bestLocationAccountForInvoice(invoice: AccountingInvoice) {
  const rows = locationAccountRowsFromInvoice(invoice);
  return rows.find(row => row.store_id === invoice.store_id) || rows[0] || null;
}

function isCreditCardAccount(account: Pick<AccountingAccount, 'account_type' | 'name'>) {
  const normalizedType = normalizeText(account.account_type);
  const normalizedName = normalizeText(account.name);
  return normalizedType.includes('credit') || normalizedName.includes('credit card');
}

function accountLabel(account: Pick<AccountingAccount, 'brand' | 'last_four' | 'name'>) {
  const suffix = account.last_four ? ` ending ${account.last_four}` : '';
  return `${account.name}${suffix}${account.brand ? ` - ${account.brand}` : ''}`;
}

function isBankAccount(account: Pick<AccountingAccount, 'account_type' | 'name'>) {
  const normalizedType = normalizeText(account.account_type);
  const normalizedName = normalizeText(account.name);
  return normalizedType.includes('bank') || normalizedName.includes('bank') || normalizedName.includes('checking');
}

function isBothStoresName(name: string | null | undefined) {
  const normalized = normalizeText(name);
  return normalized.includes('both');
}

function isAllLocationsName(name: string | null | undefined) {
  const normalized = normalizeText(name);
  return normalized.includes('all location') || normalized.includes('all stores');
}

function isGroupedStoreName(name: string | null | undefined) {
  return isBothStoresName(name) || isAllLocationsName(name);
}

function isWarehouseStoreName(name: string | null | undefined) {
  return normalizeText(name).includes('warehouse');
}

function storesForLocationRows(
  stores: Array<{ id: string; name: string }>,
  storeId: string
) {
  const selectedStore = stores.find(store => store.id === storeId);
  if (!selectedStore) return [];
  if (isAllLocationsName(selectedStore.name)) {
    const rows = stores.filter(store => !isGroupedStoreName(store.name));
    return rows.length ? rows : [selectedStore];
  }
  if (isBothStoresName(selectedStore.name)) {
    const rows = stores.filter(store => !isGroupedStoreName(store.name) && !isWarehouseStoreName(store.name));
    return rows.length ? rows : [selectedStore];
  }
  return [selectedStore];
}

function defaultBankAccountForStore(accounts: AccountingAccount[], storeId: string) {
  const activeAccounts = accounts.filter(account => account.active !== false);
  const linked = activeAccounts.filter(account => account.store_id === storeId);
  return linked.find(isBankAccount) || linked.find(account => !isCreditCardAccount(account)) || linked[0] || activeAccounts.find(isBankAccount) || null;
}

function buildLocationAccountRows({
  accounts,
  existingRows,
  preferExistingAccountNumber = true,
  storeId,
  stores,
  vendor,
}: {
  accounts: AccountingAccount[];
  existingRows: InvoiceLocationAccountRow[];
  preferExistingAccountNumber?: boolean;
  storeId: string;
  stores: Array<{ id: string; name: string }>;
  vendor: Pick<AccountingVendor, 'account_number' | 'raw_payload'> | null | undefined;
}) {
  return storesForLocationRows(stores, storeId).map(store => {
    const existing = existingRows.find(row => row.store_id === store.id);
    const defaultAccount = defaultBankAccountForStore(accounts, store.id);
    const keepExistingAccount = existing?.account_id && accounts.some(account => account.id === existing.account_id);
    const vendorAccountNumber = vendorAccountNumberForStore(vendor, store.id);
    return {
      account_id: keepExistingAccount ? existing.account_id : defaultAccount?.id || 'none',
      account_number: preferExistingAccountNumber && existing?.account_number ? existing.account_number : vendorAccountNumber,
      id: existing?.id || createLocalId('invoice-location-account'),
      store_id: store.id,
      store_name: store.name,
    };
  });
}

function paymentKindFromMethodName(name: string | null | undefined): PayInvoiceFormState['payment_method_kind'] {
  const normalized = normalizeText(name);
  return normalized.includes('credit') || normalized.includes('card') ? 'credit_card' : 'check';
}

function methodIdForKind(
  kind: PayInvoiceFormState['payment_method_kind'],
  methods: Array<{ id: string; name: string }>
) {
  const preferred = kind === 'credit_card' ? ['credit card', 'card'] : ['bank check', 'check'];
  return methods.find(method => preferred.some(label => normalizeText(method.name).includes(label)))?.id || 'none';
}

function moneyDifference(left: string | number | null | undefined, right: string | number | null | undefined) {
  const leftCents = decimalStringToCents(left);
  const rightCents = decimalStringToCents(right);
  return leftCents >= rightCents
    ? finalAmountToPay(left, right)
    : finalAmountToPay(right, left);
}

function dueRowClass(invoice: AccountingInvoice) {
  if (isInvoicePaid(invoice)) return '';
  const days = daysUntilDue(invoice.due_date);
  if (days == null) return '';
  if (days <= 8) return 'bg-rose-50/80 hover:bg-rose-50';
  if (days <= 15) return 'bg-amber-50/80 hover:bg-amber-50';
  if (days <= 30) return 'bg-emerald-50/80 hover:bg-emerald-50';
  return '';
}

function invoiceSourceLabel(invoice: AccountingInvoice) {
  const sourceFile = invoice.source_file_name || '';
  const sourceSheet = invoice.source_sheet || '';
  const isManual = normalizeText(sourceFile) === 'manual' || normalizeText(sourceSheet) === 'manual';
  if (isManual) return 'Manual entry';
  return sourceFile ? `Imported from ${sourceFile}` : 'Imported invoice';
}

function invoiceSourceDetail(invoice: AccountingInvoice) {
  const sourceSheet = invoice.source_sheet || '';
  const isManual = normalizeText(invoice.source_file_name) === 'manual' || normalizeText(sourceSheet) === 'manual';
  if (isManual) return 'Created directly in Accounting.';
  const parts = [
    sourceSheet ? `Sheet: ${sourceSheet}` : null,
    invoice.source_row ? `Row: ${invoice.source_row}` : null,
    invoice.import_batch_id ? `Batch: ${invoice.import_batch_id}` : null,
  ].filter(Boolean);
  return parts.join(' · ') || 'Imported source details unavailable.';
}

function formFromInvoice(invoice: AccountingInvoice): InvoiceFormState {
  return {
    amount: invoice.amount || '',
    category_id: invoice.category_id || 'none',
    creditLines: creditLinesFromInvoice(invoice),
    due_date: invoice.due_date || '',
    invoiceInput: '',
    invoiceNumbers: parseInvoiceNumbers(invoice.invoice_number),
    issue_date: invoice.issue_date || '',
    locationAccounts: locationAccountRowsFromInvoice(invoice),
    notes: invoice.notes || '',
    status: invoice.status,
    store_id: invoice.store_id || 'none',
    vendor_id: invoice.vendor_id || 'none',
  };
}

function InvoiceFormDialog({
  form,
  mode,
  onChange,
  onClose,
  onSave,
  open,
  saving,
  sourceInvoice,
}: {
  form: InvoiceFormState;
  mode: 'create' | 'edit';
  onChange: (patch: Partial<InvoiceFormState>) => void;
  onClose: () => void;
  onSave: () => void;
  open: boolean;
  saving: boolean;
  sourceInvoice: AccountingInvoice | null;
}) {
  const { data: catalogs } = useAccountingCatalogs();
  const selectedVendor = catalogs?.vendors.find(vendor => vendor.id === form.vendor_id) || null;
  const selectedVendorTermsDays = selectedVendor?.payment_terms_days ?? null;
  const termsDueDate = addDaysToIsoDate(form.issue_date, selectedVendorTermsDays);
  const activeAccounts = (catalogs?.accounts || []).filter(account => account.active !== false);
  const bankAccountOptions = activeAccounts.filter(account => !isCreditCardAccount(account));
  const saveDisabled = saving || !form.amount.trim() || !form.invoiceNumbers.length;
  const totalCredit = creditTotal(form.creditLines);
  const addInvoiceNumber = () => {
    const value = form.invoiceInput.trim();
    if (!value) return;
    if (form.invoiceNumbers.some(item => item.toLowerCase() === value.toLowerCase())) {
      onChange({ invoiceInput: '' });
      return;
    }
    onChange({ invoiceInput: '', invoiceNumbers: [...form.invoiceNumbers, value] });
  };
  const removeInvoiceNumber = (invoiceNumber: string) => {
    onChange({ invoiceNumbers: form.invoiceNumbers.filter(item => item !== invoiceNumber) });
  };
  const selectVendor = (vendorId: string) => {
    const vendor = catalogs?.vendors.find(item => item.id === vendorId);
    const dueDateFromTerms = !form.due_date ? addDaysToIsoDate(form.issue_date, vendor?.payment_terms_days) : null;
    onChange({
      ...(dueDateFromTerms ? { due_date: dueDateFromTerms } : {}),
      locationAccounts: buildLocationAccountRows({
        accounts: catalogs?.accounts || [],
        existingRows: form.locationAccounts,
        preferExistingAccountNumber: false,
        storeId: form.store_id,
        stores: catalogs?.stores || [],
        vendor,
      }),
      vendor_id: vendorId,
    });
  };
  const updateIssueDate = (issueDate: string) => {
    const dueDateFromTerms = !form.due_date ? addDaysToIsoDate(issueDate, selectedVendorTermsDays) : null;
    onChange({
      issue_date: issueDate,
      ...(dueDateFromTerms ? { due_date: dueDateFromTerms } : {}),
    });
  };
  const applyVendorTerms = () => {
    if (!termsDueDate) return;
    onChange({ due_date: termsDueDate });
  };
  const selectStore = (storeId: string) => {
    onChange({
      locationAccounts: buildLocationAccountRows({
        accounts: catalogs?.accounts || [],
        existingRows: form.locationAccounts,
        storeId,
        stores: catalogs?.stores || [],
        vendor: selectedVendor,
      }),
      store_id: storeId,
    });
  };
  const updateLocationAccount = (id: string, patch: Partial<InvoiceLocationAccountRow>) => {
    onChange({
      locationAccounts: form.locationAccounts.map(row => row.id === id ? { ...row, ...patch } : row),
    });
  };
  const addCreditLine = () => {
    onChange({
      creditLines: [...form.creditLines, { amount: '', id: createLocalId('credit-line'), reason: '' }],
    });
  };
  const updateCreditLine = (id: string, patch: Partial<CreditLine>) => {
    onChange({
      creditLines: form.creditLines.map(line => line.id === id ? { ...line, ...patch } : line),
    });
  };
  const removeCreditLine = (id: string) => {
    onChange({ creditLines: form.creditLines.filter(line => line.id !== id) });
  };

  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create invoice' : 'Edit invoice'}</DialogTitle>
          <DialogDescription>
            Capture invoice details, category, and any credits applied with their reason.
          </DialogDescription>
        </DialogHeader>

        {mode === 'edit' && sourceInvoice && (
          <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-medium uppercase text-muted-foreground">Source</div>
                <div className="font-semibold">{invoiceSourceLabel(sourceInvoice)}</div>
              </div>
              <Badge variant="outline">{invoiceSourceDetail(sourceInvoice)}</Badge>
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Vendor</Label>
            <Select value={form.vendor_id} onValueChange={selectVendor}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No vendor</SelectItem>
                {catalogs?.vendors.map(vendor => (
                  <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Store</Label>
            <Select value={form.store_id} onValueChange={selectStore}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No store</SelectItem>
                {catalogs?.stores.map(store => (
                  <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={form.category_id} onValueChange={value => onChange({ category_id: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {catalogs?.categories.map(category => (
                  <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {(selectedVendor || form.locationAccounts.length > 0) && (
          <div className="space-y-3 rounded-lg border bg-muted/10 p-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <Label>Vendor account numbers by location</Label>
                <p className="text-xs text-muted-foreground">
                  These values are saved with this invoice and can be used when the invoice is paid.
                </p>
              </div>
              {selectedVendor && (
                <Badge variant="outline">
                  Default account #: {selectedVendor.account_number || '-'}
                </Badge>
              )}
            </div>
            {form.locationAccounts.length ? (
              <div className="space-y-2">
                <div className="hidden grid-cols-[minmax(150px,0.8fr)_minmax(160px,1fr)_minmax(180px,1fr)] gap-2 px-1 text-xs font-medium text-muted-foreground md:grid">
                  <span>Location</span>
                  <span>Vendor account #</span>
                  <span>Bank account linked</span>
                </div>
                {form.locationAccounts.map(row => (
                  <div key={row.id} className="grid gap-2 md:grid-cols-[minmax(150px,0.8fr)_minmax(160px,1fr)_minmax(180px,1fr)] md:items-center">
                    <div className="rounded-md border bg-white px-3 py-2 text-sm font-medium">{row.store_name || 'No store'}</div>
                    <Input
                      value={row.account_number}
                      onChange={event => updateLocationAccount(row.id, { account_number: event.target.value })}
                      placeholder="Vendor account number"
                    />
                    <Select value={row.account_id} onValueChange={value => updateLocationAccount(row.id, { account_id: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No bank account</SelectItem>
                        {(bankAccountOptions.length ? bankAccountOptions : activeAccounts).map(account => (
                          <SelectItem key={account.id} value={account.id}>
                            {accountLabel(account)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-white px-3 py-4 text-center text-sm text-muted-foreground">
                Select a store to load the vendor account number and linked bank account fields.
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
          <div className="space-y-2">
            <Label>Invoice number</Label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px]">
              <Input
                value={form.invoiceInput}
                onChange={event => onChange({ invoiceInput: event.target.value })}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addInvoiceNumber();
                  }
                }}
                placeholder="Type invoice number"
              />
              <Button type="button" variant="outline" onClick={addInvoiceNumber}>
                Add
              </Button>
            </div>
            <div className="rounded-lg border bg-white p-3">
              <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Invoice Numbers Added</div>
              {form.invoiceNumbers.length ? (
                <div className="flex flex-wrap gap-2">
                  {form.invoiceNumbers.map(invoiceNumber => (
                    <Badge key={invoiceNumber} variant="secondary" className="gap-2 py-1.5">
                      {invoiceNumber}
                      <button
                        type="button"
                        className="rounded-sm px-1 text-xs hover:bg-background"
                        onClick={() => removeInvoiceNumber(invoiceNumber)}
                      >
                        Remove
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center text-sm text-muted-foreground">No invoice numbers added yet.</div>
              )}
            </div>
            <div className="grid gap-4 pt-2 sm:grid-cols-[minmax(180px,240px)_220px]">
              <div className="space-y-1.5">
                <Label>Invoice amount</Label>
                <Input inputMode="decimal" value={form.amount} onChange={event => onChange({ amount: event.target.value })} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={value => onChange({ status: value as AccountingStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="grid content-start gap-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="space-y-1.5">
                <Label>Issue date</Label>
                <Input type="date" value={form.issue_date} onChange={event => updateIssueDate(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Due date</Label>
                <Input type="date" value={form.due_date} onChange={event => onChange({ due_date: event.target.value })} />
              </div>
            </div>
            {selectedVendor && (
              <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-medium uppercase text-muted-foreground">Terms</div>
                    <div className="font-semibold">{paymentTermsLabel(selectedVendorTermsDays)}</div>
                  </div>
                  {selectedVendorTermsDays != null && termsDueDate && (
                    <Button type="button" variant="outline" size="sm" onClick={applyVendorTerms}>
                      Apply terms
                    </Button>
                  )}
                </div>
                {selectedVendorTermsDays != null && termsDueDate && (
                  <div className="mt-2 text-xs text-muted-foreground">Calculated due date: {termsDueDate}</div>
                )}
              </div>
            )}
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-xs font-medium uppercase text-muted-foreground">Final amount</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                <MoneyText value={finalAmountToPay(form.amount, totalCredit)} />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Credit total: <MoneyText value={totalCredit} />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border bg-muted/10 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label>Credits applied</Label>
              <p className="text-xs text-muted-foreground">Add each credit separately and include the reason.</p>
            </div>
            <Button type="button" variant="outline" onClick={addCreditLine} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add credit
            </Button>
          </div>
          {form.creditLines.length ? (
            <div className="space-y-2">
              <div className="hidden grid-cols-[150px_minmax(0,1fr)_40px] gap-2 px-1 text-xs font-medium text-muted-foreground md:grid">
                <span>Credit amount</span>
                <span>Reason</span>
                <span />
              </div>
              {form.creditLines.map(line => (
                <div key={line.id} className="grid gap-2 md:grid-cols-[150px_minmax(0,1fr)_40px] md:items-center">
                  <Input
                    inputMode="decimal"
                    value={line.amount}
                    onChange={event => updateCreditLine(line.id, { amount: event.target.value })}
                    placeholder="0.00"
                  />
                  <Input
                    value={line.reason}
                    onChange={event => updateCreditLine(line.id, { reason: event.target.value })}
                    placeholder="Reason for credit"
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeCreditLine(line.id)} aria-label="Remove credit">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="rounded-lg border bg-white px-3 py-2 text-sm">
                Total credit: <span className="font-semibold"><MoneyText value={totalCredit} /></span>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed bg-white px-3 py-4 text-center text-sm text-muted-foreground">
              No credits added.
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea
            value={form.notes}
            onChange={event => onChange({ notes: event.target.value })}
            className="min-h-[110px]"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saveDisabled} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayInvoiceDialog({
  form,
  invoice,
  onChange,
  onClose,
  onSave,
  open,
  saving,
}: {
  form: PayInvoiceFormState;
  invoice: AccountingInvoice | null;
  onChange: (patch: Partial<PayInvoiceFormState>) => void;
  onClose: () => void;
  onSave: () => void;
  open: boolean;
  saving: boolean;
}) {
  const { data: catalogs } = useAccountingCatalogs();
  const activeAccounts = (catalogs?.accounts || []).filter(account => account.active !== false);
  const creditCards = activeAccounts.filter(isCreditCardAccount);
  const bankAccounts = activeAccounts.filter(account => !isCreditCardAccount(account));
  const accountOptions = form.payment_method_kind === 'credit_card'
    ? creditCards
    : bankAccounts.length
      ? bankAccounts
      : activeAccounts;
  const selectedVendor = catalogs?.vendors.find(vendor => vendor.id === invoice?.vendor_id) || null;
  const checkTotal = checkPaymentTotal(form.checkLines);
  const paymentAmountForSave = form.payment_method_kind === 'check' ? checkTotal : form.amount_paid;
  const hasPaymentAmount = Number(parseMoney(paymentAmountForSave) || '0') > 0;
  const selectPaymentKind = (kind: PayInvoiceFormState['payment_method_kind']) => {
    const nextAccountOptions = kind === 'credit_card' ? creditCards : bankAccounts;
    const keepAccountId = nextAccountOptions.some(account => account.id === form.account_id);
    onChange({
      account_id: keepAccountId ? form.account_id : 'none',
      amount_paid: kind === 'check' ? checkPaymentTotal(form.checkLines.length ? form.checkLines : [createCheckPaymentLine(form.amount_paid)]) : form.amount_paid,
      checkLines: kind === 'check' && !form.checkLines.length ? [createCheckPaymentLine(form.amount_paid)] : form.checkLines,
      payment_method_id: methodIdForKind(kind, catalogs?.paymentMethods || []),
      payment_method_kind: kind,
    });
  };
  const updateCheckLine = (id: string, patch: Partial<CheckPaymentLine>) => {
    const nextLines = form.checkLines.map(line => line.id === id ? { ...line, ...patch } : line);
    onChange({
      amount_paid: form.payment_method_kind === 'check' ? checkPaymentTotal(nextLines) : form.amount_paid,
      checkLines: nextLines,
    });
  };
  const addCheckLine = () => {
    const remaining = invoice ? finalAmountToPay(invoiceFinalAmount(invoice), checkTotal) : '';
    const nextAmount = Number(parseMoney(remaining) || '0') > 0 ? remaining : '';
    const nextLines = [...form.checkLines, createCheckPaymentLine(nextAmount)];
    onChange({ amount_paid: checkPaymentTotal(nextLines), checkLines: nextLines });
  };
  const removeCheckLine = (id: string) => {
    const nextLines = form.checkLines.filter(line => line.id !== id);
    onChange({ amount_paid: checkPaymentTotal(nextLines), checkLines: nextLines });
  };
  const applyVendorAddress = (id: string) => {
    if (!selectedVendor?.address) return;
    updateCheckLine(id, { sent_to_address: selectedVendor.address });
  };
  const handleCheckPhotoSelect = async (id: string, file: File) => {
    updateCheckLine(id, { ocr_status: 'scanning', photo_name: file.name });
    try {
      const [photoPreview, detectedAddress] = await Promise.all([
        resizeCheckPhoto(file),
        detectAddressFromPhoto(file).catch(() => ({ address: '', status: 'error' as CheckPaymentLine['ocr_status'], text: '' })),
      ]);
      const currentLine = form.checkLines.find(line => line.id === id);
      updateCheckLine(id, {
        detected_address: detectedAddress.address || '',
        ocr_status: detectedAddress.status,
        ocr_text: detectedAddress.text || '',
        photo_blob: dataUrlToBlob(photoPreview),
        photo_name: file.name,
        photo_path: '',
        photo_preview: photoPreview,
        sent_to_address: detectedAddress.address && !currentLine?.sent_to_address.trim()
          ? detectedAddress.address
          : currentLine?.sent_to_address || '',
      });
    } catch {
      updateCheckLine(id, { ocr_status: 'error', photo_name: file.name });
    }
  };

  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pay invoice</DialogTitle>
          <DialogDescription>
            Record the payment details and move this invoice to Paid invoices.
          </DialogDescription>
        </DialogHeader>

        {invoice && (
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <div className="text-xs text-muted-foreground">Vendor</div>
                <div className="font-medium">{invoice.accounting_vendors?.name || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Invoice</div>
                <div className="font-medium">{compactMultiLine(invoice.invoice_number) || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Due date</div>
                <div className="font-medium">{invoice.due_date || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Final amount</div>
                <div className="font-semibold"><MoneyText value={invoiceFinalAmount(invoice)} /></div>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Payment date</Label>
            <Input type="date" value={form.payment_date} onChange={event => onChange({ payment_date: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Amount paid</Label>
            {form.payment_method_kind === 'check' ? (
              <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm font-semibold tabular-nums">
                <MoneyText value={checkTotal} />
              </div>
            ) : (
              <Input inputMode="decimal" value={form.amount_paid} onChange={event => onChange({ amount_paid: event.target.value })} />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={form.category_id} onValueChange={value => onChange({ category_id: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {catalogs?.categories.map(category => (
                  <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Payment method</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={form.payment_method_kind === 'credit_card' ? 'default' : 'outline'}
                onClick={() => selectPaymentKind('credit_card')}
              >
                Credit Card
              </Button>
              <Button
                type="button"
                variant={form.payment_method_kind === 'check' ? 'default' : 'outline'}
                onClick={() => selectPaymentKind('check')}
              >
                Check
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{form.payment_method_kind === 'credit_card' ? 'Credit card used' : 'Bank/check account used'}</Label>
            <Select value={form.account_id} onValueChange={value => onChange({ account_id: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  {form.payment_method_kind === 'credit_card' ? 'No credit card selected' : 'No account selected'}
                </SelectItem>
                {accountOptions.map(account => (
                  <SelectItem key={account.id} value={account.id}>{accountLabel(account)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Vendor account #</Label>
            <Input value={form.account_number} onChange={event => onChange({ account_number: event.target.value })} />
          </div>
        </div>

        {form.payment_method_kind === 'credit_card' && (
          <div className="rounded-lg border bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">Credit cards on file</div>
                <div className="text-xs text-muted-foreground">Select the card used for this invoice payment.</div>
              </div>
              <Badge variant="outline">{creditCards.length}</Badge>
            </div>
            {creditCards.length ? (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {creditCards.map(account => (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => onChange({ account_id: account.id })}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                      form.account_id === account.id
                        ? 'border-primary bg-primary/8 text-primary'
                        : 'bg-background hover:border-primary/40'
                    )}
                  >
                    <span className="block font-semibold">{account.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {account.brand || 'Card'}{account.last_four ? ` ending ${account.last_four}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-center text-sm text-muted-foreground">
                No credit cards saved yet. Add them from Card payments.
              </div>
            )}
          </div>
        )}

        {form.payment_method_kind === 'check' && (
          <div className="space-y-3 rounded-lg border bg-muted/10 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Label>Checks sent</Label>
                <div className="mt-1 text-xs text-muted-foreground">
                  Split this payment into one or more checks.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Total: <MoneyText value={checkTotal} /></Badge>
                <Button type="button" variant="outline" onClick={addCheckLine} className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add check
                </Button>
              </div>
            </div>

            {form.checkLines.length ? (
              <div className="space-y-3">
                {form.checkLines.map((line, index) => (
                  <div key={line.id} className="space-y-3 rounded-lg border bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">Check {index + 1}</div>
                      {form.checkLines.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeCheckLine(line.id)} aria-label="Remove check">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[minmax(140px,0.8fr)_140px_minmax(220px,1.2fr)]">
                      <div className="space-y-1.5">
                        <Label>Check #</Label>
                        <Input value={line.check_number} onChange={event => updateCheckLine(line.id, { check_number: event.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Amount</Label>
                        <Input inputMode="decimal" value={line.amount} onChange={event => updateCheckLine(line.id, { amount: event.target.value })} placeholder="0.00" />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Label>Sent to address</Label>
                          {selectedVendor?.address && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => applyVendorAddress(line.id)} className="h-7 gap-1 px-2">
                              <MapPin className="h-3.5 w-3.5" />
                              Vendor
                            </Button>
                          )}
                        </div>
                        <Textarea
                          value={line.sent_to_address}
                          onChange={event => updateCheckLine(line.id, { sent_to_address: event.target.value })}
                          className="min-h-[76px]"
                        />
                      </div>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[minmax(180px,0.7fr)_minmax(0,1fr)] lg:items-center">
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <Camera className="h-4 w-4" />
                          Check photo
                        </Label>
                        <Input
                          accept="image/*"
                          capture="environment"
                          type="file"
                          onChange={event => {
                            const file = event.target.files?.[0];
                            if (file) void handleCheckPhotoSelect(line.id, file);
                            event.currentTarget.value = '';
                          }}
                        />
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        {line.photo_preview && (
                          <img
                            src={line.photo_preview}
                            alt={`Check ${index + 1}`}
                            className="h-20 w-32 rounded-md border object-cover"
                          />
                        )}
                        <div className="text-xs text-muted-foreground">
                          {line.photo_name && <div className="font-medium text-foreground">{line.photo_name}</div>}
                          {line.ocr_status === 'scanning' && 'Scanning address...'}
                          {line.ocr_status === 'found' && 'Address detected from photo.'}
                          {line.ocr_status === 'not_found' && 'No address detected from photo.'}
                          {line.ocr_status === 'unavailable' && 'Auto address is not available in this browser.'}
                          {line.ocr_status === 'error' && 'Could not scan this photo.'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-white px-3 py-4 text-center text-sm text-muted-foreground">
                Add a check to record the check number and amount.
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Reference / confirmation</Label>
            <Textarea value={form.reference_number} onChange={event => onChange({ reference_number: event.target.value })} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Payment notes</Label>
          <Textarea value={form.notes} onChange={event => onChange({ notes: event.target.value })} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving || !hasPaymentAmount} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Save payment and move to Paid invoices
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CombinedInvoicePaymentDialog({
  form,
  invoices,
  onChange,
  onClose,
  onSave,
  open,
  saving,
}: {
  form: CombinedInvoicePaymentFormState;
  invoices: AccountingInvoice[];
  onChange: (patch: Partial<CombinedInvoicePaymentFormState>) => void;
  onClose: () => void;
  onSave: () => void;
  open: boolean;
  saving: boolean;
}) {
  const { data: catalogs } = useAccountingCatalogs();
  const selectedVendor = catalogs?.vendors.find(vendor => vendor.id === form.vendor_id) || null;
  const activeAccounts = (catalogs?.accounts || []).filter(account => account.active !== false);
  const bankAccounts = activeAccounts.filter(account => !isCreditCardAccount(account));
  const accountOptions = bankAccounts.length ? bankAccounts : activeAccounts;
  const candidateInvoices = useMemo(
    () => invoices
      .filter(invoice => !isInvoicePaid(invoice) && invoice.vendor_id === form.vendor_id)
      .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || ''))),
    [form.vendor_id, invoices]
  );
  const selectedInvoiceIdSet = useMemo(() => new Set(form.selectedInvoiceIds), [form.selectedInvoiceIds]);
  const selectedInvoices = useMemo(
    () => candidateInvoices.filter(invoice => selectedInvoiceIdSet.has(invoice.id)),
    [candidateInvoices, selectedInvoiceIdSet]
  );
  const selectedTotal = addMoney(selectedInvoices.map(invoice => invoice.final_amount_to_pay || finalAmountToPay(invoice.amount, invoice.credit)));
  const checkTotal = checkPaymentTotal(form.checkLines);
  const balanceCents = decimalStringToCents(selectedTotal) - decimalStringToCents(checkTotal);
  const balanceAmount = moneyDifference(selectedTotal, checkTotal);
  const hasCheckTotal = decimalStringToCents(checkTotal) > 0n;
  const canSave = form.vendor_id !== 'none' && selectedInvoices.length > 0 && hasCheckTotal && balanceCents === 0n;
  const allSelected = candidateInvoices.length > 0 && candidateInvoices.every(invoice => selectedInvoiceIdSet.has(invoice.id));

  const selectVendor = (vendorId: string) => {
    const vendor = catalogs?.vendors.find(item => item.id === vendorId);
    const defaultMethod = catalogs?.paymentMethods.find(item => item.id === vendor?.default_payment_method_id);
    const methodId = methodIdForKind('check', catalogs?.paymentMethods || []);
    const vendorMethodIsCheck = paymentKindFromMethodName(defaultMethod?.name) === 'check';
    const keepAccountId = accountOptions.some(account => account.id === form.account_id);
    onChange({
      account_id: keepAccountId ? form.account_id : 'none',
      account_number: vendor?.account_number || '',
      checkLines: form.checkLines.length ? form.checkLines : [createCheckPaymentLine('', form.payment_date)],
      payment_method_id: vendorMethodIsCheck && defaultMethod ? defaultMethod.id : methodId,
      selectedInvoiceIds: [],
      sent_to_address: vendor?.address || '',
      vendor_id: vendorId,
    });
  };

  const toggleInvoice = (invoiceId: string, checked: boolean) => {
    onChange({
      selectedInvoiceIds: checked
        ? [...form.selectedInvoiceIds, invoiceId]
        : form.selectedInvoiceIds.filter(id => id !== invoiceId),
    });
  };

  const toggleAll = (checked: boolean) => {
    onChange({
      selectedInvoiceIds: checked ? candidateInvoices.map(invoice => invoice.id) : [],
    });
  };

  const updateCheckLine = (id: string, patch: Partial<CheckPaymentLine>) => {
    onChange({
      checkLines: form.checkLines.map(line => line.id === id ? { ...line, ...patch } : line),
    });
  };

  const addCheckLine = () => {
    const nextAmount = balanceCents > 0n ? balanceAmount : '';
    onChange({
      checkLines: [
        ...form.checkLines,
        createCheckPaymentLine(nextAmount, form.payment_date),
      ],
    });
  };

  const removeCheckLine = (id: string) => {
    const nextLines = form.checkLines.filter(line => line.id !== id);
    onChange({ checkLines: nextLines.length ? nextLines : [createCheckPaymentLine('', form.payment_date)] });
  };

  const applyVendorAddress = () => {
    if (!selectedVendor?.address) return;
    onChange({ sent_to_address: selectedVendor.address });
  };

  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pay multiple invoices</DialogTitle>
          <DialogDescription>
            Create one combined vendor payment with multiple checks.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_260px]">
          <div className="space-y-1.5">
            <Label>Vendor</Label>
            <Select value={form.vendor_id} onValueChange={selectVendor}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Choose vendor</SelectItem>
                {catalogs?.vendors.map(vendor => (
                  <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Payment date</Label>
            <Input type="date" value={form.payment_date} onChange={event => onChange({ payment_date: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Bank/check account used</Label>
            <Select value={form.account_id} onValueChange={value => onChange({ account_id: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No account selected</SelectItem>
                {accountOptions.map(account => (
                  <SelectItem key={account.id} value={account.id}>{accountLabel(account)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(180px,0.7fr)_minmax(180px,0.7fr)_minmax(0,1fr)]">
          <div className="space-y-1.5">
            <Label>Vendor account #</Label>
            <Input value={form.account_number} onChange={event => onChange({ account_number: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={form.category_id} onValueChange={value => onChange({ category_id: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Keep invoice categories</SelectItem>
                {catalogs?.categories.map(category => (
                  <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <div className="text-xs text-muted-foreground">Selected</div>
              <div className="text-lg font-semibold tabular-nums"><MoneyText value={selectedTotal} /></div>
            </div>
            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <div className="text-xs text-muted-foreground">Checks total</div>
              <div className="text-lg font-semibold tabular-nums"><MoneyText value={checkTotal} /></div>
            </div>
            <div className={cn(
              'rounded-lg border px-3 py-2',
              balanceCents === 0n && hasCheckTotal ? 'bg-emerald-50 text-emerald-950' : 'bg-amber-50 text-amber-950'
            )}>
              <div className="text-xs">{balanceCents < 0n ? 'Over by' : 'Remaining'}</div>
              <div className="text-lg font-semibold tabular-nums"><MoneyText value={balanceAmount} /></div>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border bg-muted/10 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label>Open invoices</Label>
              <div className="text-xs text-muted-foreground">{selectedInvoices.length} selected from this vendor</div>
            </div>
            <Badge variant="outline">{candidateInvoices.length} open</Badge>
          </div>
          {form.vendor_id === 'none' ? (
            <EmptyState label="Choose a vendor to see open invoices." />
          ) : candidateInvoices.length ? (
            <div className="max-h-[300px] overflow-auto rounded-md border bg-white">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-white">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="Select all invoices"
                        checked={allSelected}
                        onCheckedChange={checked => toggleAll(checked === true)}
                      />
                    </TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Store</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Final</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidateInvoices.map(invoice => {
                    const checked = selectedInvoiceIdSet.has(invoice.id);
                    return (
                      <TableRow key={invoice.id} className={cn('cursor-pointer', checked ? 'bg-primary/5' : dueRowClass(invoice))}>
                        <TableCell>
                          <Checkbox
                            aria-label={`Select invoice ${compactMultiLine(invoice.invoice_number) || invoice.id}`}
                            checked={checked}
                            onCheckedChange={nextChecked => toggleInvoice(invoice.id, nextChecked === true)}
                          />
                        </TableCell>
                        <TableCell className="max-w-[260px] whitespace-normal font-medium">{compactMultiLine(invoice.invoice_number) || '-'}</TableCell>
                        <TableCell>{invoice.accounting_stores?.name || '-'}</TableCell>
                        <TableCell>{invoice.due_date || '-'}</TableCell>
                        <TableCell className="text-right font-semibold">
                          <MoneyText value={invoice.final_amount_to_pay || finalAmountToPay(invoice.amount, invoice.credit)} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState label="No open invoices found for this vendor." />
          )}
        </div>

        <div className="space-y-3 rounded-lg border bg-muted/10 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label>Checks</Label>
              <div className="text-xs text-muted-foreground">Same mailing address for all checks.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Total: <MoneyText value={checkTotal} /></Badge>
              <Button type="button" variant="outline" onClick={addCheckLine} className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add check
              </Button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px] xl:grid-cols-[minmax(0,1fr)_260px]">
            <div className="overflow-x-auto rounded-md border bg-white">
              <div className="min-w-[490px]">
                <div className="grid grid-cols-[32px_124px_104px_148px_34px] gap-2 border-b bg-muted/30 px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
                  <span>#</span>
                  <span>Check #</span>
                  <span>Amount</span>
                  <span>Date sent</span>
                  <span />
                </div>
                <div className="divide-y">
                  {form.checkLines.map((line, index) => (
                    <div key={line.id} className="grid grid-cols-[32px_124px_104px_148px_34px] gap-2 px-2 py-1.5">
                      <div className="flex items-center text-sm font-semibold text-muted-foreground">{index + 1}</div>
                      <Input
                        value={line.check_number}
                        onChange={event => updateCheckLine(line.id, { check_number: event.target.value })}
                        placeholder="Check number"
                        className="h-8 px-2"
                      />
                      <Input
                        inputMode="decimal"
                        value={line.amount}
                        onChange={event => updateCheckLine(line.id, { amount: event.target.value })}
                        placeholder="0.00"
                        className="h-8 px-2"
                      />
                      <Input
                        type="date"
                        value={line.sent_date}
                        onChange={event => updateCheckLine(line.id, { sent_date: event.target.value })}
                        className="h-8 px-2"
                      />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeCheckLine(line.id)} aria-label="Remove check" className="h-8 w-8">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>Sent to address</Label>
                {selectedVendor?.address && (
                  <Button type="button" variant="ghost" size="sm" onClick={applyVendorAddress} className="h-7 gap-1 px-2">
                    <MapPin className="h-3.5 w-3.5" />
                    Vendor
                  </Button>
                )}
              </div>
              <Textarea
                value={form.sent_to_address}
                onChange={event => onChange({ sent_to_address: event.target.value })}
                className="min-h-[84px] text-sm"
                placeholder="Mailing address for all checks"
              />
              <div className="text-xs text-muted-foreground">
                Saved on every check in this batch.
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Reference / confirmation</Label>
            <Textarea value={form.reference_number} onChange={event => onChange({ reference_number: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Payment notes</Label>
            <Textarea value={form.notes} onChange={event => onChange({ notes: event.target.value })} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          {balanceCents !== 0n && (
            <div className="mr-auto text-sm text-muted-foreground">
              Checks must match selected invoices before saving.
            </div>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving || !canSave} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
            Save combined payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AccountingInvoicesPage() {
  const [includeAllInvoices, setIncludeAllInvoices] = useState(false);
  const { data: invoices = [], isLoading, isFetching } = useAccountingInvoices({ includeAll: includeAllInvoices });
  const { data: catalogs } = useAccountingCatalogs();
  const { createInvoice, updateInvoice } = useAccountingInvoiceMutations();
  const { createInvoicePayment } = useAccountingPaymentMutations();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AccountingStatus>('all');
  const [flagFilter, setFlagFilter] = useState('all');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [balanceSearch, setBalanceSearch] = useState('');
  const [form, setForm] = useState<InvoiceFormState>(EMPTY_FORM);
  const [editing, setEditing] = useState<AccountingInvoice | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState<AccountingInvoice | null>(null);
  const [payForm, setPayForm] = useState<PayInvoiceFormState>({
    account_id: 'none',
    account_number: '',
    amount_paid: '',
    category_id: 'none',
    checkLines: [],
    check_number: '',
    notes: '',
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method_kind: 'check',
    payment_method_id: 'none',
    reference_number: '',
  });
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [combinedPayForm, setCombinedPayForm] = useState<CombinedInvoicePaymentFormState>(() => createCombinedInvoicePaymentForm());
  const [combinedPayDialogOpen, setCombinedPayDialogOpen] = useState(false);
  const [combinedPaySaving, setCombinedPaySaving] = useState(false);
  const [loadingInvoiceAction, setLoadingInvoiceAction] = useState<{ action: 'edit' | 'pay'; id: string } | null>(null);

  const displayInvoices = useMemo(() => {
    if (!catalogs) return invoices;
    const vendorsById = new Map(catalogs.vendors.map(vendor => [vendor.id, vendor]));
    const storesById = new Map(catalogs.stores.map(store => [store.id, store]));
    const categoriesById = new Map(catalogs.categories.map(category => [category.id, category]));
    return invoices.map(invoice => ({
      ...invoice,
      accounting_vendors: invoice.vendor_id ? vendorsById.get(invoice.vendor_id) || null : null,
      accounting_stores: invoice.store_id ? storesById.get(invoice.store_id) || null : null,
      accounting_invoice_categories: invoice.category_id ? categoriesById.get(invoice.category_id) || null : null,
    }));
  }, [catalogs, invoices]);

  const filtered = useMemo(() => {
    const query = normalizeText(search);
    return displayInvoices.filter(invoice => {
      if (statusFilter !== 'all' && invoice.status !== statusFilter) return false;
      if (vendorFilter !== 'all' && (invoice.vendor_id || 'none') !== vendorFilter) return false;
      if (flagFilter === 'overdue' && !isOverdue(invoice)) return false;
      if (flagFilter === 'due-soon' && !isDueSoon(invoice, 7)) return false;
      if (flagFilter === 'credit' && !hasCreditApplied(invoice)) return false;
      if (flagFilter === 'high' && !isHighAmount(invoice)) return false;
      if (!query) return true;
      const haystack = normalizeText([
        invoice.accounting_vendors?.name,
        invoice.accounting_stores?.name,
        invoice.invoice_number,
        invoice.notes,
        invoice.accounting_invoice_categories?.name,
        paymentTermsLabel(invoice.accounting_vendors?.payment_terms_days),
      ].filter(Boolean).join(' '));
      return haystack.includes(query);
    });
  }, [displayInvoices, flagFilter, search, statusFilter, vendorFilter]);

  const vendorBalances = useMemo(() => summarizeVendorBalances(displayInvoices), [displayInvoices]);
  const visibleVendorBalances = useMemo(() => {
    const query = normalizeText(balanceSearch);
    const dueWithin15Rows = vendorBalances.filter(row => decimalStringToCents(row.dueNext15Amount) > 0n);
    const rows = vendorFilter === 'all'
      ? dueWithin15Rows
      : dueWithin15Rows.filter(row => (row.vendorId || 'none') === vendorFilter);
    const searchedRows = query ? rows.filter(row => normalizeText(row.vendorName).includes(query)) : rows;
    return [...searchedRows].sort((a, b) => {
      const amountA = decimalStringToCents(a.dueNext15Amount);
      const amountB = decimalStringToCents(b.dueNext15Amount);
      if (amountA !== amountB) return amountA > amountB ? -1 : 1;
      return a.vendorName.localeCompare(b.vendorName);
    });
  }, [balanceSearch, vendorBalances, vendorFilter]);
  const visibleVendorOwedTotal = useMemo(
    () => addMoney(visibleVendorBalances.map(row => row.dueNext15Amount)),
    [visibleVendorBalances]
  );
  const filtersActive =
    Boolean(search.trim()) ||
    Boolean(balanceSearch.trim()) ||
    statusFilter !== 'all' ||
    flagFilter !== 'all' ||
    vendorFilter !== 'all';

  const resetFilters = () => {
    setSearch('');
    setBalanceSearch('');
    setStatusFilter('all');
    setFlagFilter('all');
    setVendorFilter('all');
  };

  const loadInvoiceDetail = async (invoice: AccountingInvoice) => {
    const rawPayload = invoice.raw_payload && typeof invoice.raw_payload === 'object' ? invoice.raw_payload : {};
    if (invoice.source_file_sha256 || Object.keys(rawPayload).length) return invoice;
    return queryClient.fetchQuery({
      queryKey: ['accounting', 'invoice-detail', invoice.id],
      queryFn: () => fetchAccountingInvoiceById(invoice.id),
      staleTime: 5 * 60_000,
    });
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openCombinedPay = () => {
    const initialVendorId = vendorFilter !== 'all' ? vendorFilter : 'none';
    const vendor = catalogs?.vendors.find(item => item.id === initialVendorId);
    const defaultMethod = catalogs?.paymentMethods.find(item => item.id === vendor?.default_payment_method_id);
    const methodId = methodIdForKind('check', catalogs?.paymentMethods || []);
    const activeAccounts = (catalogs?.accounts || []).filter(account => account.active !== false);
    const bankAccounts = activeAccounts.filter(account => !isCreditCardAccount(account));
    const accountOptions = bankAccounts.length ? bankAccounts : activeAccounts;
    setCombinedPayForm({
      ...createCombinedInvoicePaymentForm(),
      account_id: 'none',
      account_number: vendor?.account_number || '',
      payment_method_id: paymentKindFromMethodName(defaultMethod?.name) === 'check' && defaultMethod
        ? defaultMethod.id
        : methodId,
      sent_to_address: vendor?.address || '',
      vendor_id: vendor ? vendor.id : 'none',
      ...(accountOptions.length === 1 ? { account_id: accountOptions[0].id } : {}),
    });
    setCombinedPayDialogOpen(true);
  };

  const openEdit = async (invoice: AccountingInvoice) => {
    setLoadingInvoiceAction({ action: 'edit', id: invoice.id });
    try {
      const detailedInvoice = await loadInvoiceDetail(invoice);
      setEditing(detailedInvoice);
      setForm(formFromInvoice(detailedInvoice));
      setDialogOpen(true);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not load invoice details'));
    } finally {
      setLoadingInvoiceAction(null);
    }
  };

  const save = async () => {
    const cleanedCredits = cleanCreditLines(form.creditLines);
    const totalCredit = addMoney(cleanedCredits.map(line => line.amount || '0.00'));
    const selectedVendorForSave = catalogs?.vendors.find(vendor => vendor.id === form.vendor_id);
    const payload = {
      amount: form.amount,
      category_id: form.category_id === 'none' ? null : form.category_id,
      credit: totalCredit,
      due_date: form.due_date || null,
      invoice_number: invoiceNumbersToText(form.invoiceNumbers) || null,
      issue_date: form.issue_date || null,
      notes: form.notes || null,
      paid: form.status === 'paid',
      raw_payload: {
        ...(editing?.raw_payload || {}),
        manual_credit_lines: cleanedCredits,
        manual_credit_reason_summary: cleanedCredits.map(line => line.reason).filter(Boolean).join('; ') || null,
        manual_location_account_rows: form.locationAccounts.map(row => ({
          account_id: row.account_id === 'none' ? null : row.account_id,
          account_number: row.account_number.trim() || null,
          store_id: row.store_id === 'none' ? null : row.store_id,
          store_name: row.store_name || null,
        })),
        vendor_payment_terms_days: selectedVendorForSave?.payment_terms_days ?? null,
      },
      status: form.status,
      store_id: form.store_id === 'none' ? null : form.store_id,
      vendor_id: form.vendor_id === 'none' ? null : form.vendor_id,
    };

    try {
      if (editing) {
        await updateInvoice.mutateAsync({ id: editing.id, patch: payload });
        toast.success('Invoice updated');
      } else {
        await createInvoice.mutateAsync(payload);
        toast.success('Invoice created');
      }
      setDialogOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Invoice save failed'));
    }
  };

  const openPay = async (invoice: AccountingInvoice) => {
    setLoadingInvoiceAction({ action: 'pay', id: invoice.id });
    try {
      const detailedInvoice = await loadInvoiceDetail(invoice);
      const vendor = catalogs?.vendors.find(item => item.id === detailedInvoice.vendor_id);
      const defaultMethod = catalogs?.paymentMethods.find(item => item.id === vendor?.default_payment_method_id);
      const kind = paymentKindFromMethodName(defaultMethod?.name);
      const activeAccounts = (catalogs?.accounts || []).filter(account => account.active !== false);
      const creditCards = activeAccounts.filter(isCreditCardAccount);
      const bankAccounts = activeAccounts.filter(account => !isCreditCardAccount(account));
      const accountOptions = kind === 'credit_card' ? creditCards : bankAccounts.length ? bankAccounts : activeAccounts;
      const locationAccount = bestLocationAccountForInvoice(detailedInvoice);
      const locationAccountIsValid = Boolean(locationAccount?.account_id && accountOptions.some(account => account.id === locationAccount.account_id));
      const amountToPay = invoiceFinalAmount(detailedInvoice);
      setPayingInvoice(detailedInvoice);
      setPayForm({
        account_id: locationAccountIsValid
          ? locationAccount?.account_id || 'none'
          : kind === 'credit_card' && creditCards.length === 1
            ? creditCards[0].id
            : 'none',
        account_number: locationAccount?.account_number || vendorAccountNumberForStore(vendor, detailedInvoice.store_id),
        amount_paid: amountToPay,
        category_id: detailedInvoice.category_id || 'none',
        checkLines: [createCheckPaymentLine(amountToPay)],
        check_number: '',
        notes: '',
        payment_date: new Date().toISOString().slice(0, 10),
        payment_method_kind: kind,
        payment_method_id: methodIdForKind(kind, catalogs?.paymentMethods || []),
        reference_number: '',
      });
      setPayDialogOpen(true);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not load invoice details'));
    } finally {
      setLoadingInvoiceAction(null);
    }
  };

  const payInvoice = async () => {
    if (!payingInvoice) return;
    const categoryId = payForm.category_id === 'none' ? null : payForm.category_id;
    try {
      const paymentId = createLocalId('accounting-payment');
      const checkLines = payForm.payment_method_kind === 'check'
        ? await prepareCheckPaymentLinesForSave(payForm.checkLines, paymentId)
        : [];
      const amountPaid = payForm.payment_method_kind === 'check' ? checkPaymentTotal(payForm.checkLines) : payForm.amount_paid;
      const checkNumbers = payForm.payment_method_kind === 'check'
        ? checkLines.map(line => line.check_number).filter(Boolean).join('\n')
        : payForm.check_number;
      const checkAddresses = Array.from(new Set(checkLines.map(line => line.confirmed_address || line.sent_to_address).filter(Boolean)));
      await createInvoicePayment.mutateAsync({
        account_id: payForm.account_id === 'none' ? null : payForm.account_id,
        account_number: payForm.account_number || null,
        amount_paid: amountPaid,
        category_id: categoryId,
        check_number: checkNumbers || null,
        id: paymentId,
        invoice_id: payingInvoice.id,
        invoice_number: payingInvoice.invoice_number,
        notes: payForm.notes || null,
        payment_date: payForm.payment_date || null,
        payment_method_id: payForm.payment_method_id === 'none' ? null : payForm.payment_method_id,
        raw_payload: {
          check_split_lines: payForm.payment_method_kind === 'check' ? checkLines : [],
          check_split_total: payForm.payment_method_kind === 'check' ? amountPaid : null,
          mailed_to_addresses: payForm.payment_method_kind === 'check' ? checkAddresses : [],
          payment_method_kind: payForm.payment_method_kind,
        },
        reference_number: payForm.reference_number || null,
        status: 'Paid',
        store_id: payingInvoice.store_id,
        vendor_id: payingInvoice.vendor_id,
      });
      await updateInvoice.mutateAsync({
        id: payingInvoice.id,
        patch: {
          category_id: categoryId ?? payingInvoice.category_id,
          paid: true,
          status: 'paid',
        },
      });
      toast.success('Payment created and invoice moved to Paid invoices');
      setPayDialogOpen(false);
      setPayingInvoice(null);
      navigate('/accounting/paid-invoices');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not create payment'));
    }
  };

  const payMultipleInvoices = async () => {
    const selectedInvoices = displayInvoices.filter(invoice => combinedPayForm.selectedInvoiceIds.includes(invoice.id));
    if (!selectedInvoices.length) return;

    const selectedTotal = addMoney(selectedInvoices.map(invoice => invoice.final_amount_to_pay || finalAmountToPay(invoice.amount, invoice.credit)));
    const checkTotal = checkPaymentTotal(combinedPayForm.checkLines);
    if (decimalStringToCents(selectedTotal) !== decimalStringToCents(checkTotal)) {
      toast.error('Check total must match selected invoices');
      return;
    }

    const batchId = createLocalId('combined-payment-batch');
    const categoryId = combinedPayForm.category_id === 'none' ? null : combinedPayForm.category_id;
    const selectedVendor = catalogs?.vendors.find(vendor => vendor.id === combinedPayForm.vendor_id);
    setCombinedPaySaving(true);
    try {
      const checksForSave = combinedPayForm.checkLines.map(line => ({
        ...line,
        sent_to_address: combinedPayForm.sent_to_address,
      }));
      const checkLines = await prepareCheckPaymentLinesForSave(checksForSave, batchId);
      const checkNumbers = checkLines.map(line => line.check_number).filter(Boolean).join('\n');
      const checkAddresses = Array.from(new Set(checkLines.map(line => line.confirmed_address || line.sent_to_address).filter(Boolean)));
      const allocations = selectedInvoices.map(invoice => ({
        amount_applied: invoice.final_amount_to_pay || finalAmountToPay(invoice.amount, invoice.credit),
        due_date: invoice.due_date,
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        store_id: invoice.store_id,
      }));

      for (const invoice of selectedInvoices) {
        const amountApplied = invoice.final_amount_to_pay || finalAmountToPay(invoice.amount, invoice.credit);
        await createInvoicePayment.mutateAsync({
          account_id: combinedPayForm.account_id === 'none' ? null : combinedPayForm.account_id,
          account_number: combinedPayForm.account_number || vendorAccountNumberForStore(selectedVendor, invoice.store_id) || null,
          amount_paid: amountApplied,
          category_id: categoryId ?? invoice.category_id,
          check_number: checkNumbers || null,
          id: createLocalId('accounting-payment'),
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          notes: combinedPayForm.notes || null,
          payment_date: combinedPayForm.payment_date || null,
          payment_method_id: combinedPayForm.payment_method_id === 'none' ? null : combinedPayForm.payment_method_id,
          raw_payload: {
            check_split_lines: checkLines,
            check_split_total: checkTotal,
            combined_payment: true,
            combined_payment_allocations: allocations,
            combined_payment_batch_id: batchId,
            combined_payment_invoice_count: selectedInvoices.length,
            combined_payment_invoice_ids: selectedInvoices.map(row => row.id),
            combined_payment_total: selectedTotal,
            mailed_to_addresses: checkAddresses,
            payment_method_kind: 'check',
          },
          reference_number: combinedPayForm.reference_number || null,
          status: 'Paid',
          store_id: invoice.store_id,
          vendor_id: invoice.vendor_id,
        });
        await updateInvoice.mutateAsync({
          id: invoice.id,
          patch: {
            category_id: categoryId ?? invoice.category_id,
            paid: true,
            status: 'paid',
          },
        });
      }

      toast.success(`Combined payment saved for ${selectedInvoices.length} invoices`);
      setCombinedPayForm(createCombinedInvoicePaymentForm());
      setCombinedPayDialogOpen(false);
      navigate('/accounting/paid-invoices');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not save combined payment'));
    } finally {
      setCombinedPaySaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <AccountingPageHeader
        title="Invoices"
        description="Pending and paid AP invoices imported from Modern State plus manual AP entries."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={openCombinedPay} className="gap-1.5">
              <ListChecks className="h-4 w-4" />
              Pay multiple
            </Button>
            <Button onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Create invoice
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="space-y-5 p-4">
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Filters</h2>
                <Badge variant="outline">{filtered.length} of {invoices.length}</Badge>
                {!includeAllInvoices && (
                  <Badge variant="secondary">First {ACCOUNTING_INITIAL_LIST_LIMIT}</Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {!includeAllInvoices && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIncludeAllInvoices(true)}
                    disabled={isFetching}
                    className="w-full gap-1.5 sm:w-auto"
                  >
                    {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Load all
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={resetFilters} disabled={!filtersActive} className="w-full gap-1.5 sm:w-auto">
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-[minmax(280px,1fr)_240px_170px_170px]">
              <div className="relative md:col-span-2 lg:col-span-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search vendor, invoice, store, notes"
                  className="pl-9"
                />
              </div>
              <Select value={vendorFilter} onValueChange={setVendorFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All vendors</SelectItem>
                  <SelectItem value="none">No vendor</SelectItem>
                  {catalogs?.vendors.map(vendor => (
                    <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={value => setStatusFilter(value as 'all' | AccountingStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
              <Select value={flagFilter} onValueChange={setFlagFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All flags</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="due-soon">Due soon</SelectItem>
                  <SelectItem value="credit">Credit applied</SelectItem>
                  <SelectItem value="high">High amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="rounded-lg border bg-white p-3">
              <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold">Due within 15 days by vendor</h2>
                    <Badge variant="outline">{visibleVendorBalances.length}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Due 15d total: <span className="font-semibold text-foreground"><MoneyText value={visibleVendorOwedTotal} /></span>
                  </p>
                </div>
                <div className="relative lg:w-[260px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={balanceSearch}
                    onChange={event => setBalanceSearch(event.target.value)}
                    placeholder="Find vendor owed"
                    className="pl-9"
                  />
                </div>
              </div>
              {isLoading ? (
                <LoadingState label="Loading vendor balances..." />
              ) : visibleVendorBalances.length ? (
                <div className="max-h-[340px] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-white">
                      <TableRow>
                        <TableHead>Vendor</TableHead>
                        <TableHead className="text-right">Invoices</TableHead>
                        <TableHead className="text-right">Due 15d</TableHead>
                        <TableHead className="text-right">Total owed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleVendorBalances.map(row => (
                        <TableRow key={row.vendorId || row.vendorName}>
                          <TableCell className="min-w-[180px] font-medium">{row.vendorName}</TableCell>
                          <TableCell className="text-right">{row.dueNext15Count}</TableCell>
                          <TableCell className="text-right"><MoneyText value={row.dueNext15Amount} /></TableCell>
                          <TableCell className="text-right font-semibold"><MoneyText value={row.totalAmount} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState label="No vendor balances due within 15 days for the current filter." />
              )}
            </div>
            <div className="self-start rounded-lg border bg-muted/20 p-3 text-sm">
              <div className="font-semibold">Due color legend</div>
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2"><span className="h-4 w-8 rounded bg-rose-100" /> Due in 8 days or overdue</div>
                <div className="flex items-center gap-2"><span className="h-4 w-8 rounded bg-amber-100" /> Due in 15 days</div>
                <div className="flex items-center gap-2"><span className="h-4 w-8 rounded bg-emerald-100" /> Due in 30 days</div>
                <div className="flex items-center gap-2"><span className="h-4 w-8 rounded border bg-white" /> More than 30 days / paid</div>
              </div>
            </div>
          </div>

          {isLoading ? (
            <LoadingState label="Loading invoices..." />
          ) : filtered.length ? (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader className="bg-white">
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Store</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Terms</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Final</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(invoice => {
                    const isPayLoading = loadingInvoiceAction?.id === invoice.id && loadingInvoiceAction.action === 'pay';
                    const isEditLoading = loadingInvoiceAction?.id === invoice.id && loadingInvoiceAction.action === 'edit';
                    const actionDisabled = Boolean(loadingInvoiceAction);
                    return (
                      <TableRow key={invoice.id} className={dueRowClass(invoice)}>
                        <TableCell className="min-w-[160px] font-medium">{invoice.accounting_vendors?.name || '-'}</TableCell>
                        <TableCell>{invoice.accounting_stores?.name || '-'}</TableCell>
                        <TableCell className="max-w-[220px] whitespace-normal">{compactMultiLine(invoice.invoice_number) || '-'}</TableCell>
                        <TableCell>{invoice.due_date || '-'}</TableCell>
                        <TableCell>
                          {invoice.accounting_vendors?.payment_terms_days == null
                            ? '-'
                            : <Badge variant="outline">{paymentTermsLabel(invoice.accounting_vendors.payment_terms_days)}</Badge>}
                        </TableCell>
                        <TableCell className="text-right"><MoneyText value={invoice.amount} /></TableCell>
                        <TableCell className="text-right">
                          <div><MoneyText value={invoice.credit} /></div>
                          {hasCreditApplied(invoice) && (
                            <div className="text-xs text-muted-foreground">{creditSummary(invoice)}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium"><MoneyText value={invoice.final_amount_to_pay || finalAmountToPay(invoice.amount, invoice.credit)} /></TableCell>
                        <TableCell><InvoiceStatusBadges invoice={invoice} /></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {!isInvoicePaid(invoice) && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void openPay(invoice)}
                                disabled={actionDisabled}
                                className="gap-1.5"
                              >
                                {isPayLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                Pay
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => void openEdit(invoice)}
                              disabled={actionDisabled}
                              aria-label="Edit invoice"
                            >
                              {isEditLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Edit className="h-4 w-4" />}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState label="No invoices match the current filters." />
          )}
        </CardContent>
      </Card>

      <InvoiceFormDialog
        form={form}
        mode={editing ? 'edit' : 'create'}
        onChange={patch => setForm(current => ({ ...current, ...patch }))}
        onClose={() => setDialogOpen(false)}
        onSave={() => void save()}
        open={dialogOpen}
        saving={createInvoice.isPending || updateInvoice.isPending}
        sourceInvoice={editing}
      />
      <PayInvoiceDialog
        form={payForm}
        invoice={payingInvoice}
        onChange={patch => setPayForm(current => ({ ...current, ...patch }))}
        onClose={() => setPayDialogOpen(false)}
        onSave={() => void payInvoice()}
        open={payDialogOpen}
        saving={createInvoicePayment.isPending || updateInvoice.isPending}
      />
      <CombinedInvoicePaymentDialog
        form={combinedPayForm}
        invoices={displayInvoices}
        onChange={patch => setCombinedPayForm(current => ({ ...current, ...patch }))}
        onClose={() => setCombinedPayDialogOpen(false)}
        onSave={() => void payMultipleInvoices()}
        open={combinedPayDialogOpen}
        saving={combinedPaySaving}
      />
    </div>
  );
}
