import { Fragment, useEffect, useMemo, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { squarePrices, formatMoney, type PriceCatalogMissing, type PriceChange, type PriceDuplicate } from '@/hooks/useSquarePrices';
import { groupPriceItems, UNKNOWN_PRICE_VENDOR, type PriceGroupBy } from '@/lib/priceCategories';
import { getPriceLang, PRICE_I18N } from '@/lib/pricesI18n';
import { useAuth } from '@/hooks/useAuth';
import { canAccessPricePermission } from '@/lib/permissions';

// Printable sheet ported from square-precios/public/print.html.
// Renders a clean table (its own minimal layout, no app chrome) with a scannable
// CODE128 barcode per row and T72/T86 checkboxes to mark by hand.
// Language follows the toggle picked in PricesPage (shared via localStorage),
// or can be forced with ?lang=en|es.
export default function PricesPrintPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<Array<PriceChange | PriceCatalogMissing | PriceDuplicate> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const searchParams = new URLSearchParams(window.location.search);
  const urlLang = searchParams.get('lang');
  const lang = urlLang === 'en' || urlLang === 'es' ? urlLang : getPriceLang();
  const urlGroupBy = searchParams.get('groupBy');
  const groupBy: PriceGroupBy = urlGroupBy === 'category' ? 'category' : 'vendor';
  const kind = searchParams.get('kind');
  const barcodeFilterParam = searchParams.get('barcodes') || '';
  const barcodeFilter = new Set(
    barcodeFilterParam
      .split(',')
      .map(barcode => barcode.trim())
      .filter(Boolean)
  );
  const vendorFilter = searchParams.get('vendor')?.trim() || null;
  const isMissingCatalog = kind === 'missing';
  const isDuplicates = kind === 'duplicates';
  const showsTagColumn = !isMissingCatalog && !isDuplicates;
  const showsSinceColumn = !isMissingCatalog && !isDuplicates;
  const tableColumnCount = 3 + (showsSinceColumn ? 1 : 0) + (showsTagColumn ? 1 : 0);
  const t = PRICE_I18N[lang];
  const title = isDuplicates ? t.print_duplicates_title : isMissingCatalog ? t.print_missing_title : t.print_title;
  const emptyText = isDuplicates ? t.print_duplicates_empty : isMissingCatalog ? t.print_missing_empty : t.print_empty;
  const groupedItems = useMemo(() => groupPriceItems(items || [], groupBy), [items, groupBy]);
  const canPrintPrices = canAccessPricePermission(user, 'prices.manage');

  const matchesPrintFilter = (item: PriceChange | PriceCatalogMissing | PriceDuplicate) => {
    if (barcodeFilter.size > 0) return barcodeFilter.has(String(item.barcode));
    if (vendorFilter) {
      const itemVendor = String(item.vendorName || '').trim() || UNKNOWN_PRICE_VENDOR;
      return itemVendor === vendorFilter;
    }
    return true;
  };

  const switchGroupBy = (nextGroupBy: PriceGroupBy) => {
    const next = new URLSearchParams();
    if (kind) next.set('kind', kind);
    next.set('groupBy', nextGroupBy);
    if (barcodeFilterParam) next.set('barcodes', barcodeFilterParam);
    if (vendorFilter) next.set('vendor', vendorFilter);
    window.location.search = `?${next.toString()}`;
  };

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = title;
  }, [lang, title]);

  useEffect(() => {
    if (loading || !canPrintPrices) return;
    const request = isDuplicates
      ? squarePrices.duplicates()
      : isMissingCatalog
      ? squarePrices.catalogMissing()
      : squarePrices.changes();
    request
      .then(data => {
        const nextItems = 'duplicates' in data ? data.duplicates : 'missing' in data ? data.missing : data.changes;
        setItems(nextItems.filter(matchesPrintFilter));
      })
      .catch(err => setError(err instanceof Error ? err.message : t.print_load_err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPrintPrices, isDuplicates, isMissingCatalog, loading]);

  // Render barcodes once rows are in the DOM.
  useEffect(() => {
    if (!items) return;
    document.querySelectorAll<SVGElement>('svg.barcode').forEach(el => {
      const code = el.getAttribute('data-code') || '';
      try {
        JsBarcode(el, code, { format: 'CODE128', width: 1.6, height: 45, fontSize: 12, margin: 4 });
      } catch {
        el.outerHTML = `<span class="bc-text">${code}</span>`;
      }
    });
  }, [items]);

  const now = new Date();
  const formatChangedDate = (value: string | null | undefined) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(t.locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  };

  if (!loading && !canPrintPrices) {
    return (
      <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: '#111', margin: 24 }}>
        <p style={{ color: '#b91c1c' }}>This print list is only available to the price admin.</p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: '#111', margin: 24 }}>
      <style>{`
        @media print { .toolbar { display: none; } body { margin: 10mm; } tr { page-break-inside: avoid; } }
        .pp-table { width: 100%; border-collapse: collapse; }
        .pp-table th, .pp-table td { border: 1px solid #999; padding: 6px 8px; text-align: left; vertical-align: middle; }
        .pp-table th { background: #eee; font-size: 12px; text-transform: uppercase; }
        .cat-row td { background: #dbeafe; color: #1e3a8a; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0; }
        td.name { font-size: 14px; font-weight: 600; }
        .subcat { color: #555; font-size: 11px; font-weight: 400; margin-top: 2px; }
        td.price { white-space: nowrap; font-size: 14px; }
        td.since { white-space: nowrap; font-size: 12px; color: #92400e; font-weight: 700; }
        .new { font-weight: 700; font-size: 16px; }
        .dup { display: inline-block; margin-top: 4px; border: 1px solid #b45309; color: #92400e; background: #fffbeb; border-radius: 4px; padding: 2px 5px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
        td.bc { text-align: center; width: 230px; }
        td.bc svg { max-width: 220px; }
        .bc-text { font-size: 11px; color: #333; }
        .check { width: 110px; text-align: center; font-size: 11px; }
        .pp-box { display: inline-block; width: 14px; height: 14px; border: 1px solid #333; margin: 0 2px -2px; }
        .pp-btn { font-size: 14px; padding: 8px 14px; border: 1px solid #888; border-radius: 8px; background: #f3f4f6; cursor: pointer; margin-right: 8px; }
      `}</style>

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 18, margin: 0 }}>{title}</h1>
          {vendorFilter && (
            <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
              Vendor: {vendorFilter}
            </div>
          )}
          {barcodeFilter.size > 0 && (
            <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
              {t.bulk_selected(barcodeFilter.size)}
            </div>
          )}
        </div>
        <div style={{ fontSize: 12, color: '#555' }}>
          {now.toLocaleString(t.locale)} · {items?.length ?? 0} {t.col_products}
        </div>
      </header>

      <div className="toolbar" style={{ margin: '12px 0' }}>
        <button className="pp-btn" onClick={() => window.print()}>{t.print_print}</button>
        <button className="pp-btn" onClick={() => window.location.reload()}>{t.print_reload}</button>
        <button className="pp-btn" onClick={() => switchGroupBy('vendor')}>Vendor</button>
        <button className="pp-btn" onClick={() => switchGroupBy('category')}>Category</button>
      </div>

      {error ? (
        <p style={{ color: '#b91c1c' }}>{error}</p>
      ) : !items ? (
        <p>{t.loading}</p>
      ) : items.length === 0 ? (
        <p style={{ marginTop: 30, color: '#666' }}>{emptyText}</p>
      ) : (
        <table className="pp-table">
          <thead>
            <tr>
              <th>{t.h_product}</th>
              <th>{isMissingCatalog ? t.h_last_price : t.h_price}</th>
              {showsSinceColumn && <th>{t.h_since}</th>}
              <th>{t.h_barcode}</th>
              {showsTagColumn && <th>{t.h_tag}</th>}
            </tr>
          </thead>
          <tbody>
            {groupedItems.map(group => (
              <Fragment key={group.label}>
                <tr className="cat-row">
                  <td colSpan={tableColumnCount}>{group.label} ({group.items.length})</td>
                </tr>
                {group.items.map(c => (
                  <tr key={c.barcode}>
                    <td className="name">
                      {c.name}
                      {groupBy === 'vendor' && c.categoryName && (
                        <div className="subcat">{c.categoryName}</div>
                      )}
                      {groupBy === 'category' && c.vendorName && c.vendorName !== UNKNOWN_PRICE_VENDOR && (
                        <div className="subcat">{c.vendorName}</div>
                      )}
                      {'conflict' in c && c.conflict && <div className="dup">{t.duplicate_badge}</div>}
                    </td>
                    <td className="price">
                      <span className="new">{formatMoney(c.currentPrice, c.currency)}</span>
                    </td>
                    {showsSinceColumn && (
                      <td className="since">
                        {'priceChangedAt' in c ? formatChangedDate(c.priceChangedAt) : ''}
                      </td>
                    )}
                    <td className="bc">
                      <svg className="barcode" data-code={String(c.barcode).replace(/"/g, '')} />
                      <div className="bc-text">{c.barcode}</div>
                    </td>
                    {showsTagColumn && (
                      <td className="check">
                        <span className="pp-box" /> T72&nbsp;&nbsp;
                        <span className="pp-box" /> T86
                      </td>
                    )}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
