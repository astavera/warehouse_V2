import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  finalAmountToPay,
  invoiceFinalAmount,
  isDueWithin,
  isInvoicePaid,
  normalizeText,
  sortAccountingStores,
  sourceRowHash,
  summarizeAccountingDashboard,
  summarizeVendorBalances,
  truckDuplicateGroupKey,
  type AccountingAccount,
  type AccountingCategory,
  type AccountingCreditCardPayment,
  type AccountingImportBatch,
  type AccountingImportWarning,
  type AccountingInvoice,
  type AccountingInvoicePayment,
  type AccountingPaymentMethod,
  type AccountingPersonalBill,
  type AccountingStatus,
  type AccountingStore,
  type AccountingTruckViolation,
  type AccountingVendor,
} from '@/lib/accounting';
import {
  createLocalAccountingAccount,
  createLocalAccountingCategory,
  createLocalAccountingInvoicePayment,
  createLocalAccountingInvoice,
  createLocalAccountingPaymentMethod,
  createLocalAccountingPersonalBill,
  createLocalAccountingStore,
  createLocalAccountingTruckViolation,
  createLocalAccountingVendor,
  importLocalAccountingTemplate,
  listLocalAccountingAccounts,
  listLocalAccountingCategories,
  listLocalAccountingCreditCardPayments,
  listLocalAccountingImportBatches,
  listLocalAccountingImportWarnings,
  listLocalAccountingInvoicePayments,
  listLocalAccountingInvoices,
  listLocalAccountingPaymentMethods,
  listLocalAccountingPersonalBills,
  listLocalAccountingStores,
  listLocalAccountingTruckViolations,
  listLocalAccountingVendors,
  updateLocalAccountingInvoice,
  updateLocalAccountingAccount,
  updateLocalAccountingCategory,
  updateLocalAccountingPaymentMethod,
  updateLocalAccountingStore,
  updateLocalAccountingVendor,
} from '@/lib/localAccountingData';
import type { AccountingTemplateImport } from '@/lib/accountingExcel';
import { isMockLocal, isRuntimeOffline, shouldUseLocalData } from '@/lib/localWarehouseData';

const accountingDb = supabase as unknown as {
  from: (table: string) => {
    select: (columns?: string) => unknown;
    insert: (payload: unknown) => unknown;
    update: (payload: unknown) => unknown;
    upsert: (payload: unknown, options?: unknown) => unknown;
  };
};

const ACCOUNTING_CHECK_PHOTOS_BUCKET = 'accounting-check-photos';

type QueryLike<T> = PromiseLike<{ data: T | null; error: Error | null }> & {
  order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => QueryLike<T>;
  eq: (column: string, value: unknown) => QueryLike<T>;
  select: (columns?: string) => QueryLike<T>;
  single: () => QueryLike<T>;
};

type InvoicePatch = Partial<
  Pick<
    AccountingInvoice,
    | 'vendor_id'
    | 'store_id'
    | 'invoice_number'
    | 'order_number'
    | 'issue_date'
    | 'due_date'
    | 'amount'
    | 'credit'
    | 'status'
    | 'paid'
    | 'category_id'
    | 'batch_number'
    | 'cloud'
    | 'notes'
    | 'raw_payload'
  >
>;

export type AccountingInvoiceInput = InvoicePatch & {
  amount: string;
  credit?: string;
  status?: AccountingStatus;
};

export type AccountingInvoicePaymentInput = Partial<
  Pick<
    AccountingInvoicePayment,
    | 'account_id'
    | 'account_number'
    | 'amount_paid'
    | 'category_id'
    | 'check_number'
    | 'id'
    | 'invoice_id'
    | 'invoice_number'
    | 'notes'
    | 'payment_date'
    | 'payment_method_id'
    | 'raw_payload'
    | 'reference_number'
    | 'status'
    | 'store_id'
    | 'vendor_id'
  >
> & {
  amount_paid: string;
};

export type AccountingPersonalBillInput = Partial<
  Pick<
    AccountingPersonalBill,
    | 'bill_name'
    | 'vendor_id'
    | 'payer'
    | 'payment_method_id'
    | 'payment_date'
    | 'amount'
    | 'status'
    | 'notes'
    | 'raw_payload'
  >
> & {
  amount: string;
};

export type AccountingTruckViolationInput = Partial<
  Pick<
    AccountingTruckViolation,
    | 'violation_number'
    | 'violation_date'
    | 'description'
    | 'amount'
    | 'receipt_number'
    | 'payment_method'
    | 'paid_amount'
    | 'payment_date'
    | 'notes'
    | 'raw_payload'
  >
> & {
  amount: string;
};

export type AccountingVendorInput = {
  account_number?: string | null;
  address?: string | null;
  contact_name?: string | null;
  default_payment_method_id?: string | null;
  email?: string | null;
  name: string;
  notes?: string | null;
  phone?: string | null;
  payment_terms_days?: number | null;
  raw_payload?: Record<string, unknown>;
};

export type AccountingAccountInput = {
  account_type?: string | null;
  active?: boolean;
  brand?: string | null;
  last_four?: string | null;
  name: string;
  store_id?: string | null;
};

export type AccountingStoreInput = {
  name: string;
};

export type AccountingCategoryInput = {
  name: string;
};

export type AccountingPaymentMethodInput = {
  name: string;
};

function asQuery<T>(value: unknown) {
  return value as QueryLike<T>;
}

async function queryRows<T>(table: string, select = '*', order?: { column: string; ascending?: boolean }) {
  const base = asQuery<T[]>(accountingDb.from(table).select(select));
  const query = order ? base.order(order.column, { ascending: order.ascending ?? true }) : base;
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function ensureOnlineMutation() {
  if (isRuntimeOffline() && !isMockLocal) {
    throw new Error('Accounting is read-only while offline. Reconnect before saving accounting changes.');
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Failed to read photo'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });
}

export async function uploadAccountingCheckPhoto(blob: Blob, path: string) {
  if (shouldUseLocalData()) {
    return { dataUrl: await blobToDataUrl(blob), path };
  }

  const { error } = await supabase.storage
    .from(ACCOUNTING_CHECK_PHOTOS_BUCKET)
    .upload(path, blob, {
      contentType: blob.type || 'image/jpeg',
      upsert: true,
    });
  if (error) throw error;
  return { path };
}

export async function createAccountingCheckPhotoUrl(path: string) {
  if (!path) return '';
  if (path.startsWith('data:')) return path;

  const { data, error } = await supabase.storage
    .from(ACCOUNTING_CHECK_PHOTOS_BUCKET)
    .createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

function invalidateAccounting(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['accounting'] }),
    queryClient.invalidateQueries({ queryKey: ['accounting-dashboard'] }),
  ]);
}

function uniqueCatalogRows<T extends { name: string; normalized_name: string }>(rows: T[]) {
  return [...new Map(rows.filter(row => row.name.trim()).map(row => [row.normalized_name, row])).values()];
}

async function upsertCatalogRows<T extends { id: string; name: string; normalized_name: string }>(
  table: string,
  rows: Array<Record<string, unknown> & { name: string; normalized_name: string }>
) {
  const uniqueRows = uniqueCatalogRows(rows);
  if (!uniqueRows.length) return new Map<string, T>();
  const { data, error } = await asQuery<T[]>(
    accountingDb.from(table).upsert(uniqueRows, { onConflict: 'normalized_name' })
  )
    .select('*');
  if (error) throw error;
  return new Map((data || []).map(row => [row.normalized_name, row]));
}

async function upsertImportRows<T>(table: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return [] as T[];
  const { data, error } = await asQuery<T[]>(
    accountingDb.from(table).upsert(rows, { onConflict: 'source_file_sha256,source_sheet,source_row' })
  )
    .select('*');
  if (error) throw error;
  return data || [];
}

function catalogRow(name: string | null | undefined, extra: Record<string, unknown> = {}) {
  const clean = name?.trim();
  if (!clean) return null;
  return {
    name: clean,
    normalized_name: normalizeText(clean),
    ...extra,
  };
}

export function useAccountingInvoices() {
  return useQuery({
    queryKey: ['accounting', 'invoices'],
    queryFn: async () => {
      if (shouldUseLocalData()) return listLocalAccountingInvoices();
      return queryRows<AccountingInvoice>(
        'accounting_invoices',
        '*, accounting_vendors(id,name,normalized_name,payment_terms_days), accounting_stores(id,name,normalized_name), accounting_invoice_categories(id,name,normalized_name)',
        { column: 'due_date', ascending: true }
      );
    },
  });
}

export function useAccountingInvoicePayments() {
  return useQuery({
    queryKey: ['accounting', 'invoice-payments'],
    queryFn: async () => {
      if (shouldUseLocalData()) return listLocalAccountingInvoicePayments();
      return queryRows<AccountingInvoicePayment>(
        'accounting_invoice_payments',
        '*, accounting_vendors(id,name,normalized_name), accounting_stores(id,name,normalized_name), accounting_accounts(id,name,normalized_name), accounting_payment_methods(id,name,normalized_name), accounting_invoices(id,invoice_number,status)',
        { column: 'payment_date', ascending: false }
      );
    },
  });
}

export function useAccountingCreditCardPayments() {
  return useQuery({
    queryKey: ['accounting', 'credit-card-payments'],
    queryFn: async () => {
      if (shouldUseLocalData()) return listLocalAccountingCreditCardPayments();
      return queryRows<AccountingCreditCardPayment>(
        'accounting_credit_card_payments',
        '*, accounting_accounts(id,name,normalized_name)',
        { column: 'payment_date', ascending: false }
      );
    },
  });
}

export function useAccountingPersonalBills() {
  return useQuery({
    queryKey: ['accounting', 'personal-bills'],
    queryFn: async () => {
      if (shouldUseLocalData()) return listLocalAccountingPersonalBills();
      return queryRows<AccountingPersonalBill>(
        'accounting_personal_bills',
        '*, accounting_vendors(id,name,normalized_name), accounting_payment_methods(id,name,normalized_name)',
        { column: 'payment_date', ascending: false }
      );
    },
  });
}

export function useAccountingTruckViolations() {
  return useQuery({
    queryKey: ['accounting', 'truck-violations'],
    queryFn: async () => {
      if (shouldUseLocalData()) return listLocalAccountingTruckViolations();
      return queryRows<AccountingTruckViolation>('accounting_truck_violations', '*', { column: 'violation_date', ascending: false });
    },
  });
}

export function useAccountingImports() {
  return useQuery({
    queryKey: ['accounting', 'imports'],
    queryFn: async () => {
      if (shouldUseLocalData()) {
        return {
          batches: listLocalAccountingImportBatches(),
          warnings: listLocalAccountingImportWarnings(),
        };
      }
      const [batches, warnings] = await Promise.all([
        queryRows<AccountingImportBatch>('accounting_import_batches', '*', { column: 'imported_at', ascending: false }),
        queryRows<AccountingImportWarning>('accounting_import_warnings', '*', { column: 'created_at', ascending: false }),
      ]);
      return { batches, warnings };
    },
  });
}

export function useAccountingCatalogs() {
  return useQuery({
    queryKey: ['accounting', 'catalogs'],
    queryFn: async () => {
      if (shouldUseLocalData()) {
        return {
          vendors: listLocalAccountingVendors(),
          stores: listLocalAccountingStores(),
          accounts: listLocalAccountingAccounts(),
          paymentMethods: listLocalAccountingPaymentMethods(),
          categories: listLocalAccountingCategories(),
        };
      }
      const [vendors, stores, accounts, paymentMethods, categories] = await Promise.all([
        queryRows<AccountingVendor>('accounting_vendors', '*', { column: 'name' }),
        queryRows<AccountingStore>('accounting_stores', '*', { column: 'name' }),
        queryRows<AccountingAccount>('accounting_accounts', '*, accounting_stores(id,name,normalized_name)', { column: 'name' }),
        queryRows<AccountingPaymentMethod>('accounting_payment_methods', '*', { column: 'name' }),
        queryRows<AccountingCategory>('accounting_invoice_categories', '*', { column: 'name' }),
      ]);
      return { vendors, stores: sortAccountingStores(stores), accounts, paymentMethods, categories };
    },
  });
}

export function useAccountingDashboard() {
  return useQuery({
    queryKey: ['accounting-dashboard'],
    queryFn: async () => {
      const [invoices, payments, imports] = await Promise.all([
        shouldUseLocalData()
          ? Promise.resolve(listLocalAccountingInvoices())
          : queryRows<AccountingInvoice>(
              'accounting_invoices',
              '*, accounting_vendors(id,name,normalized_name,payment_terms_days), accounting_stores(id,name,normalized_name), accounting_invoice_categories(id,name,normalized_name)',
              { column: 'due_date' }
            ),
        shouldUseLocalData()
          ? Promise.resolve(listLocalAccountingInvoicePayments())
          : queryRows<AccountingInvoicePayment>(
              'accounting_invoice_payments',
              '*, accounting_vendors(id,name,normalized_name), accounting_stores(id,name,normalized_name), accounting_accounts(id,name,normalized_name), accounting_payment_methods(id,name,normalized_name), accounting_invoices(id,invoice_number,status)',
              { column: 'payment_date', ascending: false }
            ),
        shouldUseLocalData()
          ? Promise.resolve(listLocalAccountingImportBatches())
          : queryRows<AccountingImportBatch>('accounting_import_batches', '*', { column: 'imported_at', ascending: false }),
      ]);
      return {
        invoices,
        payments,
        latestImport: imports[0] || null,
        highAmountDue30Invoices: invoices
          .filter(invoice => isDueWithin(invoice, 30))
          .sort((a, b) => Number(invoiceFinalAmount(b)) - Number(invoiceFinalAmount(a)))
          .slice(0, 8),
        highAmountDue90Invoices: invoices
          .filter(invoice => isDueWithin(invoice, 90))
          .sort((a, b) => Number(invoiceFinalAmount(b)) - Number(invoiceFinalAmount(a)))
          .slice(0, 8),
        summary: summarizeAccountingDashboard(invoices, payments),
        vendorBalances: summarizeVendorBalances(invoices).slice(0, 8),
        recentPayments: payments.slice(0, 8),
        highAmountInvoices: invoices
          .filter(invoice => !isInvoicePaid(invoice))
          .filter(invoice => Number(invoice.final_amount_to_pay || finalAmountToPay(invoice.amount, invoice.credit)) >= 7000)
          .slice(0, 8),
      };
    },
  });
}

export function useAccountingInvoiceMutations() {
  const queryClient = useQueryClient();

  const createInvoice = useMutation({
    mutationFn: async (input: AccountingInvoiceInput) => {
      ensureOnlineMutation();
      const manualNonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const payload = {
        ...input,
        credit: input.credit || '0.00',
        paid: input.status === 'paid',
        source_file_name: 'manual',
        source_file_sha256: `manual-${manualNonce}`,
        source_sheet: 'manual',
        source_row: Math.floor(Math.random() * 1_000_000_000),
        source_row_hash: normalizeText(`${input.invoice_number || ''}-${input.amount}-${manualNonce}`),
        raw_payload: { manual: true, ...(input.raw_payload || {}) },
      };
      if (shouldUseLocalData()) return createLocalAccountingInvoice(payload);
      const { data, error } = await asQuery<AccountingInvoice>(accountingDb.from('accounting_invoices').insert(payload)).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateAccounting(queryClient),
  });

  const updateInvoice = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: InvoicePatch }) => {
      ensureOnlineMutation();
      const normalizedPatch = {
        ...patch,
        paid: patch.status ? patch.status === 'paid' : patch.paid,
      };
      if (shouldUseLocalData()) {
        updateLocalAccountingInvoice(id, normalizedPatch);
        return { id, ...normalizedPatch };
      }
      const { data, error } = await asQuery<AccountingInvoice>(
        accountingDb.from('accounting_invoices').update(normalizedPatch)
      )
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateAccounting(queryClient),
  });

  return {
    createInvoice,
    updateInvoice,
  };
}

export function useAccountingPaymentMutations() {
  const queryClient = useQueryClient();

  const createInvoicePayment = useMutation({
    mutationFn: async (input: AccountingInvoicePaymentInput) => {
      ensureOnlineMutation();
      const manualNonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const rawPayload = {
        manual: true,
        account_number: input.account_number,
        invoice_number: input.invoice_number,
        check_number: input.check_number,
        reference_number: input.reference_number,
        amount_paid: input.amount_paid,
        ...(input.raw_payload || {}),
        store_id: input.store_id,
      };
      const payload = {
        ...(input.id ? { id: input.id } : {}),
        account_id: input.account_id || null,
        account_number: input.account_number || null,
        amount_paid: input.amount_paid,
        category_id: input.category_id || null,
        check_number: input.check_number || null,
        invoice_id: input.invoice_id || null,
        invoice_number: input.invoice_number || null,
        notes: input.notes || null,
        payment_date: input.payment_date || null,
        payment_method_id: input.payment_method_id || null,
        reference_number: input.reference_number || null,
        status: input.status || 'Paid',
        store_id: input.store_id || null,
        vendor_id: input.vendor_id || null,
        source_file_name: 'manual',
        source_file_sha256: `manual-${manualNonce}`,
        source_sheet: 'manual',
        source_row: Math.floor(Math.random() * 1_000_000_000),
        source_row_hash: sourceRowHash(rawPayload),
        raw_payload: rawPayload,
      };

      if (shouldUseLocalData()) return createLocalAccountingInvoicePayment(payload);
      const { data, error } = await asQuery<AccountingInvoicePayment>(
        accountingDb.from('accounting_invoice_payments').insert(payload)
      )
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateAccounting(queryClient),
  });

  return { createInvoicePayment };
}

export function useAccountingPersonalBillMutations() {
  const queryClient = useQueryClient();

  const createPersonalBill = useMutation({
    mutationFn: async (input: AccountingPersonalBillInput) => {
      ensureOnlineMutation();
      const manualNonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const rawPayload = {
        manual: true,
        bill_name: input.bill_name,
        amount: input.amount,
        payment_date: input.payment_date,
        ...(input.raw_payload || {}),
      };
      const payload = {
        bill_name: input.bill_name || null,
        vendor_id: input.vendor_id || null,
        payer: input.payer || null,
        payment_method_id: input.payment_method_id || null,
        payment_date: input.payment_date || null,
        amount: input.amount,
        status: input.status || 'Pending',
        notes: input.notes || null,
        source_file_name: 'manual',
        source_file_sha256: `manual-${manualNonce}`,
        source_sheet: 'manual',
        source_row: Math.floor(Math.random() * 1_000_000_000),
        source_row_hash: sourceRowHash(rawPayload),
        raw_payload: rawPayload,
      };

      if (shouldUseLocalData()) return createLocalAccountingPersonalBill(payload);
      const { data, error } = await asQuery<AccountingPersonalBill>(
        accountingDb.from('accounting_personal_bills').insert(payload)
      )
        .select('*, accounting_vendors(id,name,normalized_name), accounting_payment_methods(id,name,normalized_name)')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateAccounting(queryClient),
  });

  return { createPersonalBill };
}

export function useAccountingTruckViolationMutations() {
  const queryClient = useQueryClient();

  const createTruckViolation = useMutation({
    mutationFn: async (input: AccountingTruckViolationInput) => {
      ensureOnlineMutation();
      const manualNonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const duplicateGroupKey = truckDuplicateGroupKey(input.violation_number);
      const rawPayload = {
        manual: true,
        violation_number: input.violation_number,
        description: input.description,
        amount: input.amount,
        ...(input.raw_payload || {}),
      };
      const payload = {
        violation_number: input.violation_number || null,
        violation_date: input.violation_date || null,
        description: input.description || null,
        amount: input.amount,
        receipt_number: input.receipt_number || null,
        payment_method: input.payment_method || null,
        paid_amount: input.paid_amount || null,
        payment_date: input.payment_date || null,
        is_possible_duplicate: false,
        duplicate_group_key: duplicateGroupKey,
        notes: input.notes || null,
        source_file_name: 'manual',
        source_file_sha256: `manual-${manualNonce}`,
        source_sheet: 'manual',
        source_row: Math.floor(Math.random() * 1_000_000_000),
        source_row_hash: sourceRowHash(rawPayload),
        raw_payload: rawPayload,
      };

      if (shouldUseLocalData()) return createLocalAccountingTruckViolation(payload);
      const { data, error } = await asQuery<AccountingTruckViolation>(
        accountingDb.from('accounting_truck_violations').insert(payload)
      )
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateAccounting(queryClient),
  });

  return { createTruckViolation };
}

export function useAccountingVendorMutations() {
  const queryClient = useQueryClient();

  const createVendor = useMutation({
    mutationFn: async (input: AccountingVendorInput) => {
      ensureOnlineMutation();
      const payload = {
        account_number: input.account_number || null,
        address: input.address || null,
        contact_name: input.contact_name || null,
        default_payment_method_id: input.default_payment_method_id || null,
        email: input.email || null,
        name: input.name.trim(),
        normalized_name: normalizeText(input.name),
        notes: input.notes || null,
        payment_terms_days: input.payment_terms_days ?? null,
        phone: input.phone || null,
        source: 'manual',
        raw_payload: { manual: true, ...(input.raw_payload || {}) },
      };
      if (!payload.name) throw new Error('Vendor name is required');
      if (shouldUseLocalData()) return createLocalAccountingVendor(payload);
      const { data, error } = await asQuery<AccountingVendor>(
        accountingDb.from('accounting_vendors').insert(payload)
      )
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateAccounting(queryClient),
  });

  const updateVendor = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<AccountingVendorInput> }) => {
      ensureOnlineMutation();
      const payload = {
        ...patch,
        normalized_name: patch.name ? normalizeText(patch.name) : undefined,
      };
      if (shouldUseLocalData()) {
        updateLocalAccountingVendor(id, payload);
        return { id, ...payload };
      }
      const { data, error } = await asQuery<AccountingVendor>(
        accountingDb.from('accounting_vendors').update(payload)
      )
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateAccounting(queryClient),
  });

  return { createVendor, updateVendor };
}

export function useAccountingAccountMutations() {
  const queryClient = useQueryClient();

  const createAccount = useMutation({
    mutationFn: async (input: AccountingAccountInput) => {
      ensureOnlineMutation();
      const payload = {
        account_type: input.account_type || 'credit_card',
        active: input.active ?? true,
        brand: input.brand || null,
        last_four: input.last_four || null,
        name: input.name.trim(),
        normalized_name: normalizeText(input.name),
        store_id: input.store_id || null,
        raw_payload: { manual: true },
      };
      if (!payload.name) throw new Error('Credit card name is required');
      if (shouldUseLocalData()) return createLocalAccountingAccount(payload);
      const { data, error } = await asQuery<AccountingAccount>(
        accountingDb.from('accounting_accounts').insert(payload)
      )
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateAccounting(queryClient),
  });

  const updateAccount = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<AccountingAccountInput> }) => {
      ensureOnlineMutation();
      const payload = {
        ...patch,
        normalized_name: patch.name ? normalizeText(patch.name) : undefined,
      };
      if (shouldUseLocalData()) {
        updateLocalAccountingAccount(id, payload);
        return { id, ...payload };
      }
      const { data, error } = await asQuery<AccountingAccount>(
        accountingDb.from('accounting_accounts').update(payload)
      )
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateAccounting(queryClient),
  });

  return { createAccount, updateAccount };
}

export function useAccountingStoreMutations() {
  const queryClient = useQueryClient();

  const createStore = useMutation({
    mutationFn: async (input: AccountingStoreInput) => {
      ensureOnlineMutation();
      const payload = {
        name: input.name.trim(),
        normalized_name: normalizeText(input.name),
      };
      if (!payload.name) throw new Error('Store name is required');
      if (shouldUseLocalData()) return createLocalAccountingStore(payload);
      const { data, error } = await asQuery<AccountingStore>(
        accountingDb.from('accounting_stores').insert(payload)
      )
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateAccounting(queryClient),
  });

  const updateStore = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<AccountingStoreInput> }) => {
      ensureOnlineMutation();
      const payload = {
        ...patch,
        normalized_name: patch.name ? normalizeText(patch.name) : undefined,
      };
      if (shouldUseLocalData()) {
        updateLocalAccountingStore(id, payload);
        return { id, ...payload };
      }
      const { data, error } = await asQuery<AccountingStore>(
        accountingDb.from('accounting_stores').update(payload)
      )
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateAccounting(queryClient),
  });

  return { createStore, updateStore };
}

export function useAccountingPaymentMethodMutations() {
  const queryClient = useQueryClient();

  const createPaymentMethod = useMutation({
    mutationFn: async (input: AccountingPaymentMethodInput) => {
      ensureOnlineMutation();
      const payload = {
        name: input.name.trim(),
        normalized_name: normalizeText(input.name),
      };
      if (!payload.name) throw new Error('Payment method name is required');
      if (shouldUseLocalData()) return createLocalAccountingPaymentMethod(payload);
      const { data, error } = await asQuery<AccountingPaymentMethod>(
        accountingDb.from('accounting_payment_methods').insert(payload)
      )
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateAccounting(queryClient),
  });

  const updatePaymentMethod = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<AccountingPaymentMethodInput> }) => {
      ensureOnlineMutation();
      const payload = {
        ...patch,
        normalized_name: patch.name ? normalizeText(patch.name) : undefined,
      };
      if (shouldUseLocalData()) {
        updateLocalAccountingPaymentMethod(id, payload);
        return { id, ...payload };
      }
      const { data, error } = await asQuery<AccountingPaymentMethod>(
        accountingDb.from('accounting_payment_methods').update(payload)
      )
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateAccounting(queryClient),
  });

  return { createPaymentMethod, updatePaymentMethod };
}

export function useAccountingCategoryMutations() {
  const queryClient = useQueryClient();

  const createCategory = useMutation({
    mutationFn: async (input: AccountingCategoryInput) => {
      ensureOnlineMutation();
      const payload = {
        name: input.name.trim(),
        normalized_name: normalizeText(input.name),
      };
      if (!payload.name) throw new Error('Category name is required');
      if (shouldUseLocalData()) return createLocalAccountingCategory(payload);
      const { data, error } = await asQuery<AccountingCategory>(
        accountingDb.from('accounting_invoice_categories').insert(payload)
      )
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateAccounting(queryClient),
  });

  const updateCategory = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<AccountingCategoryInput> }) => {
      ensureOnlineMutation();
      const payload = {
        ...patch,
        normalized_name: patch.name ? normalizeText(patch.name) : undefined,
      };
      if (shouldUseLocalData()) {
        updateLocalAccountingCategory(id, payload);
        return { id, ...payload };
      }
      const { data, error } = await asQuery<AccountingCategory>(
        accountingDb.from('accounting_invoice_categories').update(payload)
      )
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateAccounting(queryClient),
  });

  return { createCategory, updateCategory };
}

export function useAccountingImportMutations() {
  const queryClient = useQueryClient();

  const importTemplate = useMutation({
    mutationFn: async (payload: AccountingTemplateImport) => {
      ensureOnlineMutation();
      if (shouldUseLocalData()) return importLocalAccountingTemplate(payload);

      const paymentMethodRows = uniqueCatalogRows(
        [
          ...payload.vendors.map(row => catalogRow(row.default_payment_method_name)),
          ...payload.payments.map(row => catalogRow(row.payment_method_name || 'Check')),
          ...payload.personalBills.map(row => catalogRow(row.payment_method_name)),
          catalogRow('Credit Card'),
          catalogRow('Check'),
        ].filter(Boolean) as Array<{ name: string; normalized_name: string }>
      );
      const paymentMethods = await upsertCatalogRows<AccountingPaymentMethod>('accounting_payment_methods', paymentMethodRows);

      const storeRows = uniqueCatalogRows(
        [
          ...payload.accounts.map(row => catalogRow(row.store_name)),
          ...payload.invoices.map(row => catalogRow(row.store_name)),
          ...payload.payments.map(row => catalogRow(row.store_name)),
        ].filter(Boolean) as Array<{ name: string; normalized_name: string }>
      );
      const stores = await upsertCatalogRows<AccountingStore>('accounting_stores', storeRows);

      const accountRows = uniqueCatalogRows(
        [
          ...payload.accounts.map(row => catalogRow(row.name, {
            account_type: row.account_type || 'credit_card',
            active: row.active,
            brand: row.brand,
            last_four: row.last_four,
            store_id: row.store_name ? stores.get(normalizeText(row.store_name))?.id || null : null,
            raw_payload: { template: true, row: row.rowNumber },
          })),
          ...payload.payments.map(row => catalogRow(row.account_name, {
            account_type: normalizeText(row.payment_method_name).includes('credit') ? 'credit_card' : 'account',
            raw_payload: { template: true },
          })),
          ...payload.creditCardPayments.map(row => catalogRow(row.account_name, {
            account_type: 'credit_card',
            raw_payload: { template: true },
          })),
        ].filter(Boolean) as Array<Record<string, unknown> & { name: string; normalized_name: string }>
      );
      const accounts = await upsertCatalogRows<AccountingAccount>('accounting_accounts', accountRows);

      const categoryRows = uniqueCatalogRows(
        [
          ...payload.invoices.map(row => catalogRow(row.category_name)),
          ...payload.payments.map(row => catalogRow(row.category_name)),
        ].filter(Boolean) as Array<{ name: string; normalized_name: string }>
      );
      const categories = await upsertCatalogRows<AccountingCategory>('accounting_invoice_categories', categoryRows);

      const vendorRows = uniqueCatalogRows(
        [
          ...payload.vendors.map(row => catalogRow(row.name, {
            account_number: row.account_number,
            address: row.address,
            contact_name: row.contact_name,
            default_payment_method_id: row.default_payment_method_name
              ? paymentMethods.get(normalizeText(row.default_payment_method_name))?.id || null
              : null,
            email: row.email,
            notes: row.notes,
            payment_terms_days: row.payment_terms_days,
            phone: row.phone,
            raw_payload: { template: true, row: row.rowNumber },
            source: 'template',
          })),
          ...payload.invoices.map(row => catalogRow(row.vendor_name, { source: 'template' })),
          ...payload.payments.map(row => catalogRow(row.vendor_name, { source: 'template' })),
          ...payload.personalBills.map(row => catalogRow(row.vendor_name, { source: 'template' })),
        ].filter(Boolean) as Array<Record<string, unknown> & { name: string; normalized_name: string }>
      );
      const vendors = await upsertCatalogRows<AccountingVendor>('accounting_vendors', vendorRows);

      const rowsProcessed = payload.sheetsProcessed.reduce((total, sheet) => total + sheet.rowsProcessed, 0);
      const templateRowsCount =
        payload.vendors.length +
        payload.accounts.length +
        payload.invoices.length +
        payload.payments.length +
        payload.creditCardPayments.length +
        payload.personalBills.length +
        payload.truckViolations.length;
      const { data: importBatch, error: importError } = await asQuery<AccountingImportBatch>(
        accountingDb.from('accounting_import_batches').insert({
          source_file_name: payload.fileName,
          source_file_sha256: payload.fileSha256,
          sheets_processed: payload.sheetsProcessed,
          rows_processed: rowsProcessed,
          rows_inserted: templateRowsCount,
          rows_updated: 0,
          rows_skipped: Math.max(0, rowsProcessed - templateRowsCount),
          warnings_count: payload.warnings.length,
          errors_count: 0,
          reconciliation_summary: {
            accounts: payload.accounts.length,
            creditCardPayments: payload.creditCardPayments.length,
            invoices: payload.invoices.length,
            payments: payload.payments.length,
            personalBills: payload.personalBills.length,
            truckViolations: payload.truckViolations.length,
            vendors: payload.vendors.length,
          },
        })
      )
        .select('*')
        .single();
      if (importError) throw importError;

      const batchId = importBatch?.id || null;
      const vendorId = (name: string | null | undefined) => name ? vendors.get(normalizeText(name))?.id || null : null;
      const storeId = (name: string | null | undefined) => name ? stores.get(normalizeText(name))?.id || null : null;
      const categoryId = (name: string | null | undefined) => name ? categories.get(normalizeText(name))?.id || null : null;
      const methodId = (name: string | null | undefined) => name ? paymentMethods.get(normalizeText(name))?.id || null : null;
      const accountId = (name: string | null | undefined) => name ? accounts.get(normalizeText(name))?.id || null : null;

      await upsertImportRows<AccountingInvoice>('accounting_invoices', payload.invoices.map(row => {
        const rawPayload = {
          template: true,
          ...row,
          manual_credit_lines: Number(row.credit || 0) > 0 ? [{ amount: row.credit, reason: row.credit_reason || '' }] : [],
          manual_credit_reason_summary: row.credit_reason,
        };
        return {
          vendor_id: vendorId(row.vendor_name),
          store_id: storeId(row.store_name),
          invoice_number: row.invoice_number,
          order_number: row.order_number,
          issue_date: row.issue_date,
          due_date: row.due_date,
          amount: row.amount,
          credit: row.credit,
          status: row.status,
          paid: row.paid,
          category_id: categoryId(row.category_name),
          batch_number: row.batch_number,
          cloud: row.cloud,
          notes: row.notes,
          source_file_name: payload.fileName,
          source_file_sha256: payload.fileSha256,
          source_sheet: 'Pending Invoices',
          source_row: row.rowNumber,
          source_row_hash: sourceRowHash(rawPayload),
          import_batch_id: batchId,
          raw_payload: rawPayload,
        };
      }));

      await upsertImportRows<AccountingInvoicePayment>('accounting_invoice_payments', payload.payments.map(row => {
        const rawPayload = { template: true, ...row };
        return {
          vendor_id: vendorId(row.vendor_name),
          invoice_number: row.invoice_number,
          payment_date: row.payment_date,
          payment_method_id: methodId(row.payment_method_name || 'Check'),
          account_id: accountId(row.account_name),
          account_number: row.account_number,
          check_number: row.check_number,
          reference_number: row.reference_number,
          amount_paid: row.amount_paid,
          status: row.status || 'Paid',
          store_id: storeId(row.store_name),
          category_id: categoryId(row.category_name),
          notes: row.notes,
          source_file_name: payload.fileName,
          source_file_sha256: payload.fileSha256,
          source_sheet: 'Paid Invoices',
          source_row: row.rowNumber,
          source_row_hash: sourceRowHash(rawPayload),
          import_batch_id: batchId,
          raw_payload: rawPayload,
        };
      }));

      await upsertImportRows<AccountingCreditCardPayment>('accounting_credit_card_payments', payload.creditCardPayments.map(row => {
        const rawPayload = { template: true, ...row };
        return {
          account_id: accountId(row.account_name),
          payment_date: row.payment_date,
          amount: row.amount,
          confirmation_number: row.confirmation_number,
          status: row.status,
          notes: row.notes,
          source_file_name: payload.fileName,
          source_file_sha256: payload.fileSha256,
          source_sheet: 'Credit Card Payments',
          source_row: row.rowNumber,
          source_row_hash: sourceRowHash(rawPayload),
          import_batch_id: batchId,
          raw_payload: rawPayload,
        };
      }));

      await upsertImportRows<AccountingPersonalBill>('accounting_personal_bills', payload.personalBills.map(row => {
        const rawPayload = { template: true, ...row };
        return {
          bill_name: row.bill_name,
          vendor_id: vendorId(row.vendor_name),
          payer: row.payer,
          payment_method_id: methodId(row.payment_method_name),
          payment_date: row.payment_date,
          amount: row.amount,
          status: row.status,
          notes: row.notes,
          source_file_name: payload.fileName,
          source_file_sha256: payload.fileSha256,
          source_sheet: 'Personal Bills',
          source_row: row.rowNumber,
          source_row_hash: sourceRowHash(rawPayload),
          import_batch_id: batchId,
          raw_payload: rawPayload,
        };
      }));

      const truckKeys = payload.truckViolations
        .map(row => truckDuplicateGroupKey(row.violation_number))
        .filter((key): key is string => Boolean(key));
      const duplicateTruckKeys = new Set(truckKeys.filter((key, index) => truckKeys.indexOf(key) !== index));
      await upsertImportRows<AccountingTruckViolation>('accounting_truck_violations', payload.truckViolations.map(row => {
        const rawPayload = { template: true, ...row };
        const duplicateKey = truckDuplicateGroupKey(row.violation_number);
        return {
          violation_number: row.violation_number,
          violation_date: row.violation_date,
          description: row.description,
          amount: row.amount,
          receipt_number: row.receipt_number,
          payment_method: row.payment_method,
          paid_amount: row.paid_amount,
          payment_date: row.payment_date,
          is_possible_duplicate: Boolean(duplicateKey && duplicateTruckKeys.has(duplicateKey)),
          duplicate_group_key: duplicateKey,
          notes: row.notes,
          source_file_name: payload.fileName,
          source_file_sha256: payload.fileSha256,
          source_sheet: 'Truck',
          source_row: row.rowNumber,
          source_row_hash: sourceRowHash(rawPayload),
          import_batch_id: batchId,
          raw_payload: rawPayload,
        };
      }));

      if (payload.warnings.length) {
        const { error: warningsError } = await asQuery<AccountingImportWarning[]>(
          accountingDb.from('accounting_import_warnings').insert(payload.warnings.map(warning => ({
            ...warning,
            import_batch_id: batchId,
          })))
        )
          .select('*');
        if (warningsError) throw warningsError;
      }

      return importBatch;
    },
    onSuccess: () => invalidateAccounting(queryClient),
  });

  return { importTemplate };
}
