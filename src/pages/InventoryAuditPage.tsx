import { type ReactNode, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Download, Loader2, PackageX, RefreshCw, SearchCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  formatMoney,
  squarePrices,
  type CatalogAuditProduct,
} from '@/hooks/useSquarePrices';

type DuplicateGroup = {
  code: string;
  kind: 'SKU' | 'UPC/GTIN';
  severity: 'warning' | 'critical';
  differentPrices: boolean;
  crossItem: boolean;
  items: CatalogAuditProduct[];
};

type CategoryMovement = {
  id: string;
  name: string;
  total: number;
  moving: number;
  noMovement: number;
};

type SvgExportPreview = {
  filename: string;
  source: string;
  title: string;
};

type BarDatum = {
  color: string;
  label: string;
  value: number;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function csvEscape(value: string) {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function ProductLine({ product }: { product: CatalogAuditProduct }) {
  const categories = product.categories || [];
  const categoryLabel = categories.length
    ? categories.map(category => category.name).join(', ')
    : 'Uncategorized';

  return (
    <div className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_150px_120px] sm:items-center">
      <div className="min-w-0">
        <div className="truncate font-medium">{product.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {categoryLabel} · {product.variationId}
        </div>
      </div>
      <div className="space-y-0.5 font-mono text-xs text-muted-foreground sm:text-right">
        <div>SKU: {product.sku || '-'}</div>
        <div>UPC: {product.upc || '-'}</div>
      </div>
      <div className="font-medium sm:text-right">
        {formatMoney(product.currentPrice, product.currency)}
      </div>
    </div>
  );
}

function categoryNames(product: CatalogAuditProduct) {
  return product.categories?.map(category => category.name).join('; ') || 'Uncategorized';
}

function duplicateSeverity(items: CatalogAuditProduct[]) {
  const prices = new Set(items.map(item => `${item.currency}:${item.currentPrice ?? 'null'}`));
  const itemIds = new Set(items.map(item => item.itemId));
  const differentPrices = prices.size > 1;
  const crossItem = itemIds.size > 1;
  return {
    differentPrices,
    crossItem,
    severity: differentPrices || crossItem ? 'critical' : 'warning',
  } as const;
}

function duplicateGroupsFor(
  products: CatalogAuditProduct[],
  kind: DuplicateGroup['kind'],
  codeFor: (product: CatalogAuditProduct) => string | null | undefined
) {
  const byCode = new Map<string, CatalogAuditProduct[]>();

  for (const product of products) {
    const code = String(codeFor(product) || '').trim();
    if (!code) continue;
    const list = byCode.get(code) || [];
    list.push(product);
    byCode.set(code, list);
  }

  return [...byCode.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([code, items]) => ({
      code,
      kind,
      ...duplicateSeverity(items),
      items,
    }))
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
      return a.code.localeCompare(b.code);
    });
}

function truncateText(value: string, maxLength = 30) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function EmptyChartText({ label }: { label: string }) {
  return (
    <text x="260" y="122" textAnchor="middle" fill="#64748b" fontSize="15">
      {label}
    </text>
  );
}

function HorizontalBarChart({
  data,
  emptyLabel,
  id,
  title,
}: {
  data: BarDatum[];
  emptyLabel: string;
  id: string;
  title: string;
}) {
  const max = Math.max(1, ...data.map(row => row.value));
  return (
    <svg id={id} viewBox="0 0 520 240" role="img" aria-label={title} className="h-auto w-full">
      <rect width="520" height="240" rx="14" fill="#ffffff" />
      <text x="24" y="32" fill="#0f172a" fontSize="18" fontWeight="700">
        {title}
      </text>
      {data.length === 0 ? (
        <EmptyChartText label={emptyLabel} />
      ) : (
        data.map((row, index) => {
          const y = 58 + index * 39;
          const width = Math.max(6, Math.round((row.value / max) * 300));
          return (
            <g key={row.label}>
              <text x="24" y={y + 16} fill="#334155" fontSize="13">
                {truncateText(row.label, 28)}
              </text>
              <rect x="190" y={y} width="300" height="20" rx="10" fill="#e2e8f0" />
              <rect x="190" y={y} width={width} height="20" rx="10" fill={row.color} />
              <text x="500" y={y + 15} textAnchor="end" fill="#0f172a" fontSize="13" fontWeight="700">
                {row.value}
              </text>
            </g>
          );
        })
      )}
    </svg>
  );
}

function CategoryStackedChart({
  categories,
  id,
}: {
  categories: CategoryMovement[];
  id: string;
}) {
  const rows = categories.slice(0, 5);
  const max = Math.max(1, ...rows.map(row => row.total));
  return (
    <svg id={id} viewBox="0 0 520 260" role="img" aria-label="Category movement chart" className="h-auto w-full">
      <rect width="520" height="260" rx="14" fill="#ffffff" />
      <text x="24" y="32" fill="#0f172a" fontSize="18" fontWeight="700">
        Category movement
      </text>
      {rows.length === 0 ? (
        <EmptyChartText label="No category data" />
      ) : (
        rows.map((row, index) => {
          const y = 58 + index * 38;
          const totalWidth = Math.max(8, Math.round((row.total / max) * 300));
          const movingWidth = row.total > 0 ? Math.round((row.moving / row.total) * totalWidth) : 0;
          const noMovementWidth = Math.max(0, totalWidth - movingWidth);
          return (
            <g key={row.id}>
              <text x="24" y={y + 15} fill="#334155" fontSize="13">
                {truncateText(row.name, 27)}
              </text>
              <rect x="190" y={y} width="300" height="20" rx="10" fill="#e2e8f0" />
              {movingWidth > 0 && <rect x="190" y={y} width={movingWidth} height="20" rx="10" fill="#059669" />}
              {noMovementWidth > 0 && (
                <rect
                  x={190 + movingWidth}
                  y={y}
                  width={noMovementWidth}
                  height="20"
                  rx="10"
                  fill="#e11d48"
                />
              )}
              <text x="500" y={y + 15} textAnchor="end" fill="#0f172a" fontSize="13" fontWeight="700">
                {row.noMovement}/{row.total}
              </text>
            </g>
          );
        })
      )}
      <rect x="24" y="226" width="12" height="12" rx="3" fill="#059669" />
      <text x="42" y="236" fill="#64748b" fontSize="12">With movement</text>
      <rect x="158" y="226" width="12" height="12" rx="3" fill="#e11d48" />
      <text x="176" y="236" fill="#64748b" fontSize="12">No movement</text>
    </svg>
  );
}

function ChartCard({
  children,
  disabled,
  onDownload,
  title,
}: {
  children: ReactNode;
  disabled: boolean;
  onDownload: () => void;
  title: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
        <Button type="button" variant="outline" size="sm" onClick={onDownload} disabled={disabled} className="gap-1.5">
          <Download className="h-4 w-4" />
          SVG
        </Button>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function InventoryAuditPage() {
  const [products, setProducts] = useState<CatalogAuditProduct[]>([]);
  const [auditing, setAuditing] = useState(false);
  const [pages, setPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const [csvPreview, setCsvPreview] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const [svgPreview, setSvgPreview] = useState<SvgExportPreview | null>(null);

  const duplicateGroups = useMemo<DuplicateGroup[]>(() => {
    const duplicateSkuGroups = duplicateGroupsFor(products, 'SKU', product => product.sku);
    const duplicateUpcGroups = duplicateGroupsFor(products, 'UPC/GTIN', product => product.upc);
    return [...duplicateSkuGroups, ...duplicateUpcGroups];
  }, [products]);

  const noMovement = useMemo(
    () => products.filter(product => !product.hasInventoryMovement),
    [products]
  );

  const categoryMovement = useMemo<CategoryMovement[]>(() => {
    const summaries = new Map<string, CategoryMovement>();
    for (const product of products) {
      const productCategories = product.categories || [];
      const categories = productCategories.length
        ? productCategories
        : [{ id: 'uncategorized', name: 'Uncategorized' }];

      for (const category of categories) {
        const existing =
          summaries.get(category.id) ||
          {
            id: category.id,
            name: category.name,
            total: 0,
            moving: 0,
            noMovement: 0,
          };
        existing.total += 1;
        if (product.hasInventoryMovement) existing.moving += 1;
        else existing.noMovement += 1;
        summaries.set(category.id, existing);
      }
    }

    return [...summaries.values()].sort((a, b) => {
      if (a.moving === 0 && b.moving !== 0) return -1;
      if (a.moving !== 0 && b.moving === 0) return 1;
      return b.noMovement - a.noMovement || a.name.localeCompare(b.name);
    });
  }, [products]);

  const noMovementCategories = categoryMovement.filter(category => category.total > 0 && category.moving === 0);
  const duplicateItemCount = new Set(
    duplicateGroups.flatMap(group => group.items.map(item => item.variationId))
  ).size;
  const criticalDuplicateGroups = duplicateGroups.filter(group => group.severity === 'critical');
  const movingCount = products.filter(product => product.hasInventoryMovement).length;
  const dashboardDisabled = !lastRefreshAt || products.length === 0;
  const movementChartData = [
    { label: 'With movement', value: movingCount, color: '#059669' },
    { label: 'No movement', value: noMovement.length, color: '#0284c7' },
    { label: 'Duplicate items', value: duplicateItemCount, color: '#d97706' },
    { label: 'Critical duplicates', value: criticalDuplicateGroups.length, color: '#dc2626' },
    { label: 'Categories stopped', value: noMovementCategories.length, color: '#e11d48' },
  ].filter(row => row.value > 0);
  const duplicateChartData = duplicateGroups
    .map(group => ({
      label: `${group.kind} ${group.code}`,
      value: group.items.length,
      color: group.severity === 'critical' ? '#dc2626' : '#d97706',
    }))
    .slice(0, 5);
  const lastRefreshLabel = lastRefreshAt
    ? lastRefreshAt.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
    : 'No refresh yet';

  const runAudit = async () => {
    setAuditing(true);
    setError(null);
    setHasRun(true);
    setProducts([]);
    setPages(0);

    const allProducts: CatalogAuditProduct[] = [];
    let cursor: string | null = null;
    let pageCount = 0;

    try {
      do {
        const data = await squarePrices.audit(cursor);
        pageCount += 1;
        allProducts.push(...data.products);
        setProducts([...allProducts]);
        setPages(pageCount);
        cursor = data.cursor || null;
      } while (cursor);

      setLastRefreshAt(new Date());
      toast.success('Inventory audit complete');
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
        'Finding',
        'Code type',
        'Code',
        'SKU',
        'UPC/GTIN',
        'Product or category',
        'Variation or category ID',
        'Item ID',
        'Price',
        'Inventory movement',
        'Square categories',
      ],
      ...duplicateGroups.flatMap(group =>
        group.items.map(product => [
          `Duplicate ${group.kind}${group.severity === 'critical' ? ' - critical' : ''}`,
          group.kind,
          group.code,
          product.sku || '',
          product.upc || '',
          product.name,
          product.variationId,
          product.itemId,
          formatMoney(product.currentPrice, product.currency),
          product.hasInventoryMovement ? 'Yes' : 'No',
          categoryNames(product),
        ])
      ),
      ...noMovement.map(product => [
        'No inventory movement',
        '',
        '',
        product.sku || '',
        product.upc || '',
        product.name,
        product.variationId,
        product.itemId,
        formatMoney(product.currentPrice, product.currency),
        'No',
        categoryNames(product),
      ]),
      ...noMovementCategories.map(category => [
        'Category without movement',
        '',
        '',
        '',
        '',
        category.name,
        category.id,
        '',
        '',
        'No',
        category.name,
      ]),
    ];

    return rows.map(row => row.map(csvEscape).join(',')).join('\n');
  };

  const downloadCsv = (csv: string) => {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-audit-${new Date().toISOString().split('T')[0]}.csv`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadTextFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportSvg = (svgId: string, filename: string, title: string) => {
    const svg = document.getElementById(svgId);
    if (!(svg instanceof SVGSVGElement)) {
      toast.error('Chart is not ready');
      return;
    }

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const source = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
    setSvgPreview({ filename, source, title });
    downloadTextFile(source, filename, 'image/svg+xml;charset=utf-8');
    toast.success('Chart ready');
  };

  const exportCsv = () => {
    const csv = buildCsv();
    setCsvPreview(csv);
    downloadCsv(csv);
    toast.success('CSV ready');
  };

  const copyCsv = async () => {
    if (!csvPreview) return;
    try {
      await navigator.clipboard.writeText(csvPreview);
      toast.success('CSV copied');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not copy CSV'));
    }
  };

  const copySvg = async () => {
    if (!svgPreview) return;
    try {
      await navigator.clipboard.writeText(svgPreview.source);
      toast.success('SVG copied');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not copy SVG'));
    }
  };

  const hasFindings = duplicateGroups.length > 0 || noMovement.length > 0 || noMovementCategories.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory Audit</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={runAudit} disabled={auditing} className="gap-1.5">
            {auditing ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchCheck className="h-4 w-4" />}
            {auditing ? `Checking page ${pages + 1}` : hasRun ? 'Refresh audit' : 'Run audit'}
          </Button>
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={!hasFindings || auditing}
            className="gap-1.5"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="text-2xl font-bold">{products.length}</div>
          <div className="text-xs text-muted-foreground">catalog items checked</div>
        </div>
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="text-2xl font-bold">{pages}</div>
          <div className="text-xs text-muted-foreground">Square pages checked</div>
        </div>
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="text-2xl font-bold text-amber-600">{duplicateGroups.length}</div>
          <div className="text-xs text-muted-foreground">duplicate SKU/UPC groups</div>
        </div>
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="text-2xl font-bold text-sky-700">{noMovement.length}</div>
          <div className="text-xs text-muted-foreground">without inventory movement</div>
        </div>
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="text-2xl font-bold text-rose-700">{noMovementCategories.length}</div>
          <div className="text-xs text-muted-foreground">categories without movement</div>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Audit dashboard</h2>
          <Badge variant="outline" className="w-fit">
            Last refresh: {lastRefreshLabel}
          </Badge>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <ChartCard
            title="Movement overview"
            disabled={dashboardDisabled}
            onDownload={() => exportSvg('audit-chart-movement', 'audit-movement-overview.svg', 'Movement overview')}
          >
            <HorizontalBarChart
              id="audit-chart-movement"
              title="Movement overview"
              data={movementChartData}
              emptyLabel="No refresh data"
            />
          </ChartCard>
          <ChartCard
            title="Category movement"
            disabled={dashboardDisabled}
            onDownload={() => exportSvg('audit-chart-categories', 'audit-category-movement.svg', 'Category movement')}
          >
            <CategoryStackedChart id="audit-chart-categories" categories={categoryMovement} />
          </ChartCard>
          <ChartCard
            title="Catalog duplicates"
            disabled={dashboardDisabled}
            onDownload={() => exportSvg('audit-chart-duplicates', 'audit-catalog-duplicates.svg', 'Catalog duplicates')}
          >
            <HorizontalBarChart
              id="audit-chart-duplicates"
              title="Catalog duplicates"
              data={duplicateChartData}
              emptyLabel="No duplicate items"
            />
          </ChartCard>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Catalog duplicate SKU/UPC
              <Badge variant="secondary">{duplicateItemCount}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {auditing && duplicateGroups.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Checking Square...</div>
            ) : duplicateGroups.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {hasRun ? 'No duplicate SKU or UPC/GTIN groups found.' : 'No audit run yet.'}
              </div>
            ) : (
              <div className="space-y-3">
                {duplicateGroups.map(group => (
                  <div key={`${group.kind}-${group.code}`} className="overflow-hidden rounded-lg border">
                    <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-3 py-2">
                      <div className="min-w-0">
                        <div className="font-mono text-sm font-semibold">
                          {group.kind}: {group.code}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {group.crossItem ? 'Across multiple Square items' : 'Inside one Square item'}
                          {group.differentPrices ? ' - different prices' : ' - same price'}
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Badge variant={group.severity === 'critical' ? 'destructive' : 'outline'}>
                          {group.severity}
                        </Badge>
                        <Badge variant="outline">{group.items.length} items</Badge>
                      </div>
                    </div>
                    <div className="divide-y">
                      {group.items.map(product => (
                        <ProductLine key={product.variationId} product={product} />
                      ))}
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
              <PackageX className="h-4 w-4 text-sky-700" />
              No inventory movements
              <Badge variant="secondary">{noMovement.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {auditing && noMovement.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Checking Square...</div>
            ) : noMovement.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {hasRun ? 'All checked items have inventory movement.' : 'No audit run yet.'}
              </div>
            ) : (
              <div className="max-h-[720px] divide-y overflow-auto rounded-lg border">
                {noMovement.map(product => (
                  <ProductLine key={product.variationId} product={product} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <PackageX className="h-4 w-4 text-rose-700" />
              Categories without movement
              <Badge variant="secondary">{noMovementCategories.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {auditing && categoryMovement.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Checking Square...</div>
            ) : noMovementCategories.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {hasRun ? 'All checked categories have inventory movement.' : 'No audit run yet.'}
              </div>
            ) : (
              <div className="max-h-[720px] divide-y overflow-auto rounded-lg border">
                {noMovementCategories.map(category => (
                  <div key={category.id} className="px-3 py-2 text-sm">
                    <div className="font-medium">{category.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {category.total} item{category.total === 1 ? '' : 's'} checked · 0 with movement
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {auditing && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Audit is still reading Square catalog pages.
        </div>
      )}

      <Dialog open={!!csvPreview} onOpenChange={open => !open && setCsvPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>CSV export</DialogTitle>
          </DialogHeader>
          <Textarea
            readOnly
            value={csvPreview || ''}
            className="min-h-[320px] font-mono text-xs"
          />
          <DialogFooter>
            <Button variant="outline" onClick={copyCsv}>
              Copy CSV
            </Button>
            <Button onClick={() => csvPreview && downloadCsv(csvPreview)}>
              Download CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!svgPreview} onOpenChange={open => !open && setSvgPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{svgPreview?.title || 'Chart export'}</DialogTitle>
          </DialogHeader>
          <Textarea
            readOnly
            value={svgPreview?.source || ''}
            className="min-h-[320px] font-mono text-xs"
          />
          <DialogFooter>
            <Button variant="outline" onClick={copySvg}>
              Copy SVG
            </Button>
            <Button
              onClick={() =>
                svgPreview &&
                downloadTextFile(svgPreview.source, svgPreview.filename, 'image/svg+xml;charset=utf-8')
              }
            >
              Download SVG
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
