import { Fragment, useEffect, useMemo, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { squarePrices, formatMoney, type PriceCatalogMissing, type PriceChange, type PriceDuplicate } from '@/hooks/useSquarePrices';
import { groupPriceItems, UNKNOWN_PRICE_VENDOR, type PriceGroupBy } from '@/lib/priceCategories';
import { getPriceLang, PRICE_I18N } from '@/lib/pricesI18n';

// Printable sheet ported from square-precios/public/print.html.
// Renders a clean table (its own minimal layout, no app chrome) with a scannable
// CODE128 barcode per row and T72/T86 checkboxes to mark by hand.
// Language follows the toggle picked in PricesPage (shared via localStorage),
// or can be forced with ?lang=en|es.
export default function PricesPrintPage() {
  const [items, setItems] = useState<Array<PriceChange | PriceCatalogMissing | PriceDuplicate> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const urlLang = new URLSearchParams(window.location.search).get('lang');
  const lang = urlLang === 'en' || urlLang === 'es' ? urlLang : getPriceLang();
  const urlGroupBy = new URLSearchParams(window.location.search).get('groupBy');
  const groupBy: PriceGroupBy = urlGroupBy === 'category' ? 'category' : 'vendor';
  const kind = new URLSearchParams(window.location.search).get('kind');
  const isMissingCatalog = kind === 'missing';
  const isDuplicates = kind === 'duplicates';
  const showsTagColumn = !isMissingCatalog && !isDuplicates;
  const t = PRICE_I18N[lang];
  const title = isDuplicates ? t.print_duplicates_title : isMissingCatalog ? t.print_missing_title : t.print_title;
  const emptyText = isDuplicates ? t.print_duplicates_empty : isMissingCatalog ? t.print_missing_empty : t.print_empty;
  const groupedItems = useMemo(() => groupPriceItems(items || [], groupBy), [items, groupBy]);
  const groupQueryPrefix = isDuplicates ? 'kind=duplicates&' : isMissingCatalog ? 'kind=missing&' : '';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = title;
  }, [lang, title]);

  useEffect(() => {
    const request = isDuplicates
      ? squarePrices.duplicates()
      : isMissingCatalog
      ? squarePrices.catalogMissing()
      : squarePrices.changes();
    request
      .then(data => setItems('duplicates' in data ? data.duplicates : 'missing' in data ? data.missing : data.changes))
      .catch(err => setError(err instanceof Error ? err.message : t.print_load_err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDuplicates, isMissingCatalog]);

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
        .old { color: #777; text-decoration: line-through; font-size: 12px; }
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
        <h1 style={{ fontSize: 18, margin: 0 }}>{title}</h1>
        <div style={{ fontSize: 12, color: '#555' }}>
          {now.toLocaleString(t.locale)} · {items?.length ?? 0} {t.col_products}
        </div>
      </header>

      <div className="toolbar" style={{ margin: '12px 0' }}>
        <button className="pp-btn" onClick={() => window.print()}>{t.print_print}</button>
        <button className="pp-btn" onClick={() => window.location.reload()}>{t.print_reload}</button>
        <button className="pp-btn" onClick={() => window.location.search = `?${groupQueryPrefix}groupBy=vendor`}>Vendor</button>
        <button className="pp-btn" onClick={() => window.location.search = `?${groupQueryPrefix}groupBy=category`}>Category</button>
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
              <th>{t.h_barcode}</th>
              {showsTagColumn && <th>{t.h_tag}</th>}
            </tr>
          </thead>
          <tbody>
            {groupedItems.map(group => (
              <Fragment key={group.label}>
                <tr className="cat-row">
                  <td colSpan={showsTagColumn ? 4 : 3}>{group.label} ({group.items.length})</td>
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
                      {isMissingCatalog || isDuplicates ? (
                        <span className="new">{formatMoney(c.currentPrice, c.currency)}</span>
                      ) : (
                        <>
                          <span className="old">{formatMoney(c.oldPrice, c.currency)}</span>
                          <br />
                          <span className="new">{formatMoney(c.currentPrice, c.currency)}</span>
                        </>
                      )}
                    </td>
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
