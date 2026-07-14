import { useState, useEffect, useMemo, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Search, RefreshCw, Printer, Loader2, Languages, CheckCheck, Camera } from 'lucide-react';
import { BarcodeScannerDialog } from '@/components/BarcodeScannerDialog';
import {
  squarePrices,
  formatMoney,
  type PriceProduct,
  type PriceChange,
  type PriceDuplicate,
  type PriceCatalogMissing,
  type SyncSummary,
} from '@/hooks/useSquarePrices';
import { groupPriceItems, UNKNOWN_PRICE_VENDOR, type PriceGroupBy } from '@/lib/priceCategories';
import { usePriceLang, type Dict } from '@/lib/pricesI18n';
import { useAuth } from '@/hooks/useAuth';
import { canAccessPricePermission } from '@/lib/permissions';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatPriceChangedDate(value: string | null | undefined, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

// ---------------------------------------------------------------------
//  Tab 1: Cambiar precio (escaneo + tags)
// ---------------------------------------------------------------------
function ChangePriceTab({
  t,
  onPriceChangeResolved,
  onZoom,
}: {
  t: Dict;
  onPriceChangeResolved: () => void;
  onZoom: (url: string) => void;
}) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [taggingAll, setTaggingAll] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [product, setProduct] = useState<PriceProduct | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scannerLabels = useMemo(
    () => ({
      title: t.scanner_title,
      hint: t.scanner_hint,
      close: t.scanner_close,
      permissionError: t.scanner_permission_err,
      notFoundError: t.scanner_not_found_err,
      startError: t.scanner_start_err,
    }),
    [t]
  );

  const runSearch = async (rawCode: string) => {
    const c = rawCode.trim();
    if (!c) return;
    setCode(c);
    setLoading(true);
    setNotFound(null);
    try {
      const data = await squarePrices.lookup(c);
      if (!data.found) {
        setProduct(null);
        setNotFound(data.error || data.reason || t.not_in_square);
      } else {
        setProduct(data);
      }
    } catch (err) {
      setProduct(null);
      setNotFound(getErrorMessage(err, t.search_err));
    } finally {
      setLoading(false);
      inputRef.current?.select();
    }
  };

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    void runSearch(code);
  };

  const confirmTag = async (store: 72 | 86) => {
    if (!product) return;
    try {
      const data = await squarePrices.tag(product.barcode, store);
      setProduct(data);
      if (!data.changePending && data.confirmedStores.length === 0) {
        onPriceChangeResolved();
        toast.success(t.toast_done);
      } else {
        toast.success(t.toast_tag(store));
      }
    } catch (err) {
      toast.error(getErrorMessage(err, t.toast_tag_err));
    }
  };

  const confirmAllTags = async () => {
    if (!product?.changePending) return;
    const pendingStores = ([72, 86] as const).filter(store => !product.confirmedStores.includes(store));
    if (pendingStores.length === 0) return;

    setTaggingAll(true);
    try {
      let data: PriceProduct = product;
      for (const store of pendingStores) {
        data = await squarePrices.tag(product.barcode, store);
      }
      setProduct(data);
      if (!data.changePending && data.confirmedStores.length === 0) {
        onPriceChangeResolved();
      }
      toast.success(t.toast_done);
    } catch (err) {
      toast.error(getErrorMessage(err, t.toast_tag_err));
    } finally {
      setTaggingAll(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t.scan_hint}</p>
      <form onSubmit={search} className="grid grid-cols-[1fr_auto_auto] gap-2" autoComplete="off">
        <Input
          ref={inputRef}
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder={t.ph_barcode}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => setScannerOpen(true)}
          className="touch-target"
          title={t.btn_camera}
          aria-label={t.btn_camera}
        >
          <Camera className="h-4 w-4" />
        </Button>
        <Button type="submit" disabled={loading} className="gap-1.5 touch-target">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {t.btn_search}
        </Button>
      </form>

      {notFound && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {t.not_found}: <b>{code}</b>
          <br />
          {notFound}
        </div>
      )}

      {product && (
        <ProductCard
          t={t}
          product={product}
          onTag={confirmTag}
          onTagAll={confirmAllTags}
          taggingAll={taggingAll}
          onZoom={onZoom}
        />
      )}

      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={barcode => void runSearch(barcode)}
        labels={scannerLabels}
      />
    </div>
  );
}

function StorePills({ t, product }: { t: Dict; product: PriceProduct }) {
  if (!product.changePending) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {product.pendingStores.map(s => (
        <Badge key={`p${s}`} variant="secondary" className="bg-amber-100 text-amber-800">
          {t.store_pending(s)}
        </Badge>
      ))}
      {product.confirmedStores.map(s => (
        <Badge key={`c${s}`} className="bg-emerald-600">
          {t.store_done(s)}
        </Badge>
      ))}
    </div>
  );
}

function ProductCard({
  t,
  product,
  onTag,
  onTagAll,
  taggingAll,
  onZoom,
}: {
  t: Dict;
  product: PriceProduct;
  onTag: (store: 72 | 86) => void;
  onTagAll: () => void;
  taggingAll: boolean;
  onZoom: (url: string) => void;
}) {
  const changed = product.changePending;
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div>
          <div className="text-lg font-semibold">{product.name}</div>
          <div className="text-sm text-muted-foreground">
            {t.barcode_label}: {product.barcode}
          </div>
        </div>

        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name ?? ''}
            onClick={() => onZoom(product.imageUrl!)}
            className="mx-auto max-h-64 cursor-zoom-in rounded-lg object-contain"
          />
        ) : (
          <div className="flex aspect-square max-h-64 items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
            {t.no_photo}
          </div>
        )}

        <div className="flex items-center justify-center gap-4">
          {changed ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-3 text-center">
              <div className="text-xs uppercase text-amber-700">{t.new_price}</div>
              <div className="text-2xl font-bold text-amber-700">
                {formatMoney(product.currentPrice, product.currency)}
              </div>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-xs uppercase text-muted-foreground">{t.current_price}</div>
              <div className="text-2xl font-bold">
                {formatMoney(product.currentPrice, product.currency)}
              </div>
            </div>
          )}
        </div>

        <div
          className={`text-center text-sm font-medium ${
            changed ? 'text-amber-600' : 'text-emerald-600'
          }`}
        >
          {changed ? t.price_changed : t.price_uptodate}
        </div>
        {changed && product.priceChangedAt && (
          <div className="text-center text-xs font-semibold text-amber-700">
            {t.price_changed_since}: {formatPriceChangedDate(product.priceChangedAt, t.locale)}
          </div>
        )}

        <StorePills t={t} product={product} />

        <div className="grid grid-cols-2 gap-3">
          {([72, 86] as const).map(store => {
            const done = product.confirmedStores.includes(store);
            return (
              <Button
                key={store}
                variant={done ? 'secondary' : 'default'}
                disabled={!changed || done}
                onClick={() => onTag(store)}
                className="touch-target"
              >
                {done ? t.store_done(store) : t.tag_changed_store(store)}
              </Button>
            );
          })}
        </div>

        <Button
          type="button"
          variant="outline"
          disabled={!changed || taggingAll || product.pendingStores.length === 0}
          onClick={onTagAll}
          className="w-full gap-1.5 touch-target"
        >
          {taggingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
          {t.tag_changed_all}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------
//  Tab 2: Foto grande
// ---------------------------------------------------------------------
function BigPhotoTab({ t, onZoom }: { t: Dict; onZoom: (url: string) => void }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [product, setProduct] = useState<PriceProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scannerLabels = useMemo(
    () => ({
      title: t.scanner_title,
      hint: t.scanner_hint,
      close: t.scanner_close,
      permissionError: t.scanner_permission_err,
      notFoundError: t.scanner_not_found_err,
      startError: t.scanner_start_err,
    }),
    [t]
  );

  const runSearch = async (rawCode: string) => {
    const c = rawCode.trim();
    if (!c) return;
    setCode(c);
    setLoading(true);
    setError(null);
    try {
      const data = await squarePrices.lookup(c);
      if (!data.found) {
        setProduct(null);
        setError(`${t.not_found}: ${c}`);
      } else {
        setProduct(data);
      }
    } catch (err) {
      setProduct(null);
      setError(getErrorMessage(err, t.search_err));
    } finally {
      setLoading(false);
    }
  };

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    void runSearch(code);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t.photo_hint}</p>
      <form onSubmit={search} className="grid grid-cols-[1fr_auto_auto] gap-2" autoComplete="off">
        <Input
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder={t.ph_barcode}
          autoComplete="off"
          spellCheck={false}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => setScannerOpen(true)}
          className="touch-target"
          title={t.btn_camera}
          aria-label={t.btn_camera}
        >
          <Camera className="h-4 w-4" />
        </Button>
        <Button type="submit" disabled={loading} className="gap-1.5 touch-target">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {t.btn_view}
        </Button>
      </form>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {product && (
        <Card>
          <CardContent className="space-y-3 p-5">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name ?? ''}
                onClick={() => onZoom(product.imageUrl!)}
                className="mx-auto w-full cursor-zoom-in rounded-lg object-contain"
              />
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-lg bg-muted text-muted-foreground">
                {t.no_photo_long}
              </div>
            )}
            <div className="text-center text-lg font-semibold">{product.name}</div>
            <div className="text-center text-sm text-muted-foreground">
              {formatMoney(product.currentPrice, product.currency)} · {product.barcode}
            </div>
          </CardContent>
        </Card>
      )}

      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={barcode => void runSearch(barcode)}
        labels={scannerLabels}
      />
    </div>
  );
}

// ---------------------------------------------------------------------
//  Tab 3: Lista / Imprimir
// ---------------------------------------------------------------------
const SYNC_PAGE_RETRIES = 3;

function sleep(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function syncPageWithRetry(cursor: string | null, syncRunStartedAt: string | null) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= SYNC_PAGE_RETRIES; attempt += 1) {
    try {
      return await squarePrices.sync(cursor, syncRunStartedAt);
    } catch (err) {
      lastError = err;
      if (attempt < SYNC_PAGE_RETRIES) await sleep(900 * attempt);
    }
  }
  throw lastError;
}

function ListTab({ refreshKey, t }: { refreshKey: number; t: Dict }) {
  const [syncing, setSyncing] = useState(false);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [changes, setChanges] = useState<PriceChange[]>([]);
  const [duplicates, setDuplicates] = useState<PriceDuplicate[]>([]);
  const [catalogMissing, setCatalogMissing] = useState<PriceCatalogMissing[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<PriceGroupBy>('vendor');
  const [selectedBarcodes, setSelectedBarcodes] = useState<Set<string>>(() => new Set());
  const [bulkTagging, setBulkTagging] = useState(false);
  const groupedChanges = useMemo(() => groupPriceItems(changes, groupBy), [changes, groupBy]);
  const groupedDuplicates = useMemo(() => groupPriceItems(duplicates, groupBy), [duplicates, groupBy]);
  const groupedCatalogMissing = useMemo(
    () => groupPriceItems(catalogMissing, groupBy),
    [catalogMissing, groupBy]
  );
  const selectedChanges = useMemo(
    () => changes.filter(change => selectedBarcodes.has(change.barcode)),
    [changes, selectedBarcodes]
  );
  const selectedCount = selectedChanges.length;

  const loadLists = async () => {
    setLoading(true);
    try {
      const changesData = await squarePrices.changes();
      const [duplicatesData, missingData] = await Promise.all([
        squarePrices.duplicates(),
        squarePrices.catalogMissing(),
      ]);
      setChanges(changesData.changes);
      setDuplicates(duplicatesData.duplicates);
      setCatalogMissing(missingData.missing);
      return { changes: changesData.changes, duplicates: duplicatesData.duplicates, missing: missingData.missing };
    } catch (err) {
      toast.error(getErrorMessage(err, t.list_err));
      return { changes: [], duplicates: [], missing: [] };
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    const visibleBarcodes = new Set(changes.map(change => change.barcode));
    setSelectedBarcodes(current => {
      const next = new Set([...current].filter(barcode => visibleBarcodes.has(barcode)));
      return next.size === current.size ? current : next;
    });
  }, [changes]);

  const setBarcodeSelected = (barcode: string, checked: boolean) => {
    setSelectedBarcodes(current => {
      const next = new Set(current);
      if (checked) {
        next.add(barcode);
      } else {
        next.delete(barcode);
      }
      return next;
    });
  };

  const setGroupSelected = (items: PriceChange[], checked: boolean) => {
    setSelectedBarcodes(current => {
      const next = new Set(current);
      for (const item of items) {
        if (checked) {
          next.add(item.barcode);
        } else {
          next.delete(item.barcode);
        }
      }
      return next;
    });
  };

  const selectAllChanges = () => {
    setSelectedBarcodes(new Set(changes.map(change => change.barcode)));
  };

  const clearSelection = () => {
    setSelectedBarcodes(new Set());
  };

  const openPrintPage = (params: Record<string, string>) => {
    const search = new URLSearchParams(params);
    window.open(`/prices/print?${search.toString()}`, '_blank');
  };

  const printSelectedChanges = () => {
    const barcodes = selectedChanges.map(change => change.barcode);
    if (barcodes.length === 0) return;
    openPrintPage({
      groupBy: 'vendor',
      barcodes: barcodes.join(','),
    });
  };

  const markSelectedDone = async () => {
    if (selectedChanges.length === 0) return;

    setBulkTagging(true);
    let completed = 0;
    try {
      for (const change of selectedChanges) {
        const storesToTag = ([72, 86] as const).filter(store => !change.confirmedStores.includes(store));
        for (const store of storesToTag) {
          await squarePrices.tag(change.barcode, store);
        }
        completed += 1;
      }
      toast.success(t.bulk_done(completed));
      clearSelection();
      await loadLists();
    } catch (err) {
      toast.error(getErrorMessage(err, t.toast_tag_err));
      await loadLists();
    } finally {
      setBulkTagging(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    setSummary(null);
    let processedPages = 0;
    try {
      let cursor: string | null = null;
      let syncRunStartedAt: string | null = null;
      const aggregate: SyncSummary = {
        ok: true,
        total: 0,
        unicos: 0,
        nuevos: 0,
        cambiados: 0,
        sinCambio: 0,
        conflictos: 0,
        missing: 0,
        complete: false,
        pages: 0,
      };

      do {
        const data = await syncPageWithRetry(cursor, syncRunStartedAt);
        syncRunStartedAt = data.syncRunStartedAt || syncRunStartedAt;
        processedPages += 1;
        aggregate.total += data.total || 0;
        aggregate.unicos += data.unicos || 0;
        aggregate.nuevos += data.nuevos || 0;
        aggregate.cambiados += data.cambiados || 0;
        aggregate.sinCambio += data.sinCambio || 0;
        aggregate.conflictos += data.conflictos || 0;
        aggregate.missing = (aggregate.missing || 0) + (data.missing || 0);
        aggregate.syncRunStartedAt = syncRunStartedAt;
        aggregate.cursor = data.cursor || null;
        aggregate.hasMore = Boolean(data.cursor);
        aggregate.complete = false;
        aggregate.pages = processedPages;
        setSummary({ ...aggregate });

        cursor = data.cursor || null;
      } while (cursor);

      const finalLists = await loadLists();
      setSummary({
        ...aggregate,
        cambiados: finalLists.changes.length,
        conflictos: finalLists.duplicates.length,
        missing: finalLists.missing.length,
        complete: true,
        hasMore: false,
        cursor: null,
      });
    } catch (err) {
      if (processedPages > 0) {
        const partialLists = await loadLists();
        setSummary(prev =>
          prev
            ? {
                ...prev,
                cambiados: partialLists.changes.length,
                conflictos: partialLists.duplicates.length,
                missing: partialLists.missing.length,
                complete: false,
                hasMore: true,
              }
            : prev
        );
      }
      toast.error(getErrorMessage(err, t.sync_err));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t.changes_hint}</p>
      <Button onClick={sync} disabled={syncing} className="w-full gap-1.5 touch-target">
        {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {syncing && summary?.pages
          ? `${t.syncing} ${summary.pages}`
          : syncing
          ? t.syncing
          : t.btn_sync}
      </Button>

      {summary && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="text-xl font-bold">{summary.unicos ?? summary.total}</div>
              <div className="text-xs text-muted-foreground">{t.col_products}</div>
            </div>
            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="text-xl font-bold text-amber-600">{summary.cambiados}</div>
              <div className="text-xs text-muted-foreground">{t.col_changed}</div>
            </div>
            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="text-xl font-bold">{summary.sinCambio}</div>
              <div className="text-xs text-muted-foreground">{t.col_unchanged}</div>
            </div>
            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="text-xl font-bold text-slate-700">{summary.missing || 0}</div>
              <div className="text-xs text-muted-foreground">{t.col_missing_catalog}</div>
            </div>
            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="text-xl font-bold text-amber-700">{duplicates.length}</div>
              <div className="text-xs text-muted-foreground">{t.col_duplicates}</div>
            </div>
          </div>
          {summary.hasMore ? (
            <p className="text-xs font-medium text-amber-700">{t.sync_partial(summary.pages || 0)}</p>
          ) : summary.complete ? (
            <p className="text-xs font-medium text-emerald-700">{t.sync_done}</p>
          ) : null}
          {!syncing && summary.conflictos > 0 && (
            <p className="text-xs font-medium text-amber-700">{t.conflicts(summary.conflictos)}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={groupBy === 'vendor' ? 'default' : 'outline'}
          onClick={() => setGroupBy('vendor')}
          className="touch-target"
        >
          Vendor
        </Button>
        <Button
          variant={groupBy === 'category' ? 'default' : 'outline'}
          onClick={() => setGroupBy('category')}
          className="touch-target"
        >
          Category
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Button
          variant="outline"
          className="w-full gap-1.5 touch-target"
          onClick={() => openPrintPage({ groupBy })}
          disabled={changes.length === 0}
        >
          <Printer className="h-4 w-4" /> {t.btn_print}
        </Button>
        <Button
          variant="outline"
          className="w-full gap-1.5 touch-target"
          onClick={() => openPrintPage({ kind: 'missing', groupBy })}
          disabled={catalogMissing.length === 0}
        >
          <Printer className="h-4 w-4" /> {t.btn_print_missing}
        </Button>
        <Button
          variant="outline"
          className="w-full gap-1.5 touch-target"
          onClick={() => openPrintPage({ kind: 'duplicates', groupBy })}
          disabled={duplicates.length === 0}
        >
          <Printer className="h-4 w-4" /> {t.btn_print_duplicates}
        </Button>
      </div>

      {changes.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-medium">{t.bulk_selected(selectedCount)}</div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={selectAllChanges}
                disabled={loading || bulkTagging || selectedCount === changes.length}
              >
                {t.bulk_select_all}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearSelection}
                disabled={loading || bulkTagging || selectedCount === 0}
              >
                {t.bulk_clear_selection}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={printSelectedChanges}
                disabled={loading || bulkTagging || selectedCount === 0}
              >
                <Printer className="h-4 w-4" />
                {t.btn_print_selected}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    disabled={loading || bulkTagging || selectedCount === 0}
                  >
                    {bulkTagging ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCheck className="h-4 w-4" />
                    )}
                    {bulkTagging ? t.bulk_marking : t.bulk_mark_selected}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t.bulk_confirm_title}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t.bulk_confirm_description(selectedCount)}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t.bulk_cancel}</AlertDialogCancel>
                    <AlertDialogAction onClick={markSelectedDone}>
                      {t.bulk_confirm}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-muted-foreground">{t.loading}</div>
      ) : changes.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t.no_changes}</p>
      ) : (
        <>
          <div className="space-y-3">
            {groupedChanges.map(group => {
              const groupSelectedCount = group.items.filter(item => selectedBarcodes.has(item.barcode)).length;
              const groupChecked =
                groupSelectedCount === 0
                  ? false
                  : groupSelectedCount === group.items.length
                  ? true
                  : 'indeterminate';

              return (
                <section key={group.label} className="overflow-hidden rounded-lg border">
                  <div className="flex items-center justify-between gap-3 border-b bg-muted/50 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Checkbox
                        checked={groupChecked}
                        aria-label={t.select_group_items(group.label, group.items.length)}
                        onCheckedChange={checked => setGroupSelected(group.items, checked === true)}
                      />
                      <span className="truncate font-semibold">{group.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {groupSelectedCount > 0 && (
                        <Badge variant="outline">{t.bulk_selected(groupSelectedCount)}</Badge>
                      )}
                      <Badge variant="secondary">{group.items.length}</Badge>
                      {groupBy === 'vendor' && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5"
                          onClick={() => openPrintPage({ groupBy: 'vendor', vendor: group.label })}
                        >
                          <Printer className="h-4 w-4" />
                          {t.btn_print_vendor}
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="divide-y">
                    {group.items.map(c => (
                      <div key={c.barcode} className="flex items-center justify-between gap-3 p-3">
                        <Checkbox
                          checked={selectedBarcodes.has(c.barcode)}
                          aria-label={t.select_item(c.name || c.barcode)}
                          onCheckedChange={checked => setBarcodeSelected(c.barcode, checked === true)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="truncate font-medium">{c.name}</div>
                            {c.conflict && <Badge variant="secondary">{t.duplicate_badge}</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {c.barcode} -{' '}
                            {c.pendingStores.length
                              ? t.missing + ': ' + c.pendingStores.map(s => 'T' + s).join(', ')
                              : t.tags_ready}
                          </div>
                          {c.priceChangedAt && (
                            <div className="text-xs font-medium text-amber-700">
                              {t.price_changed_since}: {formatPriceChangedDate(c.priceChangedAt, t.locale)}
                            </div>
                          )}
                          {groupBy === 'vendor' && c.categoryName && (
                            <div className="text-xs text-muted-foreground">{c.categoryName}</div>
                          )}
                          {groupBy === 'category' && c.vendorName && c.vendorName !== UNKNOWN_PRICE_VENDOR && (
                            <div className="text-xs text-muted-foreground">{c.vendorName}</div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">{t.new_price}</div>
                          <div className="font-semibold text-amber-600">
                            {formatMoney(c.currentPrice, c.currency)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {!loading && (
        <div className="space-y-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">{t.duplicates_title}</h2>
              <p className="text-xs text-muted-foreground">{t.duplicates_hint}</p>
            </div>
            <Badge variant="secondary">{duplicates.length}</Badge>
          </div>

          {duplicates.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t.no_duplicates}</p>
          ) : (
            <div className="space-y-3">
              {groupedDuplicates.map(group => (
                <section key={group.label} className="overflow-hidden rounded-lg border">
                  <div className="flex items-center justify-between gap-3 border-b bg-muted/50 px-3 py-2">
                    <div className="font-semibold">{group.label}</div>
                    <Badge variant="secondary">{group.items.length}</Badge>
                  </div>
                  <div className="divide-y">
                    {group.items.map(item => (
                      <div key={item.barcode} className="flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="truncate font-medium">{item.name}</div>
                            <Badge variant="secondary">{t.duplicate_badge}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">{item.barcode}</div>
                          {groupBy === 'vendor' && item.categoryName && (
                            <div className="text-xs text-muted-foreground">{item.categoryName}</div>
                          )}
                          {groupBy === 'category' && item.vendorName && item.vendorName !== UNKNOWN_PRICE_VENDOR && (
                            <div className="text-xs text-muted-foreground">{item.vendorName}</div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">{t.h_price}</div>
                          <div className="font-semibold">{formatMoney(item.currentPrice, item.currency)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && (
        <div className="space-y-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">{t.missing_catalog_title}</h2>
              <p className="text-xs text-muted-foreground">{t.missing_catalog_hint}</p>
            </div>
            <Badge variant="secondary">{catalogMissing.length}</Badge>
          </div>

          {catalogMissing.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t.no_missing_catalog}</p>
          ) : (
            <div className="space-y-3">
              {groupedCatalogMissing.map(group => (
                <section key={group.label} className="overflow-hidden rounded-lg border">
                  <div className="flex items-center justify-between gap-3 border-b bg-muted/50 px-3 py-2">
                    <div className="font-semibold">{group.label}</div>
                    <Badge variant="secondary">{group.items.length}</Badge>
                  </div>
                  <div className="divide-y">
                    {group.items.map(item => (
                      <div key={item.barcode} className="flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{item.name}</div>
                          <div className="text-xs text-muted-foreground">{item.barcode}</div>
                          {groupBy === 'vendor' && item.categoryName && (
                            <div className="text-xs text-muted-foreground">{item.categoryName}</div>
                          )}
                          {groupBy === 'category' && item.vendorName && item.vendorName !== UNKNOWN_PRICE_VENDOR && (
                            <div className="text-xs text-muted-foreground">{item.vendorName}</div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">{t.h_last_price}</div>
                          <div className="font-semibold">{formatMoney(item.currentPrice, item.currency)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
//  Page
// ---------------------------------------------------------------------
export default function PricesPage() {
  const { user } = useAuth();
  const { lang, t, toggle } = usePriceLang();
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [priceChangesRefreshKey, setPriceChangesRefreshKey] = useState(0);
  const canManagePrices = canAccessPricePermission(user, 'prices.manage');
  const refreshPriceChanges = () => setPriceChangesRefreshKey(current => current + 1);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={toggle}
          className="gap-1.5"
          title="Language / Idioma"
        >
          <Languages className="h-4 w-4" />
          {lang === 'es' ? 'EN' : 'ES'}
        </Button>
      </div>

      <Tabs defaultValue="scan">
        <TabsList className={`grid w-full ${canManagePrices ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <TabsTrigger value="scan">{t.tab_scan}</TabsTrigger>
          <TabsTrigger value="photo">{t.tab_photo}</TabsTrigger>
          {canManagePrices && <TabsTrigger value="list">{t.tab_list}</TabsTrigger>}
        </TabsList>
        <TabsContent value="scan" className="mt-4">
          <ChangePriceTab t={t} onPriceChangeResolved={refreshPriceChanges} onZoom={setZoomUrl} />
        </TabsContent>
        <TabsContent value="photo" className="mt-4">
          <BigPhotoTab t={t} onZoom={setZoomUrl} />
        </TabsContent>
        {canManagePrices && (
          <TabsContent value="list" className="mt-4">
            <ListTab t={t} refreshKey={priceChangesRefreshKey} />
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={!!zoomUrl} onOpenChange={open => !open && setZoomUrl(null)}>
        <DialogContent className="max-w-3xl">
          {zoomUrl && <img src={zoomUrl} alt="" className="max-h-[80vh] w-full object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
