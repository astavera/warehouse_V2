import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  Building2,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Package,
  PackageX,
  RefreshCw,
  Search,
  SearchCheck,
  Tags,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  formatMoney,
  squarePrices,
  type CatalogAuditLocation,
  type CatalogAuditProduct,
  type CatalogAuditScope,
  type CatalogAuditScopeOption,
} from '@/hooks/useSquarePrices';

type VendorSummary = {
  vendorName: string;
  itemCount: number;
  missingPrice: number;
  missingSku: number;
  totalInventory: number;
  byLocation: Record<string, number>;
};

type CategorySummary = {
  key: string;
  name: string;
  itemCount: number;
  missingPrice: number;
  missingSku: number;
  totalInventory: number;
  byLocation: Record<string, number>;
};

type AuditGroupBy = 'vendor' | 'category';
type AuditTarget = 'breakdown' | 'issues' | 'availability';
type AuditScopeMode = 'full' | 'vendor' | 'category' | 'item' | 'barcode';
type AuditPageLimit = '1' | '5' | '20' | 'all';
type LowStockLimit = 'all' | '0' | '5' | '10' | '25' | '50';
type LowStockMode = 'all' | 'out' | 'positive';
type AvailabilityLocationListMode = 'only' | 'enabled' | 'missing';

type AuditBreakdownRow = {
  id: string;
  name: string;
  itemCount: number;
  missingPrice: number;
  missingSku: number;
  totalInventory: number;
  byLocation: Record<string, number>;
};

type LowStockRow = {
  product: CatalogAuditProduct;
  quantity: number;
};

const AUDIT_TARGET_LABELS: Record<AuditTarget, string> = {
  breakdown: 'Breakdown',
  issues: 'Issues',
  availability: 'Availability',
};

function emptyAuditProductsByTarget(): Record<AuditTarget, CatalogAuditProduct[]> {
  return {
    breakdown: [],
    issues: [],
    availability: [],
  };
}

function emptyAuditRunByTarget(): Record<AuditTarget, boolean> {
  return {
    breakdown: false,
    issues: false,
    availability: false,
  };
}

function emptyAuditRefreshByTarget(): Record<AuditTarget, Date | null> {
  return {
    breakdown: null,
    issues: null,
    availability: null,
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatQuantity(value: number) {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function cleanCategoryName(value: string | null | undefined) {
  const text = String(value || '').trim();
  if (!text) return null;
  return /^[A-Z0-9]{16,}$/.test(text) ? null : text;
}

function productVendor(product: CatalogAuditProduct) {
  return product.vendorName?.trim() || 'Unknown vendor';
}

function productCategories(product: CatalogAuditProduct) {
  const cleaned = new Map<string, { id: string; name: string }>();

  for (const category of product.categories || []) {
    const name = cleanCategoryName(category.name) || cleanCategoryName(category.id);
    if (!name) continue;
    cleaned.set(name, { id: name, name });
  }

  return cleaned.size > 0
    ? [...cleaned.values()]
    : [{ id: 'Uncategorized', name: 'Uncategorized' }];
}

function categoryLabel(product: CatalogAuditProduct) {
  return productCategories(product).map(category => category.name).join(', ');
}

function locationQuantity(product: CatalogAuditProduct, locationId: string) {
  return product.inventoryByLocation
    .filter(row => row.locationId === locationId)
    .reduce((sum, row) => sum + row.quantity, 0);
}

function locationDisplayName(location: CatalogAuditLocation) {
  const raw = location.name.trim();
  const normalized = raw.toLowerCase();
  if (normalized.includes('warehouse')) return 'Warehouse';
  if (normalized === '72' || normalized === 't72' || normalized.includes(' 72')) return '72';
  if (normalized === '86' || normalized === 't86' || normalized.includes(' 86')) return '86';
  return raw || location.id;
}

function locationSortValue(location: CatalogAuditLocation) {
  const name = locationDisplayName(location);
  if (name === 'Warehouse') return 0;
  if (name === '72') return 1;
  if (name === '86') return 2;
  return 10;
}

function inventoryTone(quantity: number) {
  if (quantity <= 0) return 'text-rose-700';
  if (quantity <= 5) return 'text-amber-700';
  return 'text-emerald-700';
}

function productBarcode(product: CatalogAuditProduct) {
  return product.barcode || product.upc || product.sku || '-';
}

function enabledLocationIdsFor(product: CatalogAuditProduct, orderedLocations: CatalogAuditLocation[]) {
  if (product.presentAtAllLocations !== false) return orderedLocations.map(location => location.id);
  const validLocationIds = new Set(orderedLocations.map(location => location.id));
  return (product.enabledLocationIds || []).filter(locationId => validLocationIds.has(locationId));
}

function enabledLocationLabel(product: CatalogAuditProduct, orderedLocations: CatalogAuditLocation[]) {
  if (product.presentAtAllLocations !== false) return 'All locations';
  const enabledLocationIds = enabledLocationIdsFor(product, orderedLocations);
  if (enabledLocationIds.length === 0) return 'No locations';
  return enabledLocationIds
    .map(locationId => locationDisplayName(orderedLocations.find(location => location.id === locationId) || { id: locationId, name: locationId }))
    .join(', ');
}

function missingLocationLabel(product: CatalogAuditProduct, orderedLocations: CatalogAuditLocation[]) {
  if (product.presentAtAllLocations !== false) return '-';
  const enabledLocationIdSet = new Set(enabledLocationIdsFor(product, orderedLocations));
  const missingLocations = orderedLocations.filter(location => !enabledLocationIdSet.has(location.id));
  return missingLocations.length > 0 ? missingLocations.map(locationDisplayName).join(', ') : '-';
}

function singleEnabledLocation(product: CatalogAuditProduct, orderedLocations: CatalogAuditLocation[]) {
  const enabledLocationIds = enabledLocationIdsFor(product, orderedLocations);
  if (enabledLocationIds.length !== 1) return null;
  const locationId = enabledLocationIds[0];
  return orderedLocations.find(location => location.id === locationId) || { id: locationId, name: locationId };
}

function matchesSearch(product: CatalogAuditProduct, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    product.name,
    product.sku,
    product.upc,
    product.barcode,
    productVendor(product),
    categoryLabel(product),
  ]
    .filter(Boolean)
    .some(value => String(value).toLowerCase().includes(needle));
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = 'slate',
}: {
  icon: typeof Package;
  label: string;
  value: string | number;
  tone?: 'slate' | 'amber' | 'rose' | 'emerald' | 'sky';
}) {
  const tones = {
    slate: 'text-slate-950 bg-slate-50',
    amber: 'text-amber-700 bg-amber-50',
    rose: 'text-rose-700 bg-rose-50',
    emerald: 'text-emerald-700 bg-emerald-50',
    sky: 'text-sky-700 bg-sky-50',
  };

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-bold text-slate-950">{value}</div>
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
        </div>
        <div className={`rounded-lg p-2 ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function IssueRow({ product }: { product: CatalogAuditProduct }) {
  return (
    <div className="grid gap-2 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_150px_120px_110px] sm:items-center">
      <div className="min-w-0">
        <div className="truncate font-semibold text-slate-950">{product.name}</div>
        <div className="truncate text-xs text-muted-foreground">{categoryLabel(product)}</div>
        <div className="truncate text-xs text-muted-foreground">{product.variationId}</div>
      </div>
      <div className="space-y-0.5 font-mono text-xs text-muted-foreground sm:text-right">
        <div>SKU: {product.sku || '-'}</div>
        <div>UPC: {product.upc || '-'}</div>
      </div>
      <div className="text-sm font-medium sm:text-right">
        {formatMoney(product.currentPrice, product.currency)}
      </div>
      <div className="text-xs font-semibold text-emerald-700 sm:text-right">
        {formatQuantity(product.totalInventory)} live
      </div>
    </div>
  );
}

export default function InventoryAuditPage() {
  const [auditTarget, setAuditTarget] = useState<AuditTarget>('availability');
  const [auditProductsByTarget, setAuditProductsByTarget] = useState<Record<AuditTarget, CatalogAuditProduct[]>>(() => emptyAuditProductsByTarget());
  const [auditRunByTarget, setAuditRunByTarget] = useState<Record<AuditTarget, boolean>>(() => emptyAuditRunByTarget());
  const [lastRefreshByTarget, setLastRefreshByTarget] = useState<Record<AuditTarget, Date | null>>(() => emptyAuditRefreshByTarget());
  const [locations, setLocations] = useState<CatalogAuditLocation[]>([]);
  const [auditing, setAuditing] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [pages, setPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [issueSearch, setIssueSearch] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('all');
  const [auditGroupBy, setAuditGroupBy] = useState<AuditGroupBy>('vendor');
  const [auditScopeMode, setAuditScopeMode] = useState<AuditScopeMode>('full');
  const [auditLocationScope, setAuditLocationScope] = useState('all');
  const [auditPageLimit, setAuditPageLimit] = useState<AuditPageLimit>('5');
  const [breakdownSearch, setBreakdownSearch] = useState('');
  const [focusedBreakdownId, setFocusedBreakdownId] = useState('all');
  const [itemScopeQuery, setItemScopeQuery] = useState('');
  const [barcodeScopeText, setBarcodeScopeText] = useState('');
  const [lowStockLocationId, setLowStockLocationId] = useState('all');
  const [lowStockVendor, setLowStockVendor] = useState('all');
  const [lowStockCategory, setLowStockCategory] = useState('all');
  const [lowStockLimit, setLowStockLimit] = useState<LowStockLimit>('10');
  const [lowStockMode, setLowStockMode] = useState<LowStockMode>('all');
  const [lowStockSearch, setLowStockSearch] = useState('');
  const [singleLocationFilter, setSingleLocationFilter] = useState('all');
  const [singleLocationSearch, setSingleLocationSearch] = useState('');
  const [availabilityLocationListId, setAvailabilityLocationListId] = useState('all');
  const [availabilityLocationListMode, setAvailabilityLocationListMode] = useState<AvailabilityLocationListMode>('only');
  const [auditScopes, setAuditScopes] = useState<{ vendors: CatalogAuditScopeOption[]; categories: CatalogAuditScopeOption[] }>({
    vendors: [],
    categories: [],
  });
  const [loadingScopes, setLoadingScopes] = useState(false);
  const products = auditProductsByTarget[auditTarget];
  const hasRun = auditRunByTarget[auditTarget];
  const lastRefreshAt = lastRefreshByTarget[auditTarget];
  const auditTargetLabel = AUDIT_TARGET_LABELS[auditTarget];
  const orderedLocations = useMemo(
    () => [...locations].sort((a, b) => locationSortValue(a) - locationSortValue(b) || locationDisplayName(a).localeCompare(locationDisplayName(b))),
    [locations]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadAuditScopes() {
      setLoadingScopes(true);
      try {
        const data = await squarePrices.auditScopes();
        if (cancelled) return;
        setAuditScopes({
          vendors: data.vendors || [],
          categories: data.categories || [],
        });
      } catch (err) {
        if (!cancelled) {
          toast.error(getErrorMessage(err, 'Vendor and category list failed to load'));
        }
      } finally {
        if (!cancelled) setLoadingScopes(false);
      }
    }

    void loadAuditScopes();

    return () => {
      cancelled = true;
    };
  }, []);

  const missingPrice = useMemo(
    () => products.filter(product => product.currentPrice == null),
    [products]
  );
  const missingSku = useMemo(
    () => products.filter(product => !product.sku?.trim()),
    [products]
  );
  const locationLimitedProducts = useMemo(
    () =>
      products.filter(product => {
        if (orderedLocations.length <= 1 || product.presentAtAllLocations !== false) return false;
        const enabledLocationCount = enabledLocationIdsFor(product, orderedLocations).length;
        return enabledLocationCount > 0 && enabledLocationCount < orderedLocations.length;
      }),
    [orderedLocations, products]
  );
  const singleLocationProducts = useMemo(
    () => locationLimitedProducts.filter(product => enabledLocationIdsFor(product, orderedLocations).length === 1),
    [locationLimitedProducts, orderedLocations]
  );
  const singleLocationCounts = useMemo(
    () =>
      orderedLocations.map(location => ({
        ...location,
        count: singleLocationProducts.filter(product => singleEnabledLocation(product, orderedLocations)?.id === location.id).length,
      })),
    [orderedLocations, singleLocationProducts]
  );
  const singleLocationVisible = useMemo(
    () =>
      singleLocationProducts
        .filter(product => singleLocationFilter === 'all' || singleEnabledLocation(product, orderedLocations)?.id === singleLocationFilter)
        .filter(product => matchesSearch(product, singleLocationSearch))
        .sort((a, b) => {
          const aLocation = singleEnabledLocation(a, orderedLocations);
          const bLocation = singleEnabledLocation(b, orderedLocations);
          return (
            locationSortValue(aLocation || { id: '', name: '' }) - locationSortValue(bLocation || { id: '', name: '' }) ||
            productVendor(a).localeCompare(productVendor(b)) ||
            a.name.localeCompare(b.name)
          );
        })
        .slice(0, 120),
    [orderedLocations, singleLocationFilter, singleLocationProducts, singleLocationSearch]
  );
  const availabilityLocationListRows = useMemo(
    () =>
      locationLimitedProducts
        .filter(product => {
          if (availabilityLocationListId === 'all') return availabilityLocationListMode === 'only'
            ? enabledLocationIdsFor(product, orderedLocations).length === 1
            : true;

          const enabledLocationIds = enabledLocationIdsFor(product, orderedLocations);
          if (availabilityLocationListMode === 'only') {
            return enabledLocationIds.length === 1 && enabledLocationIds[0] === availabilityLocationListId;
          }
          if (availabilityLocationListMode === 'enabled') return enabledLocationIds.includes(availabilityLocationListId);
          return !enabledLocationIds.includes(availabilityLocationListId);
        })
        .sort((a, b) => {
          const aLocation = singleEnabledLocation(a, orderedLocations);
          const bLocation = singleEnabledLocation(b, orderedLocations);
          return (
            locationSortValue(aLocation || { id: '', name: '' }) - locationSortValue(bLocation || { id: '', name: '' }) ||
            productVendor(a).localeCompare(productVendor(b)) ||
            a.name.localeCompare(b.name)
          );
        })
        .slice(0, 180),
    [availabilityLocationListId, availabilityLocationListMode, locationLimitedProducts, orderedLocations]
  );
  const locationLimitedVisible = useMemo(
    () =>
      [...locationLimitedProducts]
        .sort((a, b) => {
          const aEnabled = enabledLocationIdsFor(a, orderedLocations).length;
          const bEnabled = enabledLocationIdsFor(b, orderedLocations).length;
          return aEnabled - bEnabled || productVendor(a).localeCompare(productVendor(b)) || a.name.localeCompare(b.name);
        })
        .slice(0, 80),
    [locationLimitedProducts, orderedLocations]
  );
  const missingPriceVisible = useMemo(
    () => missingPrice.filter(product => matchesSearch(product, issueSearch)).slice(0, 80),
    [issueSearch, missingPrice]
  );
  const missingPricePrintable = useMemo(
    () => missingPrice.filter(product => matchesSearch(product, issueSearch)),
    [issueSearch, missingPrice]
  );
  const missingSkuVisible = useMemo(
    () => missingSku.filter(product => matchesSearch(product, issueSearch)).slice(0, 80),
    [issueSearch, missingSku]
  );

  const vendorSummaries = useMemo<VendorSummary[]>(() => {
    const summaries = new Map<string, VendorSummary>();

    for (const product of products) {
      const vendorName = productVendor(product);
      const existing =
        summaries.get(vendorName) ||
        {
          vendorName,
          itemCount: 0,
          missingPrice: 0,
          missingSku: 0,
          totalInventory: 0,
          byLocation: {},
        };
      existing.itemCount += 1;
      existing.totalInventory += product.totalInventory;
      if (product.currentPrice == null) existing.missingPrice += 1;
      if (!product.sku?.trim()) existing.missingSku += 1;
      for (const location of orderedLocations) {
        existing.byLocation[location.id] = (existing.byLocation[location.id] || 0) + locationQuantity(product, location.id);
      }
      summaries.set(vendorName, existing);
    }

    return [...summaries.values()].sort((a, b) => b.itemCount - a.itemCount || a.vendorName.localeCompare(b.vendorName));
  }, [orderedLocations, products]);

  const topVendors = vendorSummaries.slice(0, 5);

  const categorySummaries = useMemo<CategorySummary[]>(() => {
    const summaries = new Map<string, CategorySummary>();

    for (const product of products) {
      for (const category of productCategories(product)) {
        const key = category.name || category.id || 'Uncategorized';
        const existing =
          summaries.get(key) ||
          {
            key,
            name: category.name || 'Uncategorized',
            itemCount: 0,
            missingPrice: 0,
            missingSku: 0,
            totalInventory: 0,
            byLocation: {},
          };

        existing.itemCount += 1;
        existing.totalInventory += product.totalInventory;
        if (product.currentPrice == null) existing.missingPrice += 1;
        if (!product.sku?.trim()) existing.missingSku += 1;

        for (const location of orderedLocations) {
          existing.byLocation[location.id] = (existing.byLocation[location.id] || 0) + locationQuantity(product, location.id);
        }

        summaries.set(key, existing);
      }
    }

    return [...summaries.values()].sort((a, b) => {
      const aQty = selectedLocationId === 'all' ? a.totalInventory : a.byLocation[selectedLocationId] || 0;
      const bQty = selectedLocationId === 'all' ? b.totalInventory : b.byLocation[selectedLocationId] || 0;
      return bQty - aQty || b.itemCount - a.itemCount || a.name.localeCompare(b.name);
    });
  }, [orderedLocations, products, selectedLocationId]);

  const totalLiveInventory = products.reduce((sum, product) => sum + product.totalInventory, 0);
  const productsWithLiveInventory = products.filter(product => product.totalInventory > 0).length;
  const locationTotals = orderedLocations.map(location => ({
    ...location,
    quantity: products.reduce((sum, product) => sum + locationQuantity(product, location.id), 0),
  }));
  const selectedLocationName =
    selectedLocationId === 'all'
      ? 'All locations'
      : locationDisplayName(orderedLocations.find(location => location.id === selectedLocationId) || { id: selectedLocationId, name: selectedLocationId });
  const lastRefreshLabel = lastRefreshAt
    ? lastRefreshAt.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
    : 'No refresh yet';
  const lowStockLocationName =
    lowStockLocationId === 'all'
      ? 'All locations'
      : locationDisplayName(orderedLocations.find(location => location.id === lowStockLocationId) || { id: lowStockLocationId, name: lowStockLocationId });
  const lowStockRows = useMemo<LowStockRow[]>(() => {
    const maxQuantity = lowStockLimit === 'all' ? Number.POSITIVE_INFINITY : Number(lowStockLimit);

    return products
      .map(product => ({
        product,
        quantity: lowStockLocationId === 'all' ? product.totalInventory : locationQuantity(product, lowStockLocationId),
      }))
      .filter(row => {
        if (lowStockVendor !== 'all' && productVendor(row.product) !== lowStockVendor) return false;
        if (
          lowStockCategory !== 'all' &&
          !productCategories(row.product).some(category => category.name === lowStockCategory || category.id === lowStockCategory)
        ) {
          return false;
        }
        if (!matchesSearch(row.product, lowStockSearch)) return false;
        if (lowStockMode === 'out' && row.quantity > 0) return false;
        if (lowStockMode === 'positive' && row.quantity <= 0) return false;
        return row.quantity <= maxQuantity;
      })
      .sort((a, b) => a.quantity - b.quantity || productVendor(a.product).localeCompare(productVendor(b.product)) || a.product.name.localeCompare(b.product.name))
      .slice(0, 80);
  }, [lowStockCategory, lowStockLimit, lowStockLocationId, lowStockMode, lowStockSearch, lowStockVendor, products]);
  const loadedAuditBreakdownRows = useMemo<AuditBreakdownRow[]>(() => {
    const rows =
      auditGroupBy === 'vendor'
        ? vendorSummaries.map(vendor => ({
            id: vendor.vendorName,
            name: vendor.vendorName,
            itemCount: vendor.itemCount,
            missingPrice: vendor.missingPrice,
            missingSku: vendor.missingSku,
            totalInventory: vendor.totalInventory,
            byLocation: vendor.byLocation,
          }))
        : categorySummaries.map(category => ({
            id: category.key,
            name: category.name,
            itemCount: category.itemCount,
            missingPrice: category.missingPrice,
            missingSku: category.missingSku,
            totalInventory: category.totalInventory,
            byLocation: category.byLocation,
          }));

    return rows.sort((a, b) => b.totalInventory - a.totalInventory || b.itemCount - a.itemCount || a.name.localeCompare(b.name));
  }, [auditGroupBy, categorySummaries, vendorSummaries]);
  const preloadedAuditScopeRows = useMemo<AuditBreakdownRow[]>(() => {
    const scopes = auditGroupBy === 'vendor' ? auditScopes.vendors : auditScopes.categories;
    const rows = new Map<string, AuditBreakdownRow>();

    for (const scope of scopes) {
      const name =
        auditGroupBy === 'category'
          ? cleanCategoryName(scope.name) || cleanCategoryName(scope.id) || 'Uncategorized'
          : scope.name;
      const existing = rows.get(name);
      rows.set(name, {
        id: name,
        name,
        itemCount: (existing?.itemCount || 0) + scope.itemCount,
        missingPrice: 0,
        missingSku: 0,
        totalInventory: 0,
        byLocation: {},
      });
    }

    return [...rows.values()].sort((a, b) => b.itemCount - a.itemCount || a.name.localeCompare(b.name));
  }, [auditGroupBy, auditScopes.categories, auditScopes.vendors]);
  const scopeSelectRows = useMemo<AuditBreakdownRow[]>(() => {
    const rows = new Map<string, AuditBreakdownRow>();
    for (const row of preloadedAuditScopeRows) rows.set(row.id, row);
    for (const row of loadedAuditBreakdownRows) rows.set(row.id, row);
    return [...rows.values()].sort((a, b) => b.itemCount - a.itemCount || a.name.localeCompare(b.name));
  }, [loadedAuditBreakdownRows, preloadedAuditScopeRows]);
  const rawAuditBreakdownRows = useMemo<AuditBreakdownRow[]>(() => {
    const needle = breakdownSearch.trim().toLowerCase();
    return loadedAuditBreakdownRows
      .filter(row => !needle || row.name.toLowerCase().includes(needle))
      .sort((a, b) => b.totalInventory - a.totalInventory || b.itemCount - a.itemCount || a.name.localeCompare(b.name));
  }, [breakdownSearch, loadedAuditBreakdownRows]);
  const auditBreakdownRows = useMemo(
    () => rawAuditBreakdownRows.filter(row => focusedBreakdownId === 'all' || row.id === focusedBreakdownId),
    [focusedBreakdownId, rawAuditBreakdownRows]
  );
  const reportProducts = useMemo(
    () =>
      products.filter(product => {
        if (focusedBreakdownId === 'all') return true;
        if (auditGroupBy === 'vendor') return productVendor(product) === focusedBreakdownId;
        return productCategories(product).some(category => {
          const categoryKey = category.name || category.id || 'Uncategorized';
          return categoryKey === focusedBreakdownId || category.id === focusedBreakdownId;
        });
      }),
    [auditGroupBy, focusedBreakdownId, products]
  );
  const reportMissingPrice = useMemo(
    () => reportProducts.filter(product => product.currentPrice == null),
    [reportProducts]
  );
  const reportMissingSku = useMemo(
    () => reportProducts.filter(product => !product.sku?.trim()),
    [reportProducts]
  );
  const reportTotalLiveInventory = reportProducts.reduce((sum, product) => sum + product.totalInventory, 0);
  const reportLocationTotals = orderedLocations.map(location => ({
    ...location,
    quantity: reportProducts.reduce((sum, product) => sum + locationQuantity(product, location.id), 0),
  }));
  const auditBreakdownColumns = `minmax(240px, 1fr) 90px 120px repeat(${Math.max(orderedLocations.length, 1)}, minmax(105px, 120px)) 120px`;
  const auditGroupLabel = auditGroupBy === 'vendor' ? 'Vendor' : 'Category';
  const topBreakdownRows = auditBreakdownRows.slice(0, 5);
  const focusedBreakdownLabel =
    focusedBreakdownId === 'all'
      ? `All ${auditGroupBy === 'vendor' ? 'vendors' : 'categories'}`
      : scopeSelectRows.find(row => row.id === focusedBreakdownId)?.name || focusedBreakdownId;
  const auditLocationLabel =
    auditLocationScope === 'all'
      ? 'All locations'
      : locationDisplayName(orderedLocations.find(location => location.id === auditLocationScope) || { id: auditLocationScope, name: auditLocationScope });
  const selectedAuditScope = useMemo<CatalogAuditScope | null>(() => {
    if (auditScopeMode === 'full') return null;
    if (auditScopeMode === 'vendor' || auditScopeMode === 'category') {
      if (focusedBreakdownId === 'all') return null;
      return { type: auditScopeMode, id: focusedBreakdownId };
    }
    if (auditScopeMode === 'item') {
      const query = itemScopeQuery.trim();
      return query ? { type: 'item', id: query } : null;
    }
    const barcodes = barcodeScopeText
      .split(/[\s,;]+/)
      .map(value => value.trim())
      .filter(Boolean)
      .join('\n');
    return barcodes ? { type: 'barcode', id: barcodes } : null;
  }, [auditScopeMode, barcodeScopeText, focusedBreakdownId, itemScopeQuery]);
  const auditScopeLabel =
    auditScopeMode === 'full'
      ? 'Full catalog'
      : auditScopeMode === 'vendor' || auditScopeMode === 'category'
        ? focusedBreakdownLabel
        : auditScopeMode === 'item'
          ? itemScopeQuery.trim() || 'Item search required'
          : `${barcodeScopeText.split(/[\s,;]+/).filter(Boolean).length} barcodes`;
  const auditRunBlocked =
    (auditScopeMode === 'item' && !itemScopeQuery.trim()) ||
    (auditScopeMode === 'barcode' && barcodeScopeText.split(/[\s,;]+/).filter(Boolean).length === 0);
  const reportDateSlug = new Date().toISOString().split('T')[0];

  const runAudit = async () => {
    if (auditRunBlocked) {
      toast.error(auditScopeMode === 'item' ? 'Enter an item search before running the audit' : 'Add at least one barcode before running the audit');
      return;
    }

    const selectedAuditTarget = auditTarget;
    const selectedAuditScopeName = auditScopeMode === 'full' ? null : auditScopeLabel;
    setAuditing(true);
    setError(null);
    setAuditRunByTarget(previous => ({ ...previous, [selectedAuditTarget]: true }));
    setAuditProductsByTarget(previous => ({ ...previous, [selectedAuditTarget]: [] }));
    setLocations([]);
    setPages(0);

    const allProducts: CatalogAuditProduct[] = [];
    const locationsById = new Map<string, CatalogAuditLocation>();
    let cursor: string | null = null;
    let pageCount = 0;
    const maxPages = auditPageLimit === 'all' ? Number.POSITIVE_INFINITY : Number(auditPageLimit);

    try {
      do {
        const data = await squarePrices.audit(cursor, 150, selectedAuditScope || undefined);
        pageCount += 1;
        allProducts.push(...data.products);
        for (const location of data.locations || []) locationsById.set(location.id, location);
        setAuditProductsByTarget(previous => ({ ...previous, [selectedAuditTarget]: [...allProducts] }));
        setLocations([...locationsById.values()]);
        setPages(pageCount);
        cursor = data.cursor || null;
      } while (cursor && pageCount < maxPages);

      setLastRefreshByTarget(previous => ({ ...previous, [selectedAuditTarget]: new Date() }));
      const scopeSuffix = selectedAuditScopeName ? ` for ${selectedAuditScopeName}` : '';
      if (cursor) {
        toast.warning(`${AUDIT_TARGET_LABELS[selectedAuditTarget]} partial audit loaded${scopeSuffix}: ${pageCount} page${pageCount === 1 ? '' : 's'}`);
      } else {
        toast.success(`${AUDIT_TARGET_LABELS[selectedAuditTarget]} audit complete${scopeSuffix}`);
      }
    } catch (err) {
      const message = getErrorMessage(err, 'Inventory audit failed');
      setError(message);
      toast.error(message);
    } finally {
      setAuditing(false);
    }
  };

  const buildCsv = () => {
    const rows = [
      [
        'Product',
        'Vendor',
        'Category',
        'Barcode',
        'SKU',
        'UPC',
        'Variation ID',
        'Price',
        'Total live inventory',
        'Missing price',
        'Missing SKU',
        'Enabled locations',
        'Missing locations',
        ...orderedLocations.map(location => `${locationDisplayName(location)} inventory`),
      ],
      ...products.map(product => [
        product.name,
        productVendor(product),
        categoryLabel(product),
        productBarcode(product),
        product.sku || '',
        product.upc || '',
        product.variationId,
        product.currentPrice == null ? '' : formatMoney(product.currentPrice, product.currency),
        formatQuantity(product.totalInventory),
        product.currentPrice == null ? 'Yes' : 'No',
        product.sku?.trim() ? 'No' : 'Yes',
        enabledLocationLabel(product, orderedLocations),
        missingLocationLabel(product, orderedLocations),
        ...orderedLocations.map(location => formatQuantity(locationQuantity(product, location.id))),
      ]),
    ];

    return rows.map(row => row.map(csvEscape).join(',')).join('\n');
  };

  const exportCsv = () => {
    const csv = buildCsv();
    const blob = new Blob([csv], { type: 'text/csv' });
    downloadBlob(blob, `square-catalog-audit-${reportDateSlug}.csv`);
    toast.success('CSV ready');
  };

  const printMissingPriceBarcodes = () => {
    if (missingPricePrintable.length === 0) {
      toast.error(hasRun ? 'No missing price items match this search' : 'Run the live audit before printing');
      return;
    }

    const generatedAt = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    const locationHeaders = orderedLocations
      .map(location => `<th>${escapeHtml(locationDisplayName(location))}</th>`)
      .join('');
    const rows = missingPricePrintable
      .map((product, index) => {
        const locationCells = orderedLocations
          .map(location => `<td>${escapeHtml(formatQuantity(locationQuantity(product, location.id)))}</td>`)
          .join('');
        return `
          <tr>
            <td>${index + 1}</td>
            <td class="name">
              <strong>${escapeHtml(product.name)}</strong>
              <span>${escapeHtml(productVendor(product))} / ${escapeHtml(categoryLabel(product))}</span>
            </td>
            <td class="barcode">${escapeHtml(productBarcode(product))}</td>
            <td>${escapeHtml(product.sku || '-')}</td>
            <td>${escapeHtml(product.upc || '-')}</td>
            ${locationCells}
            <td class="check"></td>
          </tr>
        `;
      })
      .join('');
    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Missing Price Barcode List</title>
          <style>
            @page { size: letter landscape; margin: 0.35in; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              color: #0f172a;
              font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              background: #fff;
            }
            header {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 24px;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 14px;
              margin-bottom: 16px;
            }
            h1 { margin: 0; font-size: 24px; }
            .meta { color: #475569; font-size: 12px; line-height: 1.5; text-align: right; }
            .note {
              margin: 0 0 14px;
              border: 1px solid #fed7aa;
              background: #fff7ed;
              color: #9a3412;
              padding: 10px 12px;
              font-size: 12px;
              font-weight: 700;
            }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th {
              background: #0f172a;
              color: #fff;
              padding: 7px 8px;
              text-align: left;
              text-transform: uppercase;
              letter-spacing: .04em;
              font-size: 9px;
            }
            td { border-bottom: 1px solid #e2e8f0; padding: 7px 8px; vertical-align: middle; }
            td:not(.name) { text-align: right; }
            .name span { display: block; margin-top: 3px; color: #64748b; font-size: 10px; }
            .barcode {
              min-width: 150px;
              color: #111827;
              font-family: "Courier New", ui-monospace, monospace;
              font-size: 16px;
              font-weight: 800;
              letter-spacing: .06em;
              text-align: center !important;
            }
            .check {
              width: 34px;
              border-left: 1px solid #e2e8f0;
            }
            .check::after {
              content: "";
              display: block;
              width: 18px;
              height: 18px;
              margin-left: auto;
              border: 2px solid #94a3b8;
              border-radius: 3px;
            }
          </style>
        </head>
        <body>
          <header>
            <div>
              <h1>Missing Price Barcode List</h1>
              <div>Ready-to-print checklist for items that need a price in Square.</div>
            </div>
            <div class="meta">
              Generated: ${escapeHtml(generatedAt)}<br />
              Items: ${escapeHtml(missingPricePrintable.length)}<br />
              Search filter: ${escapeHtml(issueSearch.trim() || 'None')}
            </div>
          </header>
          <p class="note">Use the barcode/UPC column to find each item and add the missing price. Check the box after each item is fixed.</p>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th>Barcode / UPC</th>
                <th>SKU</th>
                <th>UPC</th>
                ${locationHeaders}
                <th>Done</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `;

    const reportWindow = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900');
    if (!reportWindow) {
      toast.error('Allow popups to print the missing price list');
      return;
    }
    reportWindow.document.open();
    reportWindow.document.write(html);
    reportWindow.document.close();
    window.setTimeout(() => reportWindow.print(), 350);
  };

  const printCustomAuditReport = () => {
    if (products.length === 0) {
      toast.error('Run the live audit before printing a report');
      return;
    }

    const generatedAt = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    const locationHeader = orderedLocations
      .map(location => `<th>${escapeHtml(locationDisplayName(location))}</th>`)
      .join('');
    const locationTotalCells = orderedLocations
      .map(location => `<td>${escapeHtml(formatQuantity(reportLocationTotals.find(row => row.id === location.id)?.quantity || 0))}</td>`)
      .join('');
    const breakdownRowsHtml = auditBreakdownRows
      .map(row => {
        const locationCells = orderedLocations
          .map(location => `<td>${escapeHtml(formatQuantity(row.byLocation[location.id] || 0))}</td>`)
          .join('');
        return `
          <tr>
            <td class="name">${escapeHtml(row.name)}</td>
            <td>${escapeHtml(row.itemCount)}</td>
            <td>${escapeHtml(formatQuantity(row.totalInventory))}</td>
            ${locationCells}
            <td>${escapeHtml(row.missingPrice)}</td>
            <td>${escapeHtml(row.missingSku)}</td>
          </tr>
        `;
      })
      .join('');
    const topRowsHtml = topBreakdownRows
      .map((row, index) => `
        <tr>
          <td>${index + 1}</td>
          <td class="name">${escapeHtml(row.name)}</td>
          <td>${escapeHtml(row.itemCount)}</td>
          <td>${escapeHtml(formatQuantity(row.totalInventory))}</td>
        </tr>
      `)
      .join('');
    const missingPriceRows = reportMissingPrice.slice(0, 20).map(product => `
      <tr>
        <td class="name">${escapeHtml(product.name)}</td>
        <td>${escapeHtml(productVendor(product))}</td>
        <td>${escapeHtml(categoryLabel(product))}</td>
        <td>${escapeHtml(productBarcode(product))}</td>
        <td>${escapeHtml(product.sku || '-')}</td>
      </tr>
    `).join('');
    const missingSkuRows = reportMissingSku.slice(0, 20).map(product => `
      <tr>
        <td class="name">${escapeHtml(product.name)}</td>
        <td>${escapeHtml(productVendor(product))}</td>
        <td>${escapeHtml(categoryLabel(product))}</td>
        <td>${escapeHtml(formatMoney(product.currentPrice, product.currency))}</td>
      </tr>
    `).join('');

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Inventory Executive Summary</title>
          <style>
            @page { size: letter landscape; margin: 0.45in; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              color: #0f172a;
              font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              background: #f8fafc;
            }
            .page {
              min-height: 100vh;
              padding: 28px;
              background: #fff;
            }
            .header {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 24px;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 18px;
              margin-bottom: 18px;
            }
            .brand { font-size: 13px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #475569; }
            h1 { margin: 6px 0 0; font-size: 30px; line-height: 1.05; }
            h2 { margin: 22px 0 10px; font-size: 15px; text-transform: uppercase; letter-spacing: .06em; color: #334155; }
            .meta { text-align: right; font-size: 12px; color: #475569; line-height: 1.55; }
            .kpis {
              display: grid;
              grid-template-columns: repeat(6, 1fr);
              gap: 10px;
              margin-bottom: 18px;
            }
            .kpi {
              border: 1px solid #dbe3ec;
              border-radius: 10px;
              padding: 12px;
              background: #f8fafc;
            }
            .kpi strong { display: block; font-size: 21px; line-height: 1; }
            .kpi span { display: block; margin-top: 6px; font-size: 11px; color: #64748b; font-weight: 700; }
            .summary {
              display: grid;
              grid-template-columns: 1.1fr .9fr;
              gap: 16px;
              margin-bottom: 16px;
            }
            .panel {
              border: 1px solid #dbe3ec;
              border-radius: 12px;
              padding: 14px;
              background: #fff;
            }
            .panel p { margin: 0 0 8px; font-size: 13px; color: #334155; line-height: 1.45; }
            table {
              width: 100%;
              border-collapse: collapse;
              background: #fff;
              page-break-inside: auto;
            }
            th, td {
              border-bottom: 1px solid #e2e8f0;
              padding: 7px 8px;
              text-align: right;
              font-size: 11px;
              vertical-align: top;
            }
            th {
              background: #0f172a;
              color: #fff;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: .04em;
            }
            td.name, th:first-child, td:first-child { text-align: left; }
            tr { page-break-inside: avoid; }
            .issue-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 16px;
            }
            .muted { color: #64748b; }
            .footer {
              margin-top: 24px;
              padding-top: 10px;
              border-top: 1px solid #e2e8f0;
              color: #64748b;
              font-size: 10px;
            }
            @media print {
              body { background: #fff; }
              .page { padding: 0; }
            }
          </style>
        </head>
        <body>
          <main class="page">
            <section class="header">
              <div>
                <div class="brand">All Zentro Solutions</div>
                <h1>Inventory Executive Summary</h1>
              </div>
              <div class="meta">
                <div>Generated: ${escapeHtml(generatedAt)}</div>
                <div>Last audit refresh: ${escapeHtml(lastRefreshLabel)}</div>
                <div>Breakdown: ${escapeHtml(auditGroupLabel)}</div>
                <div>Scope: ${escapeHtml(focusedBreakdownLabel)}</div>
                <div>Rows in report: ${escapeHtml(auditBreakdownRows.length)}</div>
              </div>
            </section>

            <section class="kpis">
              <div class="kpi"><strong>${escapeHtml(reportProducts.length)}</strong><span>Catalog rows</span></div>
              <div class="kpi"><strong>${escapeHtml(formatQuantity(reportTotalLiveInventory))}</strong><span>Live inventory units</span></div>
              <div class="kpi"><strong>${escapeHtml(vendorSummaries.length)}</strong><span>Vendors</span></div>
              <div class="kpi"><strong>${escapeHtml(categorySummaries.length)}</strong><span>Categories</span></div>
              <div class="kpi"><strong>${escapeHtml(reportMissingPrice.length)}</strong><span>Missing price</span></div>
              <div class="kpi"><strong>${escapeHtml(reportMissingSku.length)}</strong><span>Missing SKU</span></div>
            </section>

            <section class="summary">
              <div class="panel">
                <h2>Executive view</h2>
                <p>The current audit found <strong>${escapeHtml(formatQuantity(reportTotalLiveInventory))}</strong> live inventory units across <strong>${escapeHtml(orderedLocations.length)}</strong> locations for <strong>${escapeHtml(focusedBreakdownLabel)}</strong>.</p>
                <p>The largest ${escapeHtml(auditGroupLabel.toLowerCase())} by live inventory is <strong>${escapeHtml(topBreakdownRows[0]?.name || 'N/A')}</strong>.</p>
                <p>Operational issues currently flagged: <strong>${escapeHtml(reportMissingPrice.length)}</strong> items missing price and <strong>${escapeHtml(reportMissingSku.length)}</strong> items missing SKU.</p>
              </div>
              <div class="panel">
                <h2>Inventory by location</h2>
                <table>
                  <thead><tr><th>Metric</th>${locationHeader}</tr></thead>
                  <tbody><tr><td class="name">Live inventory</td>${locationTotalCells}</tr></tbody>
                </table>
              </div>
            </section>

            <section>
              <h2>Top ${escapeHtml(auditGroupLabel.toLowerCase())} inventory groups</h2>
              <table>
                <thead><tr><th>Rank</th><th>${escapeHtml(auditGroupLabel)}</th><th>Items</th><th>Live inventory</th></tr></thead>
                <tbody>${topRowsHtml}</tbody>
              </table>
            </section>

            <section>
              <h2>Custom audit breakdown</h2>
              <table>
                <thead>
                  <tr>
                    <th>${escapeHtml(auditGroupLabel)}</th>
                    <th>Items</th>
                    <th>All locations</th>
                    ${locationHeader}
                    <th>No price</th>
                    <th>No SKU</th>
                  </tr>
                </thead>
                <tbody>${breakdownRowsHtml}</tbody>
              </table>
            </section>

            <section class="issue-grid">
              <div>
                <h2>Items missing price</h2>
                <table>
                  <thead><tr><th>Product</th><th>Vendor</th><th>Category</th><th>Barcode</th><th>SKU</th></tr></thead>
                  <tbody>${missingPriceRows || '<tr><td class="name" colspan="5">No missing prices found.</td></tr>'}</tbody>
                </table>
              </div>
              <div>
                <h2>Items missing SKU</h2>
                <table>
                  <thead><tr><th>Product</th><th>Vendor</th><th>Category</th><th>Price</th></tr></thead>
                  <tbody>${missingSkuRows || '<tr><td class="name" colspan="4">No missing SKUs found.</td></tr>'}</tbody>
                </table>
              </div>
            </section>

            <div class="footer">Generated from the Inventory Audit screen. Use the browser print dialog to save this executive report as a PDF.</div>
          </main>
        </body>
      </html>
    `;

    const reportWindow = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900');
    if (!reportWindow) {
      toast.error('Allow popups to open the PDF report');
      return;
    }
    reportWindow.document.open();
    reportWindow.document.write(html);
    reportWindow.document.close();
    reportWindow.focus();
    window.setTimeout(() => reportWindow.print(), 350);
  };

  const exportCustomAuditExcel = async () => {
    if (products.length === 0) {
      toast.error('Run the live audit before exporting Excel');
      return;
    }

    setExportingExcel(true);
    try {
      const ExcelJSRuntime = await import('exceljs');
      const workbook = new ExcelJSRuntime.default.Workbook();
      workbook.creator = 'All Zentro Solutions';
      workbook.created = new Date();

      const summary = workbook.addWorksheet('Executive Summary');
      summary.addRow(['Inventory Executive Summary']);
      summary.addRow(['Generated', new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })]);
      summary.addRow(['Last audit refresh', lastRefreshLabel]);
      summary.addRow(['Breakdown', auditGroupLabel]);
      summary.addRow(['Scope', focusedBreakdownLabel]);
      summary.addRow([]);
      summary.addRow(['Metric', 'Value']);
      summary.addRow(['Catalog rows', reportProducts.length]);
      summary.addRow(['Live inventory units', reportTotalLiveInventory]);
      summary.addRow(['Vendors', vendorSummaries.length]);
      summary.addRow(['Categories', categorySummaries.length]);
      summary.addRow(['Missing price', reportMissingPrice.length]);
      summary.addRow(['Missing SKU', reportMissingSku.length]);
      summary.addRow([]);
      summary.addRow(['Location', 'Live inventory']);
      for (const location of reportLocationTotals) {
        summary.addRow([locationDisplayName(location), location.quantity]);
      }

      const breakdown = workbook.addWorksheet('Custom Breakdown');
      breakdown.addRow([
        auditGroupLabel,
        'Items',
        'All locations',
        ...orderedLocations.map(locationDisplayName),
        'Missing price',
        'Missing SKU',
      ]);
      for (const row of auditBreakdownRows) {
        breakdown.addRow([
          row.name,
          row.itemCount,
          row.totalInventory,
          ...orderedLocations.map(location => row.byLocation[location.id] || 0),
          row.missingPrice,
          row.missingSku,
        ]);
      }

      const productsSheet = workbook.addWorksheet('Product Detail');
      productsSheet.addRow([
        'Product',
        'Vendor',
        'Category',
        'Barcode',
        'SKU',
        'UPC',
        'Variation ID',
        'Price',
        'Total live inventory',
        'Missing price',
        'Missing SKU',
        'Enabled locations',
        'Missing locations',
        ...orderedLocations.map(locationDisplayName),
      ]);
      for (const product of reportProducts) {
        productsSheet.addRow([
          product.name,
          productVendor(product),
          categoryLabel(product),
          productBarcode(product),
          product.sku || '',
          product.upc || '',
          product.variationId,
          product.currentPrice ?? '',
          product.totalInventory,
          product.currentPrice == null ? 'Yes' : 'No',
          product.sku?.trim() ? 'No' : 'Yes',
          enabledLocationLabel(product, orderedLocations),
          missingLocationLabel(product, orderedLocations),
          ...orderedLocations.map(location => locationQuantity(product, location.id)),
        ]);
      }

      const issues = workbook.addWorksheet('Issues');
      issues.addRow(['Issue', 'Product', 'Vendor', 'Category', 'Barcode', 'SKU', 'UPC', 'Price', 'Enabled locations', 'Missing locations']);
      for (const product of reportMissingPrice) {
        issues.addRow([
          'Missing price',
          product.name,
          productVendor(product),
          categoryLabel(product),
          productBarcode(product),
          product.sku || '',
          product.upc || '',
          '',
          enabledLocationLabel(product, orderedLocations),
          missingLocationLabel(product, orderedLocations),
        ]);
      }
      for (const product of reportMissingSku) {
        issues.addRow([
          'Missing SKU',
          product.name,
          productVendor(product),
          categoryLabel(product),
          productBarcode(product),
          '',
          product.upc || '',
          product.currentPrice ?? '',
          enabledLocationLabel(product, orderedLocations),
          missingLocationLabel(product, orderedLocations),
        ]);
      }

      const locationAvailability = workbook.addWorksheet('Location Availability');
      locationAvailability.addRow([
        'Product',
        'Vendor',
        'Category',
        'Barcode',
        'Enabled locations',
        'Missing locations',
        'Total live inventory',
        ...orderedLocations.map(locationDisplayName),
      ]);
      for (const product of locationLimitedProducts) {
        locationAvailability.addRow([
          product.name,
          productVendor(product),
          categoryLabel(product),
          productBarcode(product),
          enabledLocationLabel(product, orderedLocations),
          missingLocationLabel(product, orderedLocations),
          product.totalInventory,
          ...orderedLocations.map(location => locationQuantity(product, location.id)),
        ]);
      }

      for (const sheet of workbook.worksheets) {
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        sheet.columns.forEach(column => {
          column.width = Math.min(Math.max(column.header ? String(column.header).length + 4 : 14, 14), 36);
        });
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      downloadBlob(blob, `inventory-executive-audit-${auditGroupBy}-${reportDateSlug}.xlsx`);
      toast.success('Excel ready');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Excel export failed'));
    } finally {
      setExportingExcel(false);
    }
  };

  const exportAvailabilityExcel = async () => {
    const availabilityProducts = auditProductsByTarget.availability;
    if (availabilityProducts.length === 0) {
      toast.error('Run the Availability audit before exporting Excel');
      return;
    }

    setExportingExcel(true);
    try {
      const ExcelJSRuntime = await import('exceljs');
      const workbook = new ExcelJSRuntime.default.Workbook();
      workbook.creator = 'All Zentro Solutions';
      workbook.created = new Date();

      const availabilityLimited = availabilityProducts.filter(product => {
        if (orderedLocations.length <= 1 || product.presentAtAllLocations !== false) return false;
        const enabledLocationCount = enabledLocationIdsFor(product, orderedLocations).length;
        return enabledLocationCount > 0 && enabledLocationCount < orderedLocations.length;
      });
      const oneLocationOnly = availabilityLimited.filter(product => enabledLocationIdsFor(product, orderedLocations).length === 1);

      const summary = workbook.addWorksheet('Availability Summary');
      summary.addRow(['Availability Audit']);
      summary.addRow(['Generated', new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })]);
      summary.addRow(['Last availability audit', lastRefreshByTarget.availability?.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' }) || 'No refresh yet']);
      summary.addRow([]);
      summary.addRow(['Metric', 'Value']);
      summary.addRow(['Catalog rows', availabilityProducts.length]);
      summary.addRow(['Location limited', availabilityLimited.length]);
      summary.addRow(['Enabled in one location', oneLocationOnly.length]);
      summary.addRow([]);
      summary.addRow(['Location', 'Only enabled here', 'Missing here', 'Enabled here']);
      for (const location of orderedLocations) {
        const onlyHere = oneLocationOnly.filter(product => singleEnabledLocation(product, orderedLocations)?.id === location.id).length;
        const missingHere = availabilityLimited.filter(product => !enabledLocationIdsFor(product, orderedLocations).includes(location.id)).length;
        const enabledHere = availabilityLimited.filter(product => enabledLocationIdsFor(product, orderedLocations).includes(location.id)).length;
        summary.addRow([locationDisplayName(location), onlyHere, missingHere, enabledHere]);
      }

      const addAvailabilityRows = (sheetName: string, rows: CatalogAuditProduct[]) => {
        const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
        sheet.addRow([
          'Product',
          'Vendor',
          'Category',
          'Barcode',
          'SKU',
          'UPC',
          'Price',
          'Enabled locations',
          'Missing locations',
          'Total live inventory',
          ...orderedLocations.map(locationDisplayName),
        ]);
        for (const product of rows) {
          sheet.addRow([
            product.name,
            productVendor(product),
            categoryLabel(product),
            productBarcode(product),
            product.sku || '',
            product.upc || '',
            product.currentPrice ?? '',
            enabledLocationLabel(product, orderedLocations),
            missingLocationLabel(product, orderedLocations),
            product.totalInventory,
            ...orderedLocations.map(location => locationQuantity(product, location.id)),
          ]);
        }
      };

      addAvailabilityRows('All Location Limited', availabilityLimited);
      addAvailabilityRows('Enabled One Location', oneLocationOnly);

      for (const location of orderedLocations) {
        const locationName = locationDisplayName(location);
        addAvailabilityRows(
          `${locationName} Only Enabled`,
          oneLocationOnly.filter(product => singleEnabledLocation(product, orderedLocations)?.id === location.id)
        );
        addAvailabilityRows(
          `${locationName} Missing`,
          availabilityLimited.filter(product => !enabledLocationIdsFor(product, orderedLocations).includes(location.id))
        );
      }

      for (const sheet of workbook.worksheets) {
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        sheet.columns.forEach(column => {
          column.width = Math.min(Math.max(column.header ? String(column.header).length + 4 : 14, 14), 38);
        });
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      downloadBlob(blob, `availability-audit-${reportDateSlug}.xlsx`);
      toast.success('Availability Excel ready');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Availability Excel export failed'));
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory Audit</h1>
          <div className="mt-1 text-sm text-muted-foreground">
            {auditTargetLabel} audit / {auditScopeLabel} / {auditLocationLabel}
          </div>
        </div>
        <Badge variant="outline" className="w-fit rounded-full px-3 py-1">
          {hasRun ? `${auditTargetLabel}: ${products.length} rows loaded` : `${auditTargetLabel}: no audit run yet`}
        </Badge>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <SearchCheck className="h-4 w-4 text-primary" />
            Audit setup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-muted-foreground">Audit target</label>
            <div className="grid gap-2 sm:grid-cols-3">
              {(['breakdown', 'issues', 'availability'] as AuditTarget[]).map(target => {
                const active = auditTarget === target;
                return (
                  <button
                    key={target}
                    type="button"
                    onClick={() => setAuditTarget(target)}
                    disabled={auditing}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      active
                        ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-sm font-bold">{AUDIT_TARGET_LABELS[target]}</div>
                    <div className={`mt-0.5 text-[11px] ${active ? 'text-slate-200' : 'text-muted-foreground'}`}>
                      {auditRunByTarget[target] ? `${auditProductsByTarget[target].length} rows loaded` : 'Separate audit'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid gap-2 sm:grid-cols-5">
              {(['full', 'vendor', 'category', 'item', 'barcode'] as AuditScopeMode[]).map(mode => {
                const label = mode === 'full' ? 'Full Catalog' : mode === 'barcode' ? 'Barcode List' : mode[0].toUpperCase() + mode.slice(1);
                const active = auditScopeMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setAuditScopeMode(mode);
                      if (mode === 'vendor' || mode === 'category') setAuditGroupBy(mode);
                      if (mode === 'full') setAuditPageLimit('all');
                    }}
                    disabled={auditing}
                    className={`min-h-[68px] rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      active
                        ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-sm font-bold">{label}</div>
                    <div className={`mt-0.5 text-[11px] ${active ? 'text-slate-200' : 'text-muted-foreground'}`}>
                      {mode === 'full' && 'All items'}
                      {mode === 'vendor' && 'One supplier'}
                      {mode === 'category' && 'One category'}
                      {mode === 'item' && 'Name or SKU'}
                      {mode === 'barcode' && 'Paste list'}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Location</label>
                <select
                  value={auditLocationScope}
                  onChange={event => setAuditLocationScope(event.target.value)}
                  disabled={auditing}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="all">All locations</option>
                  {orderedLocations.map(location => (
                    <option key={location.id} value={location.id}>
                      {locationDisplayName(location)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Run size</label>
                <select
                  value={auditPageLimit}
                  onChange={event => setAuditPageLimit(event.target.value as AuditPageLimit)}
                  disabled={auditing}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="1">Test: 1 page</option>
                  <option value="5">Test: 5 pages</option>
                  <option value="20">Deep: 20 pages</option>
                  <option value="all">Full catalog</option>
                </select>
              </div>
            </div>
          </div>

          {(auditScopeMode === 'vendor' || auditScopeMode === 'category') && (
            <select
              value={focusedBreakdownId}
              onChange={event => setFocusedBreakdownId(event.target.value)}
              disabled={auditing || loadingScopes}
              className="h-10 w-full max-w-[460px] rounded-md border border-input bg-background px-3 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="all">
                {loadingScopes ? 'Loading...' : `All ${auditScopeMode === 'vendor' ? 'vendors' : 'categories'}`}
              </option>
              {scopeSelectRows.map(row => (
                <option key={row.id} value={row.id}>
                  {row.name} ({row.itemCount})
                </option>
              ))}
            </select>
          )}

          {auditScopeMode === 'item' && (
            <Input
              value={itemScopeQuery}
              onChange={event => setItemScopeQuery(event.target.value)}
              disabled={auditing}
              placeholder="Search item name, SKU, UPC, item ID"
              className="h-10 max-w-[460px]"
            />
          )}

          {auditScopeMode === 'barcode' && (
            <Textarea
              value={barcodeScopeText}
              onChange={event => setBarcodeScopeText(event.target.value)}
              disabled={auditing}
              placeholder="Paste one barcode per line"
              className="min-h-20 max-w-[560px]"
            />
          )}

          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Button onClick={runAudit} disabled={auditing || auditRunBlocked} className="gap-1.5">
              {auditing ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchCheck className="h-4 w-4" />}
              {auditing ? `Reading page ${pages + 1}` : hasRun ? `Refresh ${auditTargetLabel}` : `Run ${auditTargetLabel}`}
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={auditing || products.length === 0} className="gap-1.5">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <div className="text-sm text-muted-foreground">
              Target: <span className="font-medium text-slate-950">{auditTargetLabel}</span>
              <span className="px-1">/</span>
              Scope: <span className="font-medium text-slate-950">{auditScopeLabel}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {(hasRun || auditing || products.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Package} label="catalog rows checked" value={products.length} />
          <StatCard icon={Boxes} label="live inventory units" value={formatQuantity(totalLiveInventory)} tone="emerald" />
          <StatCard icon={AlertTriangle} label="issues" value={missingPrice.length + missingSku.length} tone="amber" />
          <StatCard icon={Building2} label="location limited" value={locationLimitedProducts.length} tone="amber" />
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1 rounded-lg border bg-white p-1 shadow-sm">
          <TabsTrigger className="min-h-9 rounded-md px-3" value="overview">Overview</TabsTrigger>
          <TabsTrigger className="min-h-9 rounded-md px-3" value="breakdown" onClick={() => setAuditTarget('breakdown')}>Breakdown</TabsTrigger>
          <TabsTrigger className="min-h-9 rounded-md px-3" value="issues" onClick={() => setAuditTarget('issues')}>Issues</TabsTrigger>
          <TabsTrigger className="min-h-9 rounded-md px-3" value="availability" onClick={() => setAuditTarget('availability')}>Availability</TabsTrigger>
          <TabsTrigger className="min-h-9 rounded-md px-3" value="exports">Exports</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-700" />
              Lowest inventory items
              <Badge variant="secondary">{lowStockRows.length}</Badge>
            </CardTitle>
            {products.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:flex 2xl:items-center">
                <select
                  value={lowStockLocationId}
                  onChange={event => setLowStockLocationId(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                >
                  <option value="all">All locations</option>
                  {orderedLocations.map(location => (
                    <option key={location.id} value={location.id}>
                      {locationDisplayName(location)}
                    </option>
                  ))}
                </select>
                <select
                  value={lowStockLimit}
                  onChange={event => setLowStockLimit(event.target.value as LowStockLimit)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                >
                  <option value="all">Any quantity</option>
                  <option value="0">0 or less</option>
                  <option value="5">5 or less</option>
                  <option value="10">10 or less</option>
                  <option value="25">25 or less</option>
                  <option value="50">50 or less</option>
                </select>
                <select
                  value={lowStockMode}
                  onChange={event => setLowStockMode(event.target.value as LowStockMode)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                >
                  <option value="all">All low stock</option>
                  <option value="out">Out / negative only</option>
                  <option value="positive">Positive stock only</option>
                </select>
                <select
                  value={lowStockVendor}
                  onChange={event => setLowStockVendor(event.target.value)}
                  className="h-9 min-w-[180px] rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                >
                  <option value="all">All vendors</option>
                  {vendorSummaries.map(vendor => (
                    <option key={vendor.vendorName} value={vendor.vendorName}>
                      {vendor.vendorName}
                    </option>
                  ))}
                </select>
                <select
                  value={lowStockCategory}
                  onChange={event => setLowStockCategory(event.target.value)}
                  className="h-9 min-w-[180px] rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                >
                  <option value="all">All categories</option>
                  {categorySummaries.map(category => (
                    <option key={category.key} value={category.key}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <div className="relative sm:col-span-2 lg:col-span-1 2xl:w-60">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={lowStockSearch}
                    onChange={event => setLowStockSearch(event.target.value)}
                    placeholder="Search item"
                    className="h-9 pl-8"
                  />
                </div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {auditing ? 'Reading Square catalog...' : 'Run the live audit to see lowest inventory items.'}
            </div>
          ) : lowStockRows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No items match these filters.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <div className="grid min-w-[920px] grid-cols-[minmax(280px,1fr)_180px_180px_110px_250px] gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                <div>Item</div>
                <div>Vendor</div>
                <div>Category</div>
                <div className="text-right">{lowStockLocationName}</div>
                <div className="text-right">Store breakdown</div>
              </div>
              <div className="max-h-[520px] divide-y overflow-auto">
                {lowStockRows.map(({ product, quantity }) => (
                  <div
                    key={product.variationId}
                    className="grid min-w-[920px] grid-cols-[minmax(280px,1fr)_180px_180px_110px_250px] gap-3 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-950">{product.name}</div>
                      <div className="truncate font-mono text-xs text-muted-foreground">
                        SKU: {product.sku || '-'} | UPC: {product.upc || '-'}
                      </div>
                    </div>
                    <div className="truncate font-medium">{productVendor(product)}</div>
                    <div className="truncate text-muted-foreground">{categoryLabel(product)}</div>
                    <div className={`text-right text-base font-bold ${inventoryTone(quantity)}`}>
                      {formatQuantity(quantity)}
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {orderedLocations.map(location => (
                        <Badge key={location.id} variant="outline" className="text-[10px]">
                          {locationDisplayName(location)}: {formatQuantity(locationQuantity(product, location.id))}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

        </TabsContent>

        <TabsContent value="breakdown" className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <SearchCheck className="h-4 w-4 text-primary" />
              Custom audit breakdown
            </CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="inline-flex h-10 items-center rounded-lg border bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => {
                    setAuditGroupBy('vendor');
                    setFocusedBreakdownId('all');
                  }}
                  className={`h-8 rounded-md px-3 text-sm font-semibold transition-colors ${
                    auditGroupBy === 'vendor'
                      ? 'bg-slate-950 text-white shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-slate-950'
                  }`}
                >
                  Vendor
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuditGroupBy('category');
                    setFocusedBreakdownId('all');
                  }}
                  className={`h-8 rounded-md px-3 text-sm font-semibold transition-colors ${
                    auditGroupBy === 'category'
                      ? 'bg-slate-950 text-white shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-slate-950'
                  }`}
                >
                  Category
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={printCustomAuditReport}
                  disabled={auditing || products.length === 0}
                  className="h-10 gap-1.5"
                >
                  <FileText className="h-4 w-4" />
                  Executive PDF
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void exportCustomAuditExcel()}
                  disabled={auditing || exportingExcel || products.length === 0}
                  className="h-10 gap-1.5"
                >
                  {exportingExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                  Excel
                </Button>
              </div>
              <select
                value={focusedBreakdownId}
                onChange={event => setFocusedBreakdownId(event.target.value)}
                disabled={auditing || loadingScopes}
                className="h-10 min-w-[190px] rounded-md border border-input bg-background px-3 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="all">
                  {loadingScopes ? 'Loading...' : `All ${auditGroupBy === 'vendor' ? 'vendors' : 'categories'}`}
                </option>
                {scopeSelectRows.map(row => (
                  <option key={row.id} value={row.id}>
                    {row.name} ({row.itemCount})
                  </option>
                ))}
              </select>
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={breakdownSearch}
                  onChange={event => setBreakdownSearch(event.target.value)}
                  placeholder={auditGroupBy === 'vendor' ? 'Search vendor' : 'Search category'}
                  className="h-9 pl-8"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {auditing
                ? 'Reading Square catalog...'
                : focusedBreakdownId === 'all'
                  ? 'Run the live audit to customize inventory by vendor or category.'
                  : `Run the live audit for ${focusedBreakdownLabel}.`}
            </div>
          ) : auditBreakdownRows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No {auditGroupBy === 'vendor' ? 'vendors' : 'categories'} match that search.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <div
                className="grid gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground"
                style={{ gridTemplateColumns: auditBreakdownColumns }}
              >
                <div>{auditGroupBy === 'vendor' ? 'Vendor' : 'Category'}</div>
                <div className="text-right">Items</div>
                <div className="text-right">All locations</div>
                {orderedLocations.length > 0 ? (
                  orderedLocations.map(location => (
                    <div key={location.id} className="text-right">
                      {locationDisplayName(location)}
                    </div>
                  ))
                ) : (
                  <div className="text-right">Location</div>
                )}
                <div className="text-right">Issues</div>
              </div>
              <div className="max-h-[520px] divide-y overflow-auto">
                {auditBreakdownRows.map(row => (
                  <div
                    key={row.id}
                    className="grid gap-3 px-3 py-2 text-sm"
                    style={{ gridTemplateColumns: auditBreakdownColumns }}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-950">{row.name}</div>
                    </div>
                    <div className="text-right font-medium">{row.itemCount}</div>
                    <div className="text-right font-bold text-emerald-700">{formatQuantity(row.totalInventory)}</div>
                    {orderedLocations.length > 0 ? (
                      orderedLocations.map(location => (
                        <div key={location.id} className="text-right font-medium">
                          {formatQuantity(row.byLocation[location.id] || 0)}
                        </div>
                      ))
                    ) : (
                      <div className="text-right text-muted-foreground">-</div>
                    )}
                    <div className="text-right text-xs text-muted-foreground">
                      {row.missingPrice > 0 && <div>{row.missingPrice} no price</div>}
                      {row.missingSku > 0 && <div>{row.missingSku} no SKU</div>}
                      {row.missingPrice === 0 && row.missingSku === 0 && <div>-</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Boxes className="h-4 w-4 text-emerald-700" />
                Inventory by category
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Last refresh: {lastRefreshLabel}</Badge>
                <select
                  value={selectedLocationId}
                  onChange={event => setSelectedLocationId(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                >
                  <option value="all">All locations</option>
                  {orderedLocations.map(location => (
                    <option key={location.id} value={location.id}>
                      {locationDisplayName(location)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {products.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {auditing ? 'Reading Square catalog...' : 'Run the live audit to load category inventory.'}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <div className="grid min-w-[620px] grid-cols-[minmax(0,1fr)_100px_130px_120px] gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                  <div>Category</div>
                  <div className="text-right">Items</div>
                  <div className="text-right">{selectedLocationName}</div>
                  <div className="text-right">Issues</div>
                </div>
                <div className="max-h-[680px] divide-y overflow-auto">
                  {categorySummaries.map(category => {
                    const inventory =
                      selectedLocationId === 'all'
                        ? category.totalInventory
                        : category.byLocation[selectedLocationId] || 0;
                    return (
                      <div
                        key={category.key}
                        className="grid min-w-[620px] grid-cols-[minmax(0,1fr)_100px_130px_120px] gap-3 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-950">{category.name}</div>
                          {selectedLocationId === 'all' && orderedLocations.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {locationTotals
                                .filter(location => (category.byLocation[location.id] || 0) > 0)
                                .slice(0, 4)
                                .map(location => (
                                  <Badge key={location.id} variant="outline" className="text-[10px]">
                                    {locationDisplayName(location)}: {formatQuantity(category.byLocation[location.id] || 0)}
                                  </Badge>
                                ))}
                            </div>
                          )}
                        </div>
                        <div className="text-right font-medium">{category.itemCount}</div>
                        <div className="text-right font-bold text-emerald-700">{formatQuantity(inventory)}</div>
                        <div className="text-right text-xs text-muted-foreground">
                          {category.missingPrice > 0 && <div>{category.missingPrice} no price</div>}
                          {category.missingSku > 0 && <div>{category.missingSku} no SKU</div>}
                          {category.missingPrice === 0 && category.missingSku === 0 && <div>-</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-sky-700" />
                Top 5 vendors by items
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topVendors.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No vendor data yet.</div>
              ) : (
                <div className="space-y-2">
                  {topVendors.map((vendor, index) => (
                    <div key={vendor.vendorName} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{index + 1}. {vendor.vendorName}</div>
                          <div className="text-xs text-muted-foreground">
                            {vendor.missingPrice} missing price - {vendor.missingSku} missing SKU
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold">{vendor.itemCount}</div>
                          <div className="text-xs text-muted-foreground">items</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Boxes className="h-4 w-4 text-emerald-700" />
                Inventory by location
              </CardTitle>
            </CardHeader>
            <CardContent>
              {orderedLocations.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No location data yet.</div>
              ) : (
                <div className="space-y-2">
                  <div className="rounded-lg border bg-emerald-50/60 p-3">
                    <div className="text-xs font-semibold uppercase text-emerald-700">All locations</div>
                    <div className="text-2xl font-bold text-emerald-800">{formatQuantity(totalLiveInventory)}</div>
                    <div className="text-xs text-muted-foreground">{productsWithLiveInventory} items with live inventory</div>
                  </div>
                  {locationTotals.map(location => (
                    <button
                      key={location.id}
                      type="button"
                      onClick={() => setSelectedLocationId(location.id)}
                      className="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted"
                    >
                      <span className="font-medium">{locationDisplayName(location)}</span>
                      <span className="font-bold text-emerald-700">{formatQuantity(location.quantity)}</span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

        </TabsContent>

        <TabsContent value="issues" className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <PackageX className="h-4 w-4 text-rose-700" />
                Items missing price
                <Badge variant="secondary">{missingPrice.length}</Badge>
              </CardTitle>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  variant="outline"
                  onClick={printMissingPriceBarcodes}
                  disabled={missingPricePrintable.length === 0}
                  className="h-9 gap-1.5"
                >
                  <FileText className="h-4 w-4" />
                  Print barcodes
                </Button>
                <div className="relative w-full sm:w-56">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={issueSearch}
                    onChange={event => setIssueSearch(event.target.value)}
                    placeholder="Search issues"
                    className="h-9 pl-8"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {missingPriceVisible.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {hasRun ? 'No missing prices found.' : 'No audit run yet.'}
              </div>
            ) : (
              <div className="max-h-[640px] divide-y overflow-auto rounded-lg border">
                {missingPriceVisible.map(product => (
                  <IssueRow key={product.variationId} product={product} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-700" />
              Items missing SKU
              <Badge variant="secondary">{missingSku.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {missingSkuVisible.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {hasRun ? 'No missing SKUs found.' : 'No audit run yet.'}
              </div>
            ) : (
              <div className="max-h-[640px] divide-y overflow-auto rounded-lg border">
                {missingSkuVisible.map(product => (
                  <IssueRow key={product.variationId} product={product} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
        </TabsContent>

        <TabsContent value="availability" className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-sky-700" />
                Availability lists by location
                <Badge variant="secondary">{availabilityLocationListRows.length}</Badge>
              </CardTitle>
              {products.length > 0 && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    value={availabilityLocationListId}
                    onChange={event => setAvailabilityLocationListId(event.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                  >
                    <option value="all">All locations</option>
                    {orderedLocations.map(location => (
                      <option key={location.id} value={location.id}>
                        {locationDisplayName(location)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={availabilityLocationListMode}
                    onChange={event => setAvailabilityLocationListMode(event.target.value as AvailabilityLocationListMode)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                  >
                    <option value="only">Only enabled here</option>
                    <option value="enabled">Enabled here</option>
                    <option value="missing">Missing here</option>
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void exportAvailabilityExcel()}
                    disabled={auditing || exportingExcel || auditProductsByTarget.availability.length === 0}
                    className="h-9 gap-1.5"
                  >
                    {exportingExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                    Availability Excel
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {products.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {hasRun ? 'No availability rows found.' : 'Run the Availability audit to see lists by location.'}
              </div>
            ) : availabilityLocationListRows.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No items match this availability list.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <div className="grid min-w-[980px] grid-cols-[minmax(280px,1fr)_180px_140px_170px_170px_220px] gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                  <div>Item</div>
                  <div>Vendor</div>
                  <div>Location status</div>
                  <div>Enabled</div>
                  <div>Missing locations</div>
                  <div className="text-right">Inventory</div>
                </div>
                <div className="max-h-[520px] divide-y overflow-auto">
                  {availabilityLocationListRows.map(product => {
                    const enabledLocationIds = enabledLocationIdsFor(product, orderedLocations);
                    const selectedLocation = orderedLocations.find(location => location.id === availabilityLocationListId);
                    const status =
                      availabilityLocationListId === 'all'
                        ? enabledLocationIds.length === 1
                          ? `Only ${enabledLocationLabel(product, orderedLocations)}`
                          : enabledLocationLabel(product, orderedLocations)
                        : enabledLocationIds.includes(availabilityLocationListId)
                          ? `Enabled in ${locationDisplayName(selectedLocation || { id: availabilityLocationListId, name: availabilityLocationListId })}`
                          : `Missing from ${locationDisplayName(selectedLocation || { id: availabilityLocationListId, name: availabilityLocationListId })}`;
                    return (
                      <div
                        key={product.variationId}
                        className="grid min-w-[980px] grid-cols-[minmax(280px,1fr)_180px_140px_170px_170px_220px] gap-3 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-950">{product.name}</div>
                          <div className="truncate font-mono text-xs text-muted-foreground">
                            SKU: {product.sku || '-'} | Barcode: {productBarcode(product)}
                          </div>
                        </div>
                        <div className="truncate font-medium">{productVendor(product)}</div>
                        <div className="truncate font-semibold text-sky-700">{status}</div>
                        <div className="truncate text-amber-700">{enabledLocationLabel(product, orderedLocations)}</div>
                        <div className="truncate text-muted-foreground">{missingLocationLabel(product, orderedLocations)}</div>
                        <div className="flex flex-wrap justify-end gap-1">
                          {orderedLocations.map(location => (
                            <Badge key={location.id} variant="outline" className="text-[10px]">
                              {locationDisplayName(location)}: {formatQuantity(locationQuantity(product, location.id))}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-amber-700" />
                Enabled in one location
                <Badge variant="secondary">{singleLocationProducts.length}</Badge>
              </CardTitle>
              {products.length > 0 && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    value={singleLocationFilter}
                    onChange={event => setSingleLocationFilter(event.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                  >
                    <option value="all">All one-location items</option>
                    {singleLocationCounts.map(location => (
                      <option key={location.id} value={location.id}>
                        {locationDisplayName(location)} ({location.count})
                      </option>
                    ))}
                  </select>
                  <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={singleLocationSearch}
                      onChange={event => setSingleLocationSearch(event.target.value)}
                      placeholder="Search item or vendor"
                      className="h-9 pl-8"
                    />
                  </div>
                </div>
              )}
            </div>
            {products.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                <Badge variant={singleLocationFilter === 'all' ? 'default' : 'outline'}>
                  All: {singleLocationProducts.length}
                </Badge>
                {singleLocationCounts.map(location => (
                  <Badge key={location.id} variant={singleLocationFilter === location.id ? 'default' : 'outline'}>
                    {locationDisplayName(location)}: {location.count}
                  </Badge>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {products.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {hasRun ? 'No one-location enabled items found.' : 'Run the live audit to see one-location enabled items.'}
              </div>
            ) : singleLocationVisible.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No items match this one-location filter.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <div className="grid min-w-[980px] grid-cols-[minmax(280px,1fr)_180px_130px_170px_130px_220px] gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                  <div>Item</div>
                  <div>Vendor</div>
                  <div>Only enabled in</div>
                  <div>Missing locations</div>
                  <div className="text-right">Price</div>
                  <div className="text-right">Inventory</div>
                </div>
                <div className="max-h-[520px] divide-y overflow-auto">
                  {singleLocationVisible.map(product => {
                    const enabledLocation = singleEnabledLocation(product, orderedLocations);
                    return (
                      <div
                        key={product.variationId}
                        className="grid min-w-[980px] grid-cols-[minmax(280px,1fr)_180px_130px_170px_130px_220px] gap-3 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-950">{product.name}</div>
                          <div className="truncate font-mono text-xs text-muted-foreground">
                            SKU: {product.sku || '-'} | Barcode: {productBarcode(product)}
                          </div>
                        </div>
                        <div className="truncate font-medium">{productVendor(product)}</div>
                        <div className="font-semibold text-amber-700">
                          {enabledLocation ? locationDisplayName(enabledLocation) : '-'}
                        </div>
                        <div className="truncate text-muted-foreground">{missingLocationLabel(product, orderedLocations)}</div>
                        <div className="text-right font-medium">{formatMoney(product.currentPrice, product.currency)}</div>
                        <div className="flex flex-wrap justify-end gap-1">
                          {orderedLocations.map(location => (
                            <Badge key={location.id} variant="outline" className="text-[10px]">
                              {locationDisplayName(location)}: {formatQuantity(locationQuantity(product, location.id))}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-amber-700" />
                Location availability
                <Badge variant="secondary">{locationLimitedProducts.length}</Badge>
                <Badge variant="outline">{singleLocationProducts.length} one location</Badge>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {locationLimitedVisible.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {hasRun ? 'All audited items are enabled in all audited locations.' : 'No audit run yet.'}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <div className="grid min-w-[920px] grid-cols-[minmax(260px,1fr)_170px_160px_180px_230px] gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                  <div>Item</div>
                  <div>Vendor</div>
                  <div>Enabled</div>
                  <div>Missing locations</div>
                  <div className="text-right">Inventory by location</div>
                </div>
                <div className="max-h-[460px] divide-y overflow-auto">
                  {locationLimitedVisible.map(product => (
                    <div
                      key={product.variationId}
                      className="grid min-w-[920px] grid-cols-[minmax(260px,1fr)_170px_160px_180px_230px] gap-3 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-950">{product.name}</div>
                        <div className="truncate font-mono text-xs text-muted-foreground">
                          Barcode: {productBarcode(product)}
                        </div>
                      </div>
                      <div className="truncate font-medium">{productVendor(product)}</div>
                      <div className="truncate text-amber-700">{enabledLocationLabel(product, orderedLocations)}</div>
                      <div className="truncate text-muted-foreground">{missingLocationLabel(product, orderedLocations)}</div>
                      <div className="flex flex-wrap justify-end gap-1">
                        {orderedLocations.map(location => (
                          <Badge key={location.id} variant="outline" className="text-[10px]">
                            {locationDisplayName(location)}: {formatQuantity(locationQuantity(product, location.id))}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        </TabsContent>

        <TabsContent value="exports" className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4 text-primary" />
            Export current audit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={auditing || products.length === 0} className="gap-1.5">
              <Download className="h-4 w-4" />
              CSV
            </Button>
            <Button variant="outline" onClick={printCustomAuditReport} disabled={auditing || products.length === 0} className="gap-1.5">
              <FileText className="h-4 w-4" />
              Executive PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => void exportCustomAuditExcel()}
              disabled={auditing || exportingExcel || products.length === 0}
              className="gap-1.5"
            >
              {exportingExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Detailed Excel
            </Button>
            <Button variant="outline" onClick={printMissingPriceBarcodes} disabled={missingPricePrintable.length === 0} className="gap-1.5">
              <FileText className="h-4 w-4" />
              Missing price barcodes
            </Button>
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            Exports use the current audit result and scope: {auditScopeLabel}.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-sky-700" />
            Vendor item counts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {vendorSummaries.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {auditing ? 'Reading vendors...' : 'Run the live audit to load vendors.'}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <div className="grid min-w-[680px] grid-cols-[minmax(0,1fr)_100px_110px_100px_120px] gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                <div>Vendor</div>
                <div className="text-right">Items</div>
                <div className="text-right">Inventory</div>
                <div className="text-right">No price</div>
                <div className="text-right">No SKU</div>
              </div>
              <div className="max-h-[640px] divide-y overflow-auto">
                {vendorSummaries.map(vendor => (
                  <div
                    key={vendor.vendorName}
                    className="grid min-w-[680px] grid-cols-[minmax(0,1fr)_100px_110px_100px_120px] gap-3 px-3 py-2 text-sm"
                  >
                    <div className="truncate font-semibold">{vendor.vendorName}</div>
                    <div className="text-right">{vendor.itemCount}</div>
                    <div className="text-right font-semibold text-emerald-700">{formatQuantity(vendor.totalInventory)}</div>
                    <div className="text-right text-rose-700">{vendor.missingPrice || '-'}</div>
                    <div className="text-right text-amber-700">{vendor.missingSku || '-'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>

      {auditing && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Audit is reading Square catalog and live inventory counts.
        </div>
      )}
    </div>
  );
}
