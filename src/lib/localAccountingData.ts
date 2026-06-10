import {
  finalAmountToPay,
  normalizeText,
  sourceRowHash,
  summarizeAccountingDashboard,
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
  type AccountingStore,
  type AccountingTruckViolation,
  type AccountingVendor,
} from '@/lib/accounting';
import type { AccountingTemplateImport } from '@/lib/accountingExcel';

const KEYS = {
  vendors: 'accounting_mock_vendors_v1',
  stores: 'accounting_mock_stores_v1',
  accounts: 'accounting_mock_accounts_v1',
  paymentMethods: 'accounting_mock_payment_methods_v1',
  categories: 'accounting_mock_categories_v1',
  invoices: 'accounting_mock_invoices_v1',
  payments: 'accounting_mock_payments_v1',
  creditCardPayments: 'accounting_mock_credit_card_payments_v1',
  personalBills: 'accounting_mock_personal_bills_v1',
  truckViolations: 'accounting_mock_truck_violations_v1',
  imports: 'accounting_mock_import_batches_v1',
  warnings: 'accounting_mock_import_warnings_v1',
};

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function read<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

function catalogBase(id: string, name: string) {
  const timestamp = nowIso();
  return {
    id,
    name,
    normalized_name: normalizeText(name),
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function defaultVendors(): AccountingVendor[] {
  return [
    {
      ...catalogBase('mock-vendor-caspari', 'Caspari'),
      address: 'Mock vendor address',
      contact_name: 'Accounts Receivable',
      phone: '555-0101',
      email: 'ap@caspari.example',
      account_number: '61269-10392',
      default_payment_method_id: 'mock-payment-bank-check',
      notes: 'Mock vendor imported from Modern State AP.',
      source: 'mock',
      raw_payload: {},
    },
    {
      ...catalogBase('mock-vendor-spectrum', 'Spectrum'),
      address: null,
      contact_name: null,
      phone: null,
      email: null,
      account_number: '8150200050163655',
      default_payment_method_id: 'mock-payment-bank-account',
      notes: null,
      source: 'mock',
      raw_payload: {},
    },
    {
      ...catalogBase('mock-vendor-uline', 'Uline'),
      address: null,
      contact_name: null,
      phone: null,
      email: null,
      account_number: null,
      default_payment_method_id: 'mock-payment-credit-card',
      notes: null,
      source: 'mock',
      raw_payload: {},
    },
    {
      ...catalogBase('mock-vendor-action', 'Action Environmental'),
      address: null,
      contact_name: null,
      phone: null,
      email: null,
      account_number: '2186',
      default_payment_method_id: 'mock-payment-bank-check',
      notes: null,
      source: 'mock',
      raw_payload: {},
    },
  ];
}

function defaultStores(): AccountingStore[] {
  return [
    catalogBase('mock-store-all-locations', 'All Locations'),
    catalogBase('mock-store-both', 'Both Stores'),
    catalogBase('mock-store-86', '86 Street'),
    catalogBase('mock-store-3rd', '3rd Avenue'),
    catalogBase('mock-store-warehouse', 'Warehouse'),
  ];
}

function defaultAccounts(): AccountingAccount[] {
  const timestamp = nowIso();
  return [
    {
      ...catalogBase('mock-account-td-7627', 'TD Business 7627'),
      account_type: 'credit_card',
      store_id: 'mock-store-both',
      brand: 'TD',
      last_four: '7627',
      active: true,
      raw_payload: {},
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      ...catalogBase('mock-account-bank-1648', 'Bank Account 1648'),
      account_type: 'bank',
      store_id: 'mock-store-warehouse',
      brand: 'TD',
      last_four: '1648',
      active: true,
      raw_payload: {},
      created_at: timestamp,
      updated_at: timestamp,
    },
  ];
}

function defaultPaymentMethods(): AccountingPaymentMethod[] {
  return [
    catalogBase('mock-payment-credit-card', 'Credit Card'),
    catalogBase('mock-payment-bank-check', 'Bank Check'),
    catalogBase('mock-payment-bank-account', 'Bank Account'),
    catalogBase('mock-payment-autopay', 'Autopayment'),
  ];
}

function defaultCategories(): AccountingCategory[] {
  return [
    catalogBase('mock-category-internet', 'Internet'),
    catalogBase('mock-category-rent', 'Rent'),
    catalogBase('mock-category-party', 'Party'),
    catalogBase('mock-category-freight', 'Freight'),
  ];
}

function sourcePayload(sheet: string, row: number, payload: Record<string, unknown>) {
  return {
    source_file_name: '_Modern State 2026 (1).xlsx',
    source_file_sha256: 'mock-modern-state-2026',
    source_sheet: sheet,
    source_row: row,
    source_row_hash: sourceRowHash(payload),
    import_batch_id: 'mock-import-modern-state-2026',
    raw_payload: payload,
  };
}

function defaultInvoices(): AccountingInvoice[] {
  const timestamp = nowIso();
  const rows: Array<Partial<AccountingInvoice> & { amount: string; credit: string; source_row: number }> = [
    {
      vendor_id: 'mock-vendor-caspari',
      store_id: 'mock-store-both',
      invoice_number: '5426452',
      issue_date: '2026-01-02',
      due_date: '2026-01-25',
      amount: '918.50',
      credit: '0.00',
      status: 'pending',
      paid: false,
      category_id: 'mock-category-party',
      notes: 'Mock pending invoice',
      source_row: 2,
    },
    {
      vendor_id: 'mock-vendor-spectrum',
      store_id: 'mock-store-3rd',
      invoice_number: '0163655081725',
      issue_date: '2026-01-01',
      due_date: '2026-01-08',
      amount: '335.00',
      credit: '35.00',
      status: 'pending',
      paid: false,
      category_id: 'mock-category-internet',
      notes: 'Credit applied',
      excel_comments: 'Mock credit comment',
      source_row: 3,
    },
    {
      vendor_id: 'mock-vendor-uline',
      store_id: 'mock-store-both',
      invoice_number: '201165333',
      issue_date: '2025-12-01',
      due_date: '2026-01-01',
      amount: '800.43',
      credit: '0.00',
      status: 'paid',
      paid: true,
      category_id: 'mock-category-freight',
      notes: 'Paid from mock import',
      source_row: 4,
    },
    {
      vendor_id: 'mock-vendor-action',
      store_id: 'mock-store-86',
      invoice_number: '11660192',
      issue_date: '2025-12-01',
      due_date: '2025-12-01',
      amount: '7538.93',
      credit: '0.00',
      status: 'pending',
      paid: false,
      category_id: null,
      notes: 'High amount mock invoice',
      source_row: 5,
    },
  ];

  return rows.map((row, index) => {
    const payload = { invoice_number: row.invoice_number, amount: row.amount, credit: row.credit };
    return {
      id: `mock-invoice-${index + 1}`,
      vendor_id: row.vendor_id || null,
      store_id: row.store_id || null,
      invoice_number: row.invoice_number || null,
      order_number: null,
      issue_date: row.issue_date || null,
      due_date: row.due_date || null,
      amount: row.amount,
      credit: row.credit,
      final_amount_to_pay: finalAmountToPay(row.amount, row.credit),
      status: row.status || 'pending',
      paid: Boolean(row.paid),
      category_id: row.category_id || null,
      batch_number: null,
      cloud: null,
      notes: row.notes || null,
      excel_comments: row.excel_comments || null,
      ...sourcePayload('Pending Invoices', row.source_row, payload),
      created_at: timestamp,
      updated_at: timestamp,
    };
  });
}

function defaultPayments(): AccountingInvoicePayment[] {
  const timestamp = nowIso();
  return [
    {
      id: 'mock-payment-1',
      invoice_id: 'mock-invoice-3',
      vendor_id: 'mock-vendor-uline',
      invoice_number: '201165333',
      payment_date: '2026-01-10',
      payment_method_id: 'mock-payment-credit-card',
      account_id: 'mock-account-td-7627',
      check_number: null,
      account_number: '61269-10392',
      reference_number: 'mock-ref-1001',
      amount_paid: '800.43',
      status: 'Paid',
      category_id: 'mock-category-freight',
      notes: null,
      ...sourcePayload('Paid Invoices', 2, { invoice_number: '201165333', amount_paid: '800.43' }),
      created_at: timestamp,
      updated_at: timestamp,
    },
  ];
}

function defaultCreditCardPayments(): AccountingCreditCardPayment[] {
  const timestamp = nowIso();
  return [
    {
      id: 'mock-cc-payment-1',
      account_id: 'mock-account-td-7627',
      payment_date: '2026-01-04',
      amount: '1315.14',
      confirmation_number: '1155630041',
      status: 'Paid',
      notes: null,
      ...sourcePayload('Credit Card Payments', 2, { account: 'TD Business 7627', amount: '1315.14' }),
      created_at: timestamp,
      updated_at: timestamp,
    },
  ];
}

function defaultPersonalBills(): AccountingPersonalBill[] {
  const timestamp = nowIso();
  return [
    {
      id: 'mock-personal-bill-1',
      bill_name: 'Directv',
      vendor_id: 'mock-vendor-spectrum',
      payer: null,
      payment_method_id: 'mock-payment-bank-account',
      payment_date: '2026-01-12',
      amount: '50.44',
      status: 'Paid',
      notes: null,
      ...sourcePayload('Personal Bills', 2, { bill_name: 'Directv', amount: '50.44' }),
      created_at: timestamp,
      updated_at: timestamp,
    },
  ];
}

function defaultTruckViolations(): AccountingTruckViolation[] {
  const timestamp = nowIso();
  return [
    {
      id: 'mock-truck-1',
      violation_number: '925661674-9',
      violation_date: '2026-02-06',
      description: 'Double Parking',
      amount: '115.00',
      receipt_number: 'CPY052894306',
      payment_method: 'eCheck 1648',
      paid_amount: '115.00',
      payment_date: '2026-02-28',
      is_possible_duplicate: true,
      duplicate_group_key: '925661674-9',
      notes: null,
      ...sourcePayload('Truck', 6, { violation_number: '925661674-9', amount: '115.00' }),
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      id: 'mock-truck-2',
      violation_number: '925661674-9',
      violation_date: '2026-02-06',
      description: 'Double Parking duplicate row',
      amount: '115.00',
      receipt_number: 'CPY052894306',
      payment_method: 'eCheck 1648',
      paid_amount: '115.00',
      payment_date: '2026-02-28',
      is_possible_duplicate: true,
      duplicate_group_key: '925661674-9',
      notes: null,
      ...sourcePayload('Truck', 8, { violation_number: '925661674-9', amount: '115.00' }),
      created_at: timestamp,
      updated_at: timestamp,
    },
  ];
}

function defaultImports(): AccountingImportBatch[] {
  const timestamp = nowIso();
  const summary = summarizeAccountingDashboard(defaultInvoices(), defaultPayments());
  return [
    {
      id: 'mock-import-modern-state-2026',
      source_file_name: '_Modern State 2026 (1).xlsx',
      source_file_sha256: 'mock-modern-state-2026',
      imported_at: timestamp,
      imported_by: null,
      sheets_processed: ['Pending Invoices', 'Paid Invoices', 'Credit Card Payments', 'Personal Bills', 'Truck'],
      rows_processed: 739,
      rows_inserted: 739,
      rows_updated: 0,
      rows_skipped: 0,
      warnings_count: 2,
      errors_count: 0,
      reconciliation_summary: summary,
      created_at: timestamp,
      updated_at: timestamp,
    },
  ];
}

function defaultWarnings(): AccountingImportWarning[] {
  const timestamp = nowIso();
  return [
    {
      id: 'mock-warning-paid-match',
      import_batch_id: 'mock-import-modern-state-2026',
      source_file_name: '_Modern State 2026 (1).xlsx',
      source_sheet: 'Paid Invoices',
      source_row: 2,
      severity: 'warning',
      code: 'paid_invoice_match_missing',
      message: 'Mock warning: payment could not be confidently matched to an imported invoice.',
      raw_payload: {},
      created_at: timestamp,
    },
    {
      id: 'mock-warning-truck-duplicate',
      import_batch_id: 'mock-import-modern-state-2026',
      source_file_name: '_Modern State 2026 (1).xlsx',
      source_sheet: 'Truck',
      source_row: 8,
      severity: 'warning',
      code: 'duplicate_truck_violation',
      message: 'Mock warning: possible duplicate truck violation.',
      raw_payload: {},
      created_at: timestamp,
    },
  ];
}

function sourceKey(row: { source_file_name: string; source_sheet: string; source_row: number }) {
  return `${row.source_file_name}:${row.source_sheet}:${row.source_row}`;
}

function mergeBySource<T extends { created_at: string; id: string; source_file_name: string; source_row: number; source_sheet: string; updated_at: string }>(
  existing: T[],
  incoming: T[]
) {
  let inserted = 0;
  let updated = 0;
  const rows = [...existing];
  for (const row of incoming) {
    const index = rows.findIndex(existingRow => sourceKey(existingRow) === sourceKey(row));
    if (index >= 0) {
      rows[index] = { ...row, id: rows[index].id, created_at: rows[index].created_at, updated_at: nowIso() };
      updated += 1;
    } else {
      rows.unshift(row);
      inserted += 1;
    }
  }
  return { inserted, rows, updated };
}

function ensureSeeded() {
  if (typeof localStorage === 'undefined') return;
  if (!localStorage.getItem(KEYS.vendors)) write(KEYS.vendors, defaultVendors());
  if (!localStorage.getItem(KEYS.stores)) write(KEYS.stores, defaultStores());
  else {
    const stores = read<AccountingStore[]>(KEYS.stores, []);
    const existing = new Set(stores.map(store => normalizeText(store.name)));
    const missing = defaultStores().filter(store => !existing.has(store.normalized_name));
    if (missing.length) write(KEYS.stores, [...stores, ...missing]);
  }
  if (!localStorage.getItem(KEYS.accounts)) write(KEYS.accounts, defaultAccounts());
  if (!localStorage.getItem(KEYS.paymentMethods)) write(KEYS.paymentMethods, defaultPaymentMethods());
  if (!localStorage.getItem(KEYS.categories)) write(KEYS.categories, defaultCategories());
  if (!localStorage.getItem(KEYS.invoices)) write(KEYS.invoices, defaultInvoices());
  if (!localStorage.getItem(KEYS.payments)) write(KEYS.payments, defaultPayments());
  if (!localStorage.getItem(KEYS.creditCardPayments)) write(KEYS.creditCardPayments, defaultCreditCardPayments());
  if (!localStorage.getItem(KEYS.personalBills)) write(KEYS.personalBills, defaultPersonalBills());
  if (!localStorage.getItem(KEYS.truckViolations)) write(KEYS.truckViolations, defaultTruckViolations());
  if (!localStorage.getItem(KEYS.imports)) write(KEYS.imports, defaultImports());
  if (!localStorage.getItem(KEYS.warnings)) write(KEYS.warnings, defaultWarnings());
}

function withInvoiceRelations(invoices: AccountingInvoice[]) {
  const vendors = listLocalAccountingVendors();
  const stores = listLocalAccountingStores();
  const categories = listLocalAccountingCategories();
  return invoices.map(invoice => ({
    ...invoice,
    accounting_vendors: vendors.find(row => row.id === invoice.vendor_id) || null,
    accounting_stores: stores.find(row => row.id === invoice.store_id) || null,
    accounting_invoice_categories: categories.find(row => row.id === invoice.category_id) || null,
  }));
}

function withPaymentRelations(payments: AccountingInvoicePayment[]) {
  const vendors = listLocalAccountingVendors();
  const accounts = listLocalAccountingAccounts();
  const methods = listLocalAccountingPaymentMethods();
  const invoices = listLocalAccountingInvoices();
  return payments.map(payment => ({
    ...payment,
    accounting_vendors: vendors.find(row => row.id === payment.vendor_id) || null,
    accounting_accounts: accounts.find(row => row.id === payment.account_id) || null,
    accounting_payment_methods: methods.find(row => row.id === payment.payment_method_id) || null,
    accounting_invoices: invoices.find(row => row.id === payment.invoice_id) || null,
  }));
}

export function clearLocalAccountingData() {
  if (typeof localStorage === 'undefined') return;
  Object.values(KEYS).forEach(key => localStorage.removeItem(key));
}

export function listLocalAccountingVendors() {
  ensureSeeded();
  return read<AccountingVendor[]>(KEYS.vendors, defaultVendors()).sort((a, b) => a.name.localeCompare(b.name));
}

export function createLocalAccountingVendor(input: Partial<AccountingVendor> & { name: string }) {
  ensureSeeded();
  const timestamp = nowIso();
  const vendor: AccountingVendor = {
    id: input.id || createId('accounting-vendor'),
    name: input.name,
    normalized_name: normalizeText(input.name),
    address: input.address ?? null,
    contact_name: input.contact_name ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    account_number: input.account_number ?? null,
    default_payment_method_id: input.default_payment_method_id ?? null,
    notes: input.notes ?? null,
    source: input.source ?? 'manual',
    raw_payload: input.raw_payload ?? { manual: true },
    created_at: input.created_at || timestamp,
    updated_at: input.updated_at || timestamp,
  };
  write(KEYS.vendors, [...read<AccountingVendor[]>(KEYS.vendors, defaultVendors()), vendor]);
  return vendor;
}

export function updateLocalAccountingVendor(id: string, patch: Partial<AccountingVendor>) {
  ensureSeeded();
  write(
    KEYS.vendors,
    read<AccountingVendor[]>(KEYS.vendors, defaultVendors()).map(vendor =>
      vendor.id === id
        ? {
            ...vendor,
            ...patch,
            normalized_name: patch.name ? normalizeText(patch.name) : vendor.normalized_name,
            updated_at: nowIso(),
          }
        : vendor
    )
  );
}

export function listLocalAccountingStores() {
  ensureSeeded();
  return read<AccountingStore[]>(KEYS.stores, defaultStores()).sort((a, b) => a.name.localeCompare(b.name));
}

export function createLocalAccountingStore(input: Partial<AccountingStore> & { name: string }) {
  ensureSeeded();
  const timestamp = nowIso();
  const store: AccountingStore = {
    id: input.id || createId('accounting-store'),
    name: input.name,
    normalized_name: normalizeText(input.name),
    created_at: input.created_at || timestamp,
    updated_at: input.updated_at || timestamp,
  };
  write(KEYS.stores, [...read<AccountingStore[]>(KEYS.stores, defaultStores()), store]);
  return store;
}

export function updateLocalAccountingStore(id: string, patch: Partial<AccountingStore>) {
  ensureSeeded();
  write(
    KEYS.stores,
    read<AccountingStore[]>(KEYS.stores, defaultStores()).map(store =>
      store.id === id
        ? {
            ...store,
            ...patch,
            normalized_name: patch.name ? normalizeText(patch.name) : store.normalized_name,
            updated_at: nowIso(),
          }
        : store
    )
  );
}

export function listLocalAccountingAccounts() {
  ensureSeeded();
  const stores = listLocalAccountingStores();
  return read<AccountingAccount[]>(KEYS.accounts, defaultAccounts())
    .map(account => ({
      ...account,
      accounting_stores: stores.find(store => store.id === account.store_id) || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function createLocalAccountingAccount(input: Partial<AccountingAccount> & { name: string }) {
  ensureSeeded();
  const timestamp = nowIso();
  const account: AccountingAccount = {
    id: input.id || createId('accounting-account'),
    name: input.name,
    normalized_name: normalizeText(input.name),
    store_id: input.store_id ?? null,
    account_type: input.account_type ?? 'credit_card',
    brand: input.brand ?? null,
    last_four: input.last_four ?? null,
    active: input.active ?? true,
    raw_payload: input.raw_payload ?? { manual: true },
    created_at: input.created_at || timestamp,
    updated_at: input.updated_at || timestamp,
  };
  write(KEYS.accounts, [...read<AccountingAccount[]>(KEYS.accounts, defaultAccounts()), account]);
  return account;
}

export function updateLocalAccountingAccount(id: string, patch: Partial<AccountingAccount>) {
  ensureSeeded();
  write(
    KEYS.accounts,
    read<AccountingAccount[]>(KEYS.accounts, defaultAccounts()).map(account =>
      account.id === id
        ? {
            ...account,
            ...patch,
            normalized_name: patch.name ? normalizeText(patch.name) : account.normalized_name,
            updated_at: nowIso(),
          }
        : account
    )
  );
}

export function listLocalAccountingPaymentMethods() {
  ensureSeeded();
  return read<AccountingPaymentMethod[]>(KEYS.paymentMethods, defaultPaymentMethods()).sort((a, b) => a.name.localeCompare(b.name));
}

export function listLocalAccountingCategories() {
  ensureSeeded();
  return read<AccountingCategory[]>(KEYS.categories, defaultCategories()).sort((a, b) => a.name.localeCompare(b.name));
}

export function createLocalAccountingCategory(input: Partial<AccountingCategory> & { name: string }) {
  ensureSeeded();
  const timestamp = nowIso();
  const category: AccountingCategory = {
    id: input.id || createId('accounting-category'),
    name: input.name,
    normalized_name: normalizeText(input.name),
    created_at: input.created_at || timestamp,
    updated_at: input.updated_at || timestamp,
  };
  write(KEYS.categories, [...read<AccountingCategory[]>(KEYS.categories, defaultCategories()), category]);
  return category;
}

export function updateLocalAccountingCategory(id: string, patch: Partial<AccountingCategory>) {
  ensureSeeded();
  write(
    KEYS.categories,
    read<AccountingCategory[]>(KEYS.categories, defaultCategories()).map(category =>
      category.id === id
        ? {
            ...category,
            ...patch,
            normalized_name: patch.name ? normalizeText(patch.name) : category.normalized_name,
            updated_at: nowIso(),
          }
        : category
    )
  );
}

export function listLocalAccountingInvoices() {
  ensureSeeded();
  return withInvoiceRelations(read<AccountingInvoice[]>(KEYS.invoices, defaultInvoices()));
}

export function listLocalAccountingInvoicePayments() {
  ensureSeeded();
  return withPaymentRelations(read<AccountingInvoicePayment[]>(KEYS.payments, defaultPayments()));
}

export function createLocalAccountingInvoicePayment(input: Partial<AccountingInvoicePayment>) {
  ensureSeeded();
  const timestamp = nowIso();
  const payload = {
    manual: true,
    invoice_number: input.invoice_number,
    check_number: input.check_number,
    amount_paid: input.amount_paid,
    ...(input.raw_payload || {}),
  };
  const payment: AccountingInvoicePayment = {
    id: input.id || createId('accounting-payment'),
    invoice_id: input.invoice_id ?? null,
    vendor_id: input.vendor_id ?? null,
    invoice_number: input.invoice_number ?? null,
    payment_date: input.payment_date ?? null,
    payment_method_id: input.payment_method_id ?? null,
    account_id: input.account_id ?? null,
    check_number: input.check_number ?? null,
    account_number: input.account_number ?? null,
    reference_number: input.reference_number ?? null,
    amount_paid: input.amount_paid ?? '0.00',
    status: input.status ?? 'Paid',
    category_id: input.category_id ?? null,
    notes: input.notes ?? null,
    source_file_name: 'manual',
    source_file_sha256: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    source_sheet: 'manual',
    source_row: Math.floor(Math.random() * 1_000_000_000),
    source_row_hash: sourceRowHash(payload),
    import_batch_id: null,
    raw_payload: payload,
    created_at: timestamp,
    updated_at: timestamp,
  };
  write(KEYS.payments, [payment, ...read<AccountingInvoicePayment[]>(KEYS.payments, defaultPayments())]);
  return payment;
}

export function listLocalAccountingCreditCardPayments() {
  ensureSeeded();
  const accounts = listLocalAccountingAccounts();
  return read<AccountingCreditCardPayment[]>(KEYS.creditCardPayments, defaultCreditCardPayments()).map(payment => ({
    ...payment,
    accounting_accounts: accounts.find(row => row.id === payment.account_id) || null,
  }));
}

export function listLocalAccountingPersonalBills() {
  ensureSeeded();
  const vendors = listLocalAccountingVendors();
  const methods = listLocalAccountingPaymentMethods();
  return read<AccountingPersonalBill[]>(KEYS.personalBills, defaultPersonalBills()).map(bill => ({
    ...bill,
    accounting_vendors: vendors.find(row => row.id === bill.vendor_id) || null,
    accounting_payment_methods: methods.find(row => row.id === bill.payment_method_id) || null,
  }));
}

export function listLocalAccountingTruckViolations() {
  ensureSeeded();
  return read<AccountingTruckViolation[]>(KEYS.truckViolations, defaultTruckViolations());
}

export function listLocalAccountingImportBatches() {
  ensureSeeded();
  return read<AccountingImportBatch[]>(KEYS.imports, defaultImports()).sort((a, b) => b.imported_at.localeCompare(a.imported_at));
}

export function listLocalAccountingImportWarnings() {
  ensureSeeded();
  return read<AccountingImportWarning[]>(KEYS.warnings, defaultWarnings()).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function updateLocalAccountingInvoice(id: string, patch: Partial<AccountingInvoice>) {
  ensureSeeded();
  const rows = read<AccountingInvoice[]>(KEYS.invoices, defaultInvoices()).map(invoice => {
    if (invoice.id !== id) return invoice;
    const next = { ...invoice, ...patch, updated_at: nowIso() };
    next.final_amount_to_pay = finalAmountToPay(next.amount, next.credit);
    return next;
  });
  write(KEYS.invoices, rows);
}

export function createLocalAccountingInvoice(input: Partial<AccountingInvoice>) {
  ensureSeeded();
  const timestamp = nowIso();
  const payload = {
    manual: true,
    invoice_number: input.invoice_number,
    amount: input.amount,
    ...(input.raw_payload || {}),
  };
  const invoice: AccountingInvoice = {
    id: input.id || createId('accounting-invoice'),
    vendor_id: input.vendor_id ?? null,
    store_id: input.store_id ?? null,
    invoice_number: input.invoice_number ?? null,
    order_number: input.order_number ?? null,
    issue_date: input.issue_date ?? null,
    due_date: input.due_date ?? null,
    amount: input.amount ?? '0.00',
    credit: input.credit ?? '0.00',
    final_amount_to_pay: finalAmountToPay(input.amount ?? '0.00', input.credit ?? '0.00'),
    status: input.status ?? 'pending',
    paid: input.paid ?? input.status === 'paid',
    category_id: input.category_id ?? null,
    batch_number: input.batch_number ?? null,
    cloud: input.cloud ?? null,
    notes: input.notes ?? null,
    excel_comments: input.excel_comments ?? null,
    source_file_name: 'manual',
    source_file_sha256: 'manual',
    source_sheet: 'manual',
    source_row: 0,
    source_row_hash: sourceRowHash(payload),
    import_batch_id: null,
    raw_payload: payload,
    created_at: timestamp,
    updated_at: timestamp,
  };
  write(KEYS.invoices, [invoice, ...read<AccountingInvoice[]>(KEYS.invoices, defaultInvoices())]);
  return invoice;
}

export function importLocalAccountingTemplate(payload: AccountingTemplateImport) {
  ensureSeeded();
  const timestamp = nowIso();
  const normalized = (name: string | null | undefined) => normalizeText(name);

  const vendors = read<AccountingVendor[]>(KEYS.vendors, defaultVendors());
  const stores = read<AccountingStore[]>(KEYS.stores, defaultStores());
  const accounts = read<AccountingAccount[]>(KEYS.accounts, defaultAccounts());
  const paymentMethods = read<AccountingPaymentMethod[]>(KEYS.paymentMethods, defaultPaymentMethods());
  const categories = read<AccountingCategory[]>(KEYS.categories, defaultCategories());

  const ensureVendor = (name: string | null | undefined, patch: Partial<AccountingVendor> = {}) => {
    const clean = name?.trim();
    if (!clean) return null;
    const normalizedName = normalized(clean);
    const index = vendors.findIndex(row => row.normalized_name === normalizedName);
    if (index >= 0) {
      vendors[index] = { ...vendors[index], ...patch, name: vendors[index].name, normalized_name: normalizedName, updated_at: timestamp };
      return vendors[index].id;
    }
    const row: AccountingVendor = {
      id: createId('accounting-vendor'),
      name: clean,
      normalized_name: normalizedName,
      account_number: patch.account_number ?? null,
      address: patch.address ?? null,
      contact_name: patch.contact_name ?? null,
      default_payment_method_id: patch.default_payment_method_id ?? null,
      email: patch.email ?? null,
      notes: patch.notes ?? null,
      phone: patch.phone ?? null,
      source: 'template',
      raw_payload: patch.raw_payload ?? { template: true },
      created_at: timestamp,
      updated_at: timestamp,
    };
    vendors.push(row);
    return row.id;
  };

  const ensureStore = (name: string | null | undefined) => {
    const clean = name?.trim();
    if (!clean) return null;
    const normalizedName = normalized(clean);
    const existing = stores.find(row => row.normalized_name === normalizedName);
    if (existing) return existing.id;
    const row = { ...catalogBase(createId('accounting-store'), clean), created_at: timestamp, updated_at: timestamp };
    stores.push(row);
    return row.id;
  };

  const ensureCategory = (name: string | null | undefined) => {
    const clean = name?.trim();
    if (!clean) return null;
    const normalizedName = normalized(clean);
    const existing = categories.find(row => row.normalized_name === normalizedName);
    if (existing) return existing.id;
    const row = { ...catalogBase(createId('accounting-category'), clean), created_at: timestamp, updated_at: timestamp };
    categories.push(row);
    return row.id;
  };

  const ensurePaymentMethod = (name: string | null | undefined) => {
    const clean = name?.trim();
    if (!clean) return null;
    const normalizedName = normalized(clean);
    const existing = paymentMethods.find(row => row.normalized_name === normalizedName);
    if (existing) return existing.id;
    const row = { ...catalogBase(createId('accounting-payment-method'), clean), created_at: timestamp, updated_at: timestamp };
    paymentMethods.push(row);
    return row.id;
  };

  const ensureAccount = (name: string | null | undefined, patch: Partial<AccountingAccount> = {}) => {
    const clean = name?.trim();
    if (!clean) return null;
    const normalizedName = normalized(clean);
    const index = accounts.findIndex(row => row.normalized_name === normalizedName);
    if (index >= 0) {
      accounts[index] = { ...accounts[index], ...patch, name: accounts[index].name, normalized_name: normalizedName, updated_at: timestamp };
      return accounts[index].id;
    }
    const row: AccountingAccount = {
      id: createId('accounting-account'),
      name: clean,
      normalized_name: normalizedName,
      store_id: patch.store_id ?? null,
      account_type: patch.account_type ?? 'account',
      brand: patch.brand ?? null,
      last_four: patch.last_four ?? null,
      active: patch.active ?? true,
      raw_payload: patch.raw_payload ?? { template: true },
      created_at: timestamp,
      updated_at: timestamp,
    };
    accounts.push(row);
    return row.id;
  };

  payload.vendors.forEach(vendor => {
    const methodId = ensurePaymentMethod(vendor.default_payment_method_name);
    ensureVendor(vendor.name, {
      account_number: vendor.account_number,
      address: vendor.address,
      contact_name: vendor.contact_name,
      default_payment_method_id: methodId,
      email: vendor.email,
      notes: vendor.notes,
      phone: vendor.phone,
      raw_payload: { template: true, row: vendor.rowNumber },
      source: 'template',
    });
  });
  payload.accounts.forEach(account => ensureAccount(account.name, { ...account, store_id: ensureStore(account.store_name) }));
  payload.invoices.forEach(invoice => {
    ensureVendor(invoice.vendor_name);
    ensureStore(invoice.store_name);
    ensureCategory(invoice.category_name);
  });
  payload.payments.forEach(payment => {
    ensureVendor(payment.vendor_name);
    ensurePaymentMethod(payment.payment_method_name);
    ensureAccount(payment.account_name, { account_type: normalized(payment.payment_method_name).includes('credit') ? 'credit_card' : 'account' });
    ensureCategory(payment.category_name);
  });
  payload.creditCardPayments.forEach(payment => ensureAccount(payment.account_name, { account_type: 'credit_card' }));
  payload.personalBills.forEach(bill => {
    ensureVendor(bill.vendor_name || bill.bill_name);
    ensurePaymentMethod(bill.payment_method_name);
  });

  write(KEYS.vendors, vendors);
  write(KEYS.stores, stores);
  write(KEYS.accounts, accounts);
  write(KEYS.paymentMethods, paymentMethods);
  write(KEYS.categories, categories);

  const invoiceRows: AccountingInvoice[] = payload.invoices.map(row => {
    const rawPayload = {
      template: true,
      ...row,
      manual_credit_lines: Number(row.credit || 0) > 0 ? [{ amount: row.credit, reason: row.credit_reason || '' }] : [],
      manual_credit_reason_summary: row.credit_reason,
    };
    return {
      id: createId('accounting-invoice'),
      vendor_id: ensureVendor(row.vendor_name),
      store_id: ensureStore(row.store_name),
      invoice_number: row.invoice_number,
      order_number: row.order_number,
      issue_date: row.issue_date,
      due_date: row.due_date,
      amount: row.amount || '0.00',
      credit: row.credit,
      final_amount_to_pay: finalAmountToPay(row.amount, row.credit),
      status: row.status,
      paid: row.paid,
      category_id: ensureCategory(row.category_name),
      batch_number: row.batch_number,
      cloud: row.cloud,
      notes: row.notes,
      excel_comments: null,
      source_file_name: payload.fileName,
      source_file_sha256: payload.fileSha256,
      source_sheet: 'Pending Invoices',
      source_row: row.rowNumber,
      source_row_hash: sourceRowHash(rawPayload),
      import_batch_id: null,
      raw_payload: rawPayload,
      created_at: timestamp,
      updated_at: timestamp,
    };
  });

  const paymentRows: AccountingInvoicePayment[] = payload.payments.map(row => {
    const rawPayload = { template: true, ...row };
    return {
      id: createId('accounting-payment'),
      invoice_id: null,
      vendor_id: ensureVendor(row.vendor_name),
      invoice_number: row.invoice_number,
      payment_date: row.payment_date,
      payment_method_id: ensurePaymentMethod(row.payment_method_name),
      account_id: ensureAccount(row.account_name, { account_type: normalized(row.payment_method_name).includes('credit') ? 'credit_card' : 'account' }),
      check_number: row.check_number,
      account_number: row.account_number,
      reference_number: row.reference_number,
      amount_paid: row.amount_paid || '0.00',
      status: row.status || 'Paid',
      category_id: ensureCategory(row.category_name),
      notes: row.notes,
      source_file_name: payload.fileName,
      source_file_sha256: payload.fileSha256,
      source_sheet: 'Paid Invoices',
      source_row: row.rowNumber,
      source_row_hash: sourceRowHash(rawPayload),
      import_batch_id: null,
      raw_payload: rawPayload,
      created_at: timestamp,
      updated_at: timestamp,
    };
  });

  const creditCardRows: AccountingCreditCardPayment[] = payload.creditCardPayments.map(row => {
    const rawPayload = { template: true, ...row };
    return {
      id: createId('accounting-cc-payment'),
      account_id: ensureAccount(row.account_name, { account_type: 'credit_card' }),
      payment_date: row.payment_date,
      amount: row.amount || '0.00',
      confirmation_number: row.confirmation_number,
      status: row.status,
      notes: row.notes,
      source_file_name: payload.fileName,
      source_file_sha256: payload.fileSha256,
      source_sheet: 'Credit Card Payments',
      source_row: row.rowNumber,
      source_row_hash: sourceRowHash(rawPayload),
      import_batch_id: null,
      raw_payload: rawPayload,
      created_at: timestamp,
      updated_at: timestamp,
    };
  });

  const personalRows: AccountingPersonalBill[] = payload.personalBills.map(row => {
    const rawPayload = { template: true, ...row };
    return {
      id: createId('accounting-personal-bill'),
      bill_name: row.bill_name,
      vendor_id: ensureVendor(row.vendor_name || row.bill_name),
      payer: row.payer,
      payment_method_id: ensurePaymentMethod(row.payment_method_name),
      payment_date: row.payment_date,
      amount: row.amount || '0.00',
      status: row.status,
      notes: row.notes,
      source_file_name: payload.fileName,
      source_file_sha256: payload.fileSha256,
      source_sheet: 'Personal Bills',
      source_row: row.rowNumber,
      source_row_hash: sourceRowHash(rawPayload),
      import_batch_id: null,
      raw_payload: rawPayload,
      created_at: timestamp,
      updated_at: timestamp,
    };
  });

  const duplicateTruckKeys = new Set(
    payload.truckViolations
      .map(row => truckDuplicateGroupKey(row.violation_number))
      .filter((key): key is string => Boolean(key))
      .filter((key, _index, rows) => rows.indexOf(key) !== rows.lastIndexOf(key))
  );
  const truckRows: AccountingTruckViolation[] = payload.truckViolations.map(row => {
    const rawPayload = { template: true, ...row };
    const duplicateKey = truckDuplicateGroupKey(row.violation_number);
    return {
      id: createId('accounting-truck'),
      violation_number: row.violation_number,
      violation_date: row.violation_date,
      description: row.description,
      amount: row.amount || '0.00',
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
      import_batch_id: null,
      raw_payload: rawPayload,
      created_at: timestamp,
      updated_at: timestamp,
    };
  });

  const invoiceMerge = mergeBySource(read<AccountingInvoice[]>(KEYS.invoices, defaultInvoices()), invoiceRows);
  const paymentMerge = mergeBySource(read<AccountingInvoicePayment[]>(KEYS.payments, defaultPayments()), paymentRows);
  const cardPaymentMerge = mergeBySource(read<AccountingCreditCardPayment[]>(KEYS.creditCardPayments, defaultCreditCardPayments()), creditCardRows);
  const personalMerge = mergeBySource(read<AccountingPersonalBill[]>(KEYS.personalBills, defaultPersonalBills()), personalRows);
  const truckMerge = mergeBySource(read<AccountingTruckViolation[]>(KEYS.truckViolations, defaultTruckViolations()), truckRows);

  write(KEYS.invoices, invoiceMerge.rows);
  write(KEYS.payments, paymentMerge.rows);
  write(KEYS.creditCardPayments, cardPaymentMerge.rows);
  write(KEYS.personalBills, personalMerge.rows);
  write(KEYS.truckViolations, truckMerge.rows);

  const rowsProcessed = payload.sheetsProcessed.reduce((total, sheet) => total + sheet.rowsProcessed, 0);
  const catalogRowsProcessed = payload.vendors.length + payload.accounts.length;
  const rowsInserted =
    catalogRowsProcessed +
    invoiceMerge.inserted +
    paymentMerge.inserted +
    cardPaymentMerge.inserted +
    personalMerge.inserted +
    truckMerge.inserted;
  const rowsUpdated = invoiceMerge.updated + paymentMerge.updated + cardPaymentMerge.updated + personalMerge.updated + truckMerge.updated;
  const batch: AccountingImportBatch = {
    id: createId('accounting-import'),
    source_file_name: payload.fileName,
    source_file_sha256: payload.fileSha256,
    imported_at: timestamp,
    imported_by: null,
    sheets_processed: payload.sheetsProcessed,
    rows_processed: rowsProcessed,
    rows_inserted: rowsInserted,
    rows_updated: rowsUpdated,
    rows_skipped: Math.max(0, rowsProcessed - rowsInserted - rowsUpdated),
    warnings_count: payload.warnings.length,
    errors_count: 0,
    reconciliation_summary: {
      accounts: payload.accounts.length,
      invoices: payload.invoices.length,
      payments: payload.payments.length,
      vendors: payload.vendors.length,
    },
    created_at: timestamp,
    updated_at: timestamp,
  };
  write(KEYS.imports, [batch, ...read<AccountingImportBatch[]>(KEYS.imports, defaultImports())]);
  write(
    KEYS.warnings,
    [
      ...payload.warnings.map((warning, index): AccountingImportWarning => ({
        id: createId(`accounting-warning-${index}`),
        import_batch_id: batch.id,
        source_file_name: warning.source_file_name,
        source_sheet: warning.source_sheet,
        source_row: warning.source_row,
        severity: warning.severity,
        code: warning.code,
        message: warning.message,
        raw_payload: warning.raw_payload,
        created_at: timestamp,
      })),
      ...read<AccountingImportWarning[]>(KEYS.warnings, defaultWarnings()),
    ]
  );

  return batch;
}
