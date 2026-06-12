import { invokeProtectedFunction } from '@/lib/protectedFunctions';
import { mainPriceCategory, UNCATEGORIZED_PRICE_CATEGORY, UNKNOWN_PRICE_VENDOR } from '@/lib/priceCategories';

const MOCK_LOCAL = import.meta.env.VITE_MOCK_LOCAL === 'true';
const MOCK_STORAGE_KEY = 'mock-square-price-products-v1';
const MOCK_VENDOR_MAPPING_KEY = 'mock-square-price-vendor-mappings-v1';

// Shapes returned by the `square-prices` Edge Function.
export type PriceProduct = {
  found: boolean;
  barcode: string;
  name: string | null;
  imageUrl: string | null;
  currency: string;
  oldPrice: number | null;
  currentPrice: number | null;
  changePending: boolean;
  pendingStores: number[];
  confirmedStores: number[];
  matchedField?: string;
  reason?: string;
  error?: string;
};

export type SyncSummary = {
  ok: boolean;
  total: number;
  unicos: number;
  nuevos: number;
  cambiados: number;
  sinCambio: number;
  conflictos: number;
  missing?: number;
  syncRunStartedAt?: string | null;
  cursor?: string | null;
  hasMore?: boolean;
  complete?: boolean;
  pages?: number;
};

export type PriceChange = {
  barcode: string;
  name: string | null;
  categoryName: string | null;
  primaryCategory: string | null;
  vendorName: string | null;
  currency: string;
  oldPrice: number | null;
  currentPrice: number | null;
  pendingStores: number[];
  confirmedStores: number[];
  conflict?: boolean;
};

export type PriceDuplicate = PriceChange & {
  conflict: true;
};

export type PriceCatalogMissing = {
  barcode: string;
  name: string | null;
  categoryName: string | null;
  primaryCategory: string | null;
  vendorName: string | null;
  currency: string;
  oldPrice: number | null;
  currentPrice: number | null;
  catalogMissing: boolean;
  catalogMissingSince: string | null;
};

export type VendorMappingInput = {
  barcode: string;
  vendorName: string;
};

export type VendorMappingStatus = {
  ok: boolean;
  mappingCount: number;
  mappedProducts: number;
  unknownProducts: number;
  changedProducts: number;
  changedUnknownProducts: number;
  lastImportAt: string | null;
};

export type VendorImportSummary = {
  ok: boolean;
  imported: number;
  updatedProducts: number;
  skipped?: number;
  conflicts?: number;
  error?: string;
  status?: VendorMappingStatus;
};

export type CatalogAuditProduct = {
  barcode: string;
  sku: string | null;
  upc: string | null;
  itemId: string;
  variationId: string;
  name: string;
  currentPrice: number | null;
  currency: string;
  hasInventoryMovement: boolean;
  categories: CatalogAuditCategory[];
};

export type CatalogAuditCategory = {
  id: string;
  name: string;
};

export type CatalogAuditPage = {
  ok: boolean;
  total: number;
  products: CatalogAuditProduct[];
  cursor?: string | null;
  hasMore?: boolean;
  complete?: boolean;
};

type MockProduct = PriceProduct & {
  sku?: string | null;
  upc?: string | null;
  itemId: string;
  variationId: string;
  hasInventoryMovement: boolean;
  categories: CatalogAuditCategory[];
  vendorName?: string | null;
  auditDuplicate?: boolean;
};

const MOCK_PRODUCTS: MockProduct[] = [
  {
    found: true,
    barcode: '111111111111',
    sku: '111111111111',
    upc: '009111111111',
    itemId: 'MOCK_ITEM_PRICE_CHANGE',
    variationId: 'MOCK_VARIATION_PRICE_CHANGE',
    name: 'Organic Almond Butter 16 oz',
    imageUrl: null,
    currency: 'USD',
    oldPrice: 7.99,
    currentPrice: 8.49,
    changePending: true,
    pendingStores: [72, 86],
    confirmedStores: [],
    hasInventoryMovement: true,
    categories: [{ id: 'cat-pantry', name: 'Pantry' }],
    vendorName: 'Good Earth Foods',
  },
  {
    found: true,
    barcode: '222222222222',
    sku: '222222222222',
    upc: '009222222222',
    itemId: 'MOCK_ITEM_NO_CHANGE',
    variationId: 'MOCK_VARIATION_NO_CHANGE',
    name: 'Sparkling Mineral Water',
    imageUrl: null,
    currency: 'USD',
    oldPrice: 2.5,
    currentPrice: 2.5,
    changePending: false,
    pendingStores: [],
    confirmedStores: [],
    hasInventoryMovement: true,
    categories: [{ id: 'cat-beverages', name: 'Beverages' }],
    vendorName: 'Northline Supply',
  },
  {
    found: true,
    barcode: 'TAG-A',
    sku: 'TAG-A',
    upc: '333333333333',
    itemId: 'MOCK_ITEM_DUP_A',
    variationId: 'MOCK_VARIATION_DUP_A',
    name: 'Duplicate Barcode - Shelf Tag A',
    imageUrl: null,
    currency: 'USD',
    oldPrice: 4.99,
    currentPrice: 4.99,
    changePending: false,
    pendingStores: [],
    confirmedStores: [],
    hasInventoryMovement: true,
    auditDuplicate: true,
    categories: [{ id: 'cat-tags', name: 'Shelf Tags' }],
    vendorName: 'Party Source',
  },
  {
    found: true,
    barcode: 'TAG-B',
    sku: 'TAG-B',
    upc: '333333333333',
    itemId: 'MOCK_ITEM_DUP_B',
    variationId: 'MOCK_VARIATION_DUP_B',
    name: 'Duplicate Barcode - Shelf Tag B',
    imageUrl: null,
    currency: 'USD',
    oldPrice: 5.49,
    currentPrice: 5.49,
    changePending: false,
    pendingStores: [],
    confirmedStores: [],
    hasInventoryMovement: false,
    auditDuplicate: true,
    categories: [{ id: 'cat-tags', name: 'Shelf Tags' }],
    vendorName: 'Party Source',
  },
  {
    found: true,
    barcode: '444444444444',
    sku: null,
    upc: '444444444444',
    itemId: 'MOCK_ITEM_NO_MOVEMENT',
    variationId: 'MOCK_VARIATION_NO_MOVEMENT',
    name: 'Seasonal Display Item',
    imageUrl: null,
    currency: 'USD',
    oldPrice: 12,
    currentPrice: 12,
    changePending: false,
    pendingStores: [],
    confirmedStores: [],
    hasInventoryMovement: false,
    categories: [{ id: 'cat-seasonal', name: 'Seasonal' }],
    vendorName: null,
  },
];

const MOCK_CATALOG_MISSING_PRODUCTS: PriceCatalogMissing[] = [
  {
    barcode: '999999999999',
    name: 'Discontinued Mock Product',
    categoryName: 'Seasonal',
    primaryCategory: 'Seasonal',
    vendorName: 'Archived Vendor',
    currency: 'USD',
    oldPrice: 3.99,
    currentPrice: 3.99,
    catalogMissing: true,
    catalogMissingSince: new Date().toISOString(),
  },
];

function cloneMockProducts() {
  return MOCK_PRODUCTS.map(product => ({
    ...product,
    pendingStores: [...product.pendingStores],
    confirmedStores: [...product.confirmedStores],
    categories: product.categories.map(category => ({ ...category })),
  }));
}

function readMockProducts() {
  if (typeof window === 'undefined') return cloneMockProducts();
  try {
    const raw = window.localStorage.getItem(MOCK_STORAGE_KEY);
    if (!raw) {
      const seeded = cloneMockProducts();
      window.localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    return JSON.parse(raw) as MockProduct[];
  } catch {
    return cloneMockProducts();
  }
}

function writeMockProducts(products: MockProduct[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(products));
  } catch {
    /* ignore */
  }
}

function readMockVendorMappings() {
  if (typeof window === 'undefined') return new Map<string, string>();
  try {
    const raw = window.localStorage.getItem(MOCK_VENDOR_MAPPING_KEY);
    const rows = raw ? (JSON.parse(raw) as VendorMappingInput[]) : [];
    return new Map(rows.map(row => [row.barcode, row.vendorName]));
  } catch {
    return new Map<string, string>();
  }
}

function writeMockVendorMappings(mappings: Map<string, string>) {
  if (typeof window === 'undefined') return;
  try {
    const rows = [...mappings.entries()].map(([barcode, vendorName]) => ({ barcode, vendorName }));
    window.localStorage.setItem(MOCK_VENDOR_MAPPING_KEY, JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}

function mockVendorStatus(): VendorMappingStatus {
  const products = readMockProducts().map(normalizeMockProduct);
  const mappings = readMockVendorMappings();
  const isUnknownVendor = (vendorName: string | null | undefined) =>
    !vendorName || vendorName === UNKNOWN_PRICE_VENDOR;
  const priceProducts = products.filter(product => !product.auditDuplicate);
  const changes = priceProducts.filter(product => product.changePending);
  return {
    ok: true,
    mappingCount: mappings.size,
    mappedProducts: priceProducts.filter(product => !isUnknownVendor(product.vendorName)).length,
    unknownProducts: priceProducts.filter(product => isUnknownVendor(product.vendorName)).length,
    changedProducts: changes.length,
    changedUnknownProducts: changes.filter(product => isUnknownVendor(product.vendorName)).length,
    lastImportAt: mappings.size > 0 ? new Date().toISOString() : null,
  };
}

function normalizeMockProduct(product: MockProduct): MockProduct {
  const defaultProduct = MOCK_PRODUCTS.find(row => row.variationId === product.variationId);
  const changePending =
    product.oldPrice != null &&
    product.currentPrice != null &&
    product.oldPrice !== product.currentPrice;
  const confirmedStores = changePending ? product.confirmedStores.filter(store => store === 72 || store === 86) : [];
  return {
    ...product,
    categories:
      product.categories?.length
        ? product.categories
        : defaultProduct?.categories || [{ id: 'uncategorized', name: 'Uncategorized' }],
    changePending,
    confirmedStores,
    pendingStores: changePending
      ? ([72, 86] as const).filter(store => !confirmedStores.includes(store))
      : [],
  };
}

function toAuditProduct(product: MockProduct): CatalogAuditProduct {
  return {
    barcode: product.barcode,
    sku: product.sku ?? null,
    upc: product.upc ?? null,
    itemId: product.itemId,
    variationId: product.variationId,
    name: product.name || 'Mock product',
    currentPrice: product.currentPrice,
    currency: product.currency,
    hasInventoryMovement: product.hasInventoryMovement,
    categories: product.categories,
  };
}

function mockNotFound(barcode: string): PriceProduct {
  return {
    found: false,
    barcode,
    name: null,
    imageUrl: null,
    currency: 'USD',
    oldPrice: null,
    currentPrice: null,
    changePending: false,
    pendingStores: [],
    confirmedStores: [],
    reason: 'Mock product not found',
  };
}

const mockSquarePrices = {
  lookup: async (barcode: string): Promise<PriceProduct> => {
    const code = barcode.trim();
    const product = readMockProducts().find(row => row.barcode === code);
    return product ? normalizeMockProduct(product) : mockNotFound(code);
  },
  tag: async (barcode: string, store: 72 | 86): Promise<PriceProduct & { ok: boolean }> => {
    const products = readMockProducts();
    const index = products.findIndex(row => row.barcode === barcode);
    if (index < 0) throw new Error('Mock product not found');

    const product = normalizeMockProduct(products[index]);
    if (product.changePending && !product.confirmedStores.includes(store)) {
      product.confirmedStores = [...product.confirmedStores, store];
    }

    if (product.confirmedStores.includes(72) && product.confirmedStores.includes(86)) {
      product.oldPrice = product.currentPrice;
      product.confirmedStores = [];
    }

    products[index] = normalizeMockProduct(product);
    writeMockProducts(products);
    return { ...products[index], ok: true };
  },
  sync: async (): Promise<SyncSummary> => {
    const products = readMockProducts().map(normalizeMockProduct);
    const duplicateBarcodes = new Set(
      products
        .map(product => product.barcode)
        .filter((barcode, index, all) => all.indexOf(barcode) !== index)
    );
    const priceProducts = products.filter(product => !duplicateBarcodes.has(product.barcode));
    return {
      ok: true,
      total: products.length,
      unicos: new Set(priceProducts.map(product => product.barcode)).size,
      nuevos: 0,
      cambiados: priceProducts.filter(product => product.changePending).length,
      sinCambio: priceProducts.filter(product => !product.changePending).length,
      conflictos: duplicateBarcodes.size,
      missing: MOCK_CATALOG_MISSING_PRODUCTS.length,
      complete: true,
      hasMore: false,
      cursor: null,
      pages: 1,
    };
  },
  changes: async (): Promise<{ ok: boolean; count: number; changes: PriceChange[] }> => {
    const products = readMockProducts().map(normalizeMockProduct);
    const duplicateBarcodes = new Set(
      products
        .map(product => product.barcode)
        .filter((barcode, index, all) => all.indexOf(barcode) !== index)
    );
    const changes = products
      .filter(product => product.changePending && !duplicateBarcodes.has(product.barcode))
      .map(product => ({
        barcode: product.barcode,
        name: product.name,
        categoryName: product.categories[0]?.name || UNCATEGORIZED_PRICE_CATEGORY,
        primaryCategory: mainPriceCategory(product.categories[0]?.name),
        vendorName: product.vendorName || UNKNOWN_PRICE_VENDOR,
        currency: product.currency,
        oldPrice: product.oldPrice,
        currentPrice: product.currentPrice,
        pendingStores: product.pendingStores,
        confirmedStores: product.confirmedStores,
        conflict: false,
      }));
    return { ok: true, count: changes.length, changes };
  },
  duplicates: async (): Promise<{ ok: boolean; count: number; duplicates: PriceDuplicate[] }> => {
    const products = readMockProducts().map(normalizeMockProduct);
    const duplicateBarcodes = new Set(
      products
        .map(product => product.barcode)
        .filter((barcode, index, all) => all.indexOf(barcode) !== index)
    );
    const duplicates = products
      .filter((product, index, all) =>
        (product.auditDuplicate || duplicateBarcodes.has(product.barcode)) &&
        all.findIndex(row => row.barcode === product.barcode) === index
      )
      .map(product => ({
        barcode: product.barcode,
        name: product.name,
        categoryName: product.categories[0]?.name || UNCATEGORIZED_PRICE_CATEGORY,
        primaryCategory: mainPriceCategory(product.categories[0]?.name),
        vendorName: product.vendorName || UNKNOWN_PRICE_VENDOR,
        currency: product.currency,
        oldPrice: product.oldPrice,
        currentPrice: product.currentPrice,
        pendingStores: [],
        confirmedStores: [],
        conflict: true as const,
      }));
    return { ok: true, count: duplicates.length, duplicates };
  },
  catalogMissing: async (): Promise<{ ok: boolean; count: number; missing: PriceCatalogMissing[] }> => ({
    ok: true,
    count: MOCK_CATALOG_MISSING_PRODUCTS.length,
    missing: MOCK_CATALOG_MISSING_PRODUCTS,
  }),
  importVendorMappings: async (
    rows: VendorMappingInput[],
    source = 'square_catalog'
  ): Promise<VendorImportSummary> => {
    void source;
    const mappings = readMockVendorMappings();
    const products = readMockProducts();
    let skipped = 0;
    let conflicts = 0;

    for (const row of rows) {
      const barcode = row.barcode.trim();
      const vendorName = row.vendorName.trim();
      if (!barcode || !vendorName) {
        skipped += 1;
        continue;
      }
      const previous = mappings.get(barcode);
      if (previous && previous.toLowerCase() !== vendorName.toLowerCase()) conflicts += 1;
      mappings.set(barcode, vendorName);
    }

    let updatedProducts = 0;
    const nextProducts = products.map(product => {
      const vendorName = mappings.get(product.barcode);
      if (!vendorName) return product;
      updatedProducts += 1;
      return { ...product, vendorName };
    });

    writeMockVendorMappings(mappings);
    writeMockProducts(nextProducts);

    return {
      ok: true,
      imported: mappings.size,
      updatedProducts,
      skipped,
      conflicts,
      status: mockVendorStatus(),
    };
  },
  vendorMappingStatus: async (): Promise<VendorMappingStatus> => mockVendorStatus(),
  audit: async (): Promise<CatalogAuditPage> => {
    const products = readMockProducts().map(normalizeMockProduct);
    return {
      ok: true,
      total: products.length,
      products: products.map(toAuditProduct),
      complete: true,
      hasMore: false,
      cursor: null,
    };
  },
  health: async () => ({
    ok: true,
    environment: 'mock',
    tokenConfigured: true,
  }),
};

async function invokeSquarePrices<T>(body: Record<string, unknown>): Promise<T> {
  return invokeProtectedFunction<T>('square-prices', body);
}

export const squarePrices = {
  lookup: (barcode: string) =>
    MOCK_LOCAL ? mockSquarePrices.lookup(barcode) : invokeSquarePrices<PriceProduct>({ action: 'lookup', barcode }),
  tag: (barcode: string, store: 72 | 86) =>
    MOCK_LOCAL ? mockSquarePrices.tag(barcode, store) : invokeSquarePrices<PriceProduct & { ok: boolean }>({ action: 'tag', barcode, store }),
  sync: (cursor?: string | null, syncRunStartedAt?: string | null) =>
    MOCK_LOCAL ? mockSquarePrices.sync() : invokeSquarePrices<SyncSummary>({
        action: 'sync',
        ...(cursor ? { cursor } : {}),
        ...(syncRunStartedAt ? { syncRunStartedAt } : {}),
      }),
  changes: () =>
    MOCK_LOCAL ? mockSquarePrices.changes() : invokeSquarePrices<{ ok: boolean; count: number; changes: PriceChange[] }>({
        action: 'changes',
      }),
  duplicates: () =>
    MOCK_LOCAL ? mockSquarePrices.duplicates() : invokeSquarePrices<{ ok: boolean; count: number; duplicates: PriceDuplicate[] }>({
        action: 'duplicates',
      }),
  catalogMissing: () =>
    MOCK_LOCAL ? mockSquarePrices.catalogMissing() : invokeSquarePrices<{ ok: boolean; count: number; missing: PriceCatalogMissing[] }>({
        action: 'catalog-missing',
      }),
  importVendorMappings: (rows: VendorMappingInput[], source?: string) =>
    MOCK_LOCAL ? mockSquarePrices.importVendorMappings(rows, source) : invokeSquarePrices<VendorImportSummary>({
        action: 'vendor-map-import',
        rows,
        source,
      }),
  vendorMappingStatus: () =>
    MOCK_LOCAL ? mockSquarePrices.vendorMappingStatus() : invokeSquarePrices<VendorMappingStatus>({
        action: 'vendor-map-status',
      }),
  audit: (cursor?: string | null) =>
    MOCK_LOCAL ? mockSquarePrices.audit() : invokeSquarePrices<CatalogAuditPage>({
        action: 'audit',
        ...(cursor ? { cursor } : {}),
      }),
  health: () =>
    MOCK_LOCAL ? mockSquarePrices.health() : invokeSquarePrices<{ ok: boolean; environment: string; tokenConfigured: boolean }>({
        action: 'health',
      }),
};

export function formatMoney(n: number | null | undefined, currency = 'USD') {
  if (n == null) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
  } catch {
    return `$${Number(n).toFixed(2)}`;
  }
}
