import { Fragment, useEffect, useMemo, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { squarePrices, formatMoney, type PriceChange } from '@/hooks/useSquarePrices';
import { groupPriceItemsByCategory } from '@/lib/priceCategories';
import { getPriceLang, PRICE_I18N } from '@/lib/pricesI18n';

// Printable sheet ported from square-precios/public/print.html.
// Renders a clean table (its own minimal layout, no app chrome) with a scannable
// CODE128 barcode per row and T72/T86 checkboxes to mark by hand.
// Language follows the toggle picked in PricesPage (shared via localStorage),
// or can be forced with ?lang=en|es.
export default function PricesPrintPage() {
  const [changes, setChanges] = useState<PriceChange[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const urlLang = new URLSearchParams(window.location.search).get('lang');
  const lang = urlLang === 'en' || urlLang === 'es' ? urlLang : getPriceLang();
  const t = PRICE_I18N[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t.print_title;
  }, [lang, t.print_title]);

  useEffect(() => {
    squarePrices
      .changes()
      .then(data => setChanges(data.changes))
      .catch(err => setError(err instanceof Error ? err.message : t.print_load_err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render barcodes once rows are in the DOM.
  useEffect(() => {
    if (!changes) return;
    document.querySelectorAll<SVGElement>('svg.barcode').forEach(el => {
      const code = el.getAttribute('data-code') || '';
      try {
        JsBarcode(el, code, { format: 'CODE128', width: 1.6, height: 45, fontSize: 12, margin: 4 });
      } catch {
        el.outerHTML = `<span class="bc-text">${code}</span>`;
      }
    });
  }, [changes]);

  const now = new Date();
  const groupedChanges = useMemo(() => groupPriceItemsByCategory(changes || []), [changes]);

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
        <h1 style={{ fontSize: 18, margin: 0 }}>{t.print_title}</h1>
        <div style={{ fontSize: 12, color: '#555' }}>
          {now.toLocaleString(t.locale)} · {changes?.length ?? 0} {t.col_products}
        </div>
      </header>

      <div className="toolbar" style={{ margin: '12px 0' }}>
        <button className="pp-btn" onClick={() => window.print()}>{t.print_print}</button>
        <button className="pp-btn" onClick={() => window.location.reload()}>{t.print_reload}</button>
      </div>

      {error ? (
        <p style={{ color: '#b91c1c' }}>{error}</p>
      ) : !changes ? (
        <p>{t.loading}</p>
      ) : changes.length === 0 ? (
        <p style={{ marginTop: 30, color: '#666' }}>{t.print_empty}</p>
      ) : (
        <table className="pp-table">
          <thead>
            <tr>
              <th>{t.h_product}</th>
              <th>{t.h_price}</th>
              <th>{t.h_barcode}</th>
              <th>{t.h_tag}</th>
            </tr>
          </thead>
          <tbody>
            {groupedChanges.map(group => (
              <Fragment key={group.category}>
                <tr className="cat-row">
                  <td colSpan={4}>{group.category} ({group.items.length})</td>
                </tr>
                {group.items.map(c => (
                  <tr key={c.barcode}>
                    <td className="name">
                      {c.name}
                      {c.categoryName && c.categoryName !== group.category && (
                        <div className="subcat">{c.categoryName}</div>
                      )}
                      {c.conflict && <div className="dup">{t.duplicate_badge}</div>}
                    </td>
                    <td className="price">
                      <span className="old">{formatMoney(c.oldPrice, c.currency)}</span>
                      <br />
                      <span className="new">{formatMoney(c.currentPrice, c.currency)}</span>
                    </td>
                    <td className="bc">
                      <svg className="barcode" data-code={String(c.barcode).replace(/"/g, '')} />
                      <div className="bc-text">{c.barcode}</div>
                    </td>
                    <td className="check">
                      <span className="pp-box" /> T72&nbsp;&nbsp;
                      <span className="pp-box" /> T86
                    </td>
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
