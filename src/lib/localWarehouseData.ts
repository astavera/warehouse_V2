import type { Tables, TablesInsert } from '@/integrations/supabase/types';

export const isMockLocal = import.meta.env.VITE_MOCK_LOCAL === 'true';

type Supplier = Tables<'suppliers'>;
type Carrier = Tables<'carriers'>;
type Employee = Tables<'employees'>;
type ReceiptBatch = Tables<'receipt_batches'>;
type ReceiptItem = Tables<'receipt_items'>;

export type LocalBatchWithItems = ReceiptBatch & {
  receipt_items: ReceiptItem[];
};

export type LocalHistoryBatch = ReceiptBatch & {
  receipt_items: Array<
    ReceiptItem & {
      suppliers: { name: string; code: string | null } | null;
    }
  >;
};

export type OfflineQueueItem =
  | {
      id: string;
      action: 'supplier:create';
      payload: Supplier;
      created_at: string;
    }
  | {
      id: string;
      action: 'carrier:create';
      payload: Carrier;
      created_at: string;
    }
  | {
      id: string;
      action: 'batch:create';
      payload: {
        batch: ReceiptBatch;
        items: ReceiptItem[];
      };
      created_at: string;
    };

const MOCK_USER_ID = '00000000-0000-0000-0000-000000000101';
const MOCK_PASSCODES_BY_ID: Record<string, string> = {
  [MOCK_USER_ID]: '9001',
  '00000000-0000-0000-0000-000000000102': '9002',
  '00000000-0000-0000-0000-000000000103': '9003',
  '00000000-0000-0000-0000-000000000172': '9004',
};
const KEYS = {
  suppliers: 'warehouse_mock_suppliers',
  carriers: 'warehouse_mock_carriers',
  employees: 'warehouse_mock_employees',
  batches: 'warehouse_mock_batches',
  items: 'warehouse_mock_receipt_items',
  queue: 'warehouse_offline_queue',
  schema: 'warehouse_mock_schema_version',
};
const LOCAL_SCHEMA_VERSION = 'hardened-mock-passcodes-v1';

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
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

export function isRuntimeOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function shouldUseLocalData() {
  return isMockLocal || isRuntimeOffline();
}

function sortByName<T extends { name: string }>(rows: T[]) {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name));
}

function baseSupplier(id: string, name: string, code: string): Supplier {
  const timestamp = nowIso();
  return {
    id,
    name,
    code,
    contact_name: null,
    phone: null,
    email: null,
    notes: null,
    active: true,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function baseCarrier(id: string, name: string, carrierType: string): Carrier {
  const timestamp = nowIso();
  return {
    id,
    name,
    carrier_type: carrierType,
    active: true,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function defaultSuppliers(): Supplier[] {
  return [
    baseSupplier('mock-supplier-acme', 'Acme Apparel', 'ACME'),
    baseSupplier('mock-supplier-bright', 'Bright Supply Co.', 'BRIG'),
    baseSupplier('mock-supplier-northline', 'Northline Packaging', 'NORT'),
  ];
}

function defaultCarriers(): Carrier[] {
  return [
    baseCarrier('mock-carrier-ups', 'UPS', 'parcel'),
    baseCarrier('mock-carrier-fedex', 'FedEx', 'parcel'),
    baseCarrier('mock-carrier-usps', 'USPS', 'parcel'),
    baseCarrier('mock-carrier-dhl', 'DHL', 'parcel'),
    baseCarrier('mock-carrier-amazon', 'Amazon', 'parcel'),
  ];
}

function defaultEmployees(): Employee[] {
  const timestamp = nowIso();
  return [
    {
      id: MOCK_USER_ID,
      name: 'Sebastian',
      passcode: MOCK_PASSCODES_BY_ID[MOCK_USER_ID],
      active: true,
      created_at: timestamp,
      updated_at: timestamp,
      auth_user_id: null,
      permissions: ['receiving', 'expected_boxes', 'prices', 'audit', 'accounting', 'settings'],
      role: 'admin',
      store_number: null,
    },
    {
      id: '00000000-0000-0000-0000-000000000102',
      name: 'Warehouse Staff',
      passcode: MOCK_PASSCODES_BY_ID['00000000-0000-0000-0000-000000000102'],
      active: true,
      created_at: timestamp,
      updated_at: timestamp,
      auth_user_id: null,
      permissions: ['receiving'],
      role: 'warehouse',
      store_number: null,
    },
    {
      id: '00000000-0000-0000-0000-000000000103',
      name: 'Accounting',
      passcode: MOCK_PASSCODES_BY_ID['00000000-0000-0000-0000-000000000103'],
      active: true,
      created_at: timestamp,
      updated_at: timestamp,
      auth_user_id: null,
      permissions: ['receiving', 'expected_boxes', 'prices', 'audit', 'accounting'],
      role: 'accounting',
      store_number: null,
    },
    {
      id: '00000000-0000-0000-0000-000000000172',
      name: 'Store 72',
      passcode: MOCK_PASSCODES_BY_ID['00000000-0000-0000-0000-000000000172'],
      active: true,
      created_at: timestamp,
      updated_at: timestamp,
      auth_user_id: null,
      permissions: ['prices'],
      role: 'store',
      store_number: 72,
    },
  ];
}

function normalizeEmployee(row: Employee): Employee {
  const fallback = defaultEmployees().find(employee => employee.id === row.id);
  const isOriginalMockUser = row.id === MOCK_USER_ID;
  return {
    ...row,
    name: isOriginalMockUser && row.name === 'Test User' ? 'Sebastian' : row.name,
    auth_user_id: row.auth_user_id ?? null,
    permissions: row.permissions ?? fallback?.permissions ?? null,
    role: row.role || fallback?.role || (isOriginalMockUser ? 'admin' : 'warehouse'),
    store_number: row.store_number ?? fallback?.store_number ?? null,
  };
}

function migrateLocalEmployees() {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(KEYS.schema) === LOCAL_SCHEMA_VERSION) return;

  const rows = read<Employee[]>(KEYS.employees, []).map(row => {
    const hardenedPasscode = MOCK_PASSCODES_BY_ID[row.id] || row.passcode;

    if (
      (row.role === 'admin' || row.role === 'accounting' || row.id === MOCK_USER_ID) &&
      row.permissions &&
      !row.permissions.includes('expected_boxes')
    ) {
      return {
        ...row,
        passcode: hardenedPasscode,
        permissions: [...row.permissions, 'expected_boxes'],
        updated_at: nowIso(),
      };
    }
    if (hardenedPasscode !== row.passcode) {
      return { ...row, passcode: hardenedPasscode, updated_at: nowIso() };
    }
    return row;
  });

  write(KEYS.employees, rows);
  localStorage.setItem(KEYS.schema, LOCAL_SCHEMA_VERSION);
}

function ensureSeeded() {
  if (typeof localStorage === 'undefined') return;
  if (!localStorage.getItem(KEYS.suppliers)) write(KEYS.suppliers, defaultSuppliers());
  if (!localStorage.getItem(KEYS.carriers)) write(KEYS.carriers, defaultCarriers());
  if (!localStorage.getItem(KEYS.employees)) write(KEYS.employees, defaultEmployees());
  migrateLocalEmployees();
  if (!localStorage.getItem(KEYS.batches)) write(KEYS.batches, []);
  if (!localStorage.getItem(KEYS.items)) write(KEYS.items, []);
  if (!localStorage.getItem(KEYS.queue)) write(KEYS.queue, []);
}

export function getPendingOfflineChanges() {
  ensureSeeded();
  return read<OfflineQueueItem[]>(KEYS.queue, []);
}

export function removePendingOfflineChange(id: string) {
  ensureSeeded();
  write(
    KEYS.queue,
    read<OfflineQueueItem[]>(KEYS.queue, []).filter(item => item.id !== id)
  );
}

function queueOfflineChange(change: Omit<OfflineQueueItem, 'id' | 'created_at'>) {
  ensureSeeded();
  const item = {
    ...change,
    id: createId('offline'),
    created_at: nowIso(),
  } as OfflineQueueItem;
  write(KEYS.queue, [...read<OfflineQueueItem[]>(KEYS.queue, []), item]);
  return item;
}

export function clearLocalWarehouseData() {
  if (typeof localStorage === 'undefined') return;
  Object.values(KEYS).forEach(key => localStorage.removeItem(key));
}

export function listLocalSuppliers() {
  ensureSeeded();
  return sortByName(read<Supplier[]>(KEYS.suppliers, []));
}

export function cacheRemoteSuppliers(rows: Supplier[]) {
  ensureSeeded();
  const queuedSuppliers = getPendingOfflineChanges()
    .filter((item): item is Extract<OfflineQueueItem, { action: 'supplier:create' }> => item.action === 'supplier:create')
    .map(item => item.payload);
  const merged = [...rows];
  queuedSuppliers.forEach(supplier => {
    if (!merged.some(row => row.id === supplier.id)) {
      merged.push(supplier);
    }
  });
  write(KEYS.suppliers, sortByName(merged));
}

export function createLocalSupplier(payload: TablesInsert<'suppliers'>, options: { queueSync?: boolean } = {}) {
  ensureSeeded();
  const timestamp = nowIso();
  const row: Supplier = {
    id: payload.id || createId('supplier'),
    name: payload.name,
    code: payload.code ?? null,
    contact_name: payload.contact_name ?? null,
    phone: payload.phone ?? null,
    email: payload.email ?? null,
    notes: payload.notes ?? null,
    active: payload.active ?? true,
    created_at: payload.created_at || timestamp,
    updated_at: payload.updated_at || timestamp,
  };
  write(KEYS.suppliers, [...read<Supplier[]>(KEYS.suppliers, []), row]);
  if (options.queueSync) {
    queueOfflineChange({ action: 'supplier:create', payload: row });
  }
  return row;
}

export function updateLocalSupplier(id: string, patch: Partial<Supplier>) {
  ensureSeeded();
  const rows = read<Supplier[]>(KEYS.suppliers, []).map(row =>
    row.id === id ? { ...row, ...patch, updated_at: nowIso() } : row
  );
  write(KEYS.suppliers, rows);
}

export function deleteLocalSupplier(id: string) {
  ensureSeeded();
  if (read<ReceiptItem[]>(KEYS.items, []).some(item => item.supplier_id === id)) {
    throw new Error('Foreign key violation: supplier is already used in received items.');
  }
  write(
    KEYS.suppliers,
    read<Supplier[]>(KEYS.suppliers, []).filter(row => row.id !== id)
  );
}

export function listLocalCarriers() {
  ensureSeeded();
  return sortByName(read<Carrier[]>(KEYS.carriers, []));
}

export function cacheRemoteCarriers(rows: Carrier[]) {
  ensureSeeded();
  const queuedCarriers = getPendingOfflineChanges()
    .filter((item): item is Extract<OfflineQueueItem, { action: 'carrier:create' }> => item.action === 'carrier:create')
    .map(item => item.payload);
  const merged = [...rows];
  queuedCarriers.forEach(carrier => {
    if (!merged.some(row => row.id === carrier.id)) {
      merged.push(carrier);
    }
  });
  write(KEYS.carriers, sortByName(merged));
}

export function createLocalCarrier(payload: TablesInsert<'carriers'>, options: { queueSync?: boolean } = {}) {
  ensureSeeded();
  const timestamp = nowIso();
  const row: Carrier = {
    id: payload.id || createId('carrier'),
    name: payload.name,
    carrier_type: payload.carrier_type || 'custom',
    active: payload.active ?? true,
    created_at: payload.created_at || timestamp,
    updated_at: payload.updated_at || timestamp,
  };
  write(KEYS.carriers, [...read<Carrier[]>(KEYS.carriers, []), row]);
  if (options.queueSync) {
    queueOfflineChange({ action: 'carrier:create', payload: row });
  }
  return row;
}

export function updateLocalCarrier(id: string, patch: Partial<Carrier>) {
  ensureSeeded();
  const rows = read<Carrier[]>(KEYS.carriers, []).map(row =>
    row.id === id ? { ...row, ...patch, updated_at: nowIso() } : row
  );
  write(KEYS.carriers, rows);
}

export function deleteLocalCarrier(id: string) {
  ensureSeeded();
  if (read<ReceiptBatch[]>(KEYS.batches, []).some(batch => batch.carrier_id === id)) {
    throw new Error('Foreign key violation: carrier is already used in received batches.');
  }
  write(
    KEYS.carriers,
    read<Carrier[]>(KEYS.carriers, []).filter(row => row.id !== id)
  );
}

export function listLocalEmployees() {
  ensureSeeded();
  const existing = read<Employee[]>(KEYS.employees, []).map(normalizeEmployee);
  const merged = [...existing];
  for (const employee of defaultEmployees()) {
    if (!merged.some(row => row.id === employee.id || row.passcode === employee.passcode)) {
      merged.push(employee);
    }
  }
  const normalized = merged.map(normalizeEmployee);
  write(KEYS.employees, normalized);
  return sortByName(normalized);
}

export function cacheRemoteEmployees(rows: Employee[]) {
  ensureSeeded();
  write(KEYS.employees, sortByName(rows));
}

export function createLocalEmployee(payload: TablesInsert<'employees'>) {
  ensureSeeded();
  const timestamp = nowIso();
  const row: Employee = {
    id: payload.id || createId('employee'),
    name: payload.name,
    passcode: payload.passcode,
    active: payload.active ?? true,
    created_at: payload.created_at || timestamp,
    updated_at: payload.updated_at || timestamp,
    auth_user_id: payload.auth_user_id ?? null,
    permissions: payload.permissions ?? null,
    role: payload.role || 'warehouse',
    store_number: payload.store_number ?? null,
  };
  write(KEYS.employees, [...read<Employee[]>(KEYS.employees, []), row]);
  return row;
}

export function updateLocalEmployee(id: string, patch: Partial<Employee>) {
  ensureSeeded();
  const rows = read<Employee[]>(KEYS.employees, []).map(row =>
    row.id === id ? { ...row, ...patch, updated_at: nowIso() } : row
  );
  write(KEYS.employees, rows);
}

export function deleteLocalEmployee(id: string) {
  ensureSeeded();
  write(KEYS.employees, read<Employee[]>(KEYS.employees, []).filter(row => row.id !== id));
}

function getItemsForBatch(batchId: string) {
  return read<ReceiptItem[]>(KEYS.items, []).filter(item => item.batch_id === batchId);
}

export function listLocalBatches(dateFilter?: string): LocalBatchWithItems[] {
  ensureSeeded();
  return read<ReceiptBatch[]>(KEYS.batches, [])
    .filter(batch => !dateFilter || batch.received_at.startsWith(dateFilter))
    .sort((a, b) => b.received_at.localeCompare(a.received_at))
    .map(batch => ({ ...batch, receipt_items: getItemsForBatch(batch.id) }));
}

export function listLocalHistoryBatches(): LocalHistoryBatch[] {
  const suppliers = listLocalSuppliers();
  return listLocalBatches().map(batch => ({
    ...batch,
    receipt_items: batch.receipt_items.map(item => {
      const supplier = suppliers.find(row => row.id === item.supplier_id);
      return {
        ...item,
        suppliers: supplier ? { name: supplier.name, code: supplier.code } : null,
      };
    }),
  }));
}

export function updateLocalBatch(id: string, patch: Partial<ReceiptBatch>) {
  ensureSeeded();
  write(
    KEYS.batches,
    read<ReceiptBatch[]>(KEYS.batches, []).map(row =>
      row.id === id ? { ...row, ...patch, updated_at: nowIso() } : row
    )
  );
}

export function updateLocalItem(id: string, patch: Partial<ReceiptItem>) {
  ensureSeeded();
  write(
    KEYS.items,
    read<ReceiptItem[]>(KEYS.items, []).map(row =>
      row.id === id ? { ...row, ...patch, updated_at: nowIso() } : row
    )
  );
}

export function deleteLocalBatch(id: string) {
  ensureSeeded();
  write(
    KEYS.items,
    read<ReceiptItem[]>(KEYS.items, []).filter(item => item.batch_id !== id)
  );
  write(
    KEYS.batches,
    read<ReceiptBatch[]>(KEYS.batches, []).filter(batch => batch.id !== id)
  );
}

export function deleteLocalItem(id: string) {
  ensureSeeded();
  write(
    KEYS.items,
    read<ReceiptItem[]>(KEYS.items, []).filter(item => item.id !== id)
  );
}

export function saveLocalBatch(
  payload: TablesInsert<'receipt_batches'>,
  itemPayloads: TablesInsert<'receipt_items'>[],
  options: { queueSync?: boolean } = {}
) {
  ensureSeeded();
  if (itemPayloads.length === 0) {
    throw new Error('Cannot save a receipt without at least one receiving line');
  }

  const timestamp = nowIso();
  const batch: ReceiptBatch = {
    id: payload.id || createId('batch'),
    carrier_id: payload.carrier_id ?? null,
    received_by_employee_id: payload.received_by_employee_id ?? null,
    received_by_text: payload.received_by_text ?? 'Test User',
    received_at: payload.received_at || timestamp,
    shared_photo_path: payload.shared_photo_path ?? null,
    notes: payload.notes ?? null,
    created_at: payload.created_at || timestamp,
    updated_at: payload.updated_at || timestamp,
  };
  const items: ReceiptItem[] = itemPayloads.map(payloadItem => ({
    id: payloadItem.id || createId('item'),
    batch_id: batch.id,
    supplier_id: payloadItem.supplier_id,
    package_type: payloadItem.package_type,
    package_count: payloadItem.package_count ?? 1,
    damaged_box: payloadItem.damaged_box ?? false,
    damaged_notes: payloadItem.damaged_notes ?? null,
    tracking_number: payloadItem.tracking_number ?? null,
    comments: payloadItem.comments ?? null,
    item_photo_path: payloadItem.item_photo_path ?? null,
    created_at: payloadItem.created_at || timestamp,
    updated_at: payloadItem.updated_at || timestamp,
  }));

  write(KEYS.batches, [batch, ...read<ReceiptBatch[]>(KEYS.batches, [])]);
  write(KEYS.items, [...items, ...read<ReceiptItem[]>(KEYS.items, [])]);
  if (options.queueSync) {
    queueOfflineChange({ action: 'batch:create', payload: { batch, items } });
  }
  return {
    ...batch,
    expectedBoxesMatched: 0,
    expectedBoxIdsMatched: [] as string[],
    offlineQueued: Boolean(options.queueSync),
  };
}
