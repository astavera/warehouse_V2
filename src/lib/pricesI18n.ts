import { useCallback, useState } from 'react';

// Bilingual (ES/EN) strings for the Prices module, ported from the original
// square-precios app. The chosen language is shared across tabs via localStorage
// (the printable sheet opens in a new tab and reads the same key).
export type PriceLang = 'es' | 'en';

const STORAGE_KEY = 'prices-lang-v2';

export function getPriceLang(): PriceLang {
  if (typeof localStorage === 'undefined') return 'en';
  return localStorage.getItem(STORAGE_KEY) === 'es' ? 'es' : 'en';
}

export function setStoredPriceLang(lang: PriceLang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}

export type Dict = {
  title: string;
  tab_scan: string;
  tab_photo: string;
  tab_list: string;
  scan_hint: string;
  photo_hint: string;
  changes_hint: string;
  ph_barcode: string;
  btn_search: string;
  btn_view: string;
  btn_camera: string;
  scanner_title: string;
  scanner_hint: string;
  scanner_close: string;
  scanner_permission_err: string;
  scanner_not_found_err: string;
  scanner_start_err: string;
  btn_sync: string;
  btn_print: string;
  searching: string;
  syncing: string;
  not_found: string;
  not_in_square: string;
  search_err: string;
  no_photo: string;
  no_photo_long: string;
  barcode_label: string;
  previous: string;
  new_price: string;
  current_price: string;
  price_changed: string;
  price_uptodate: string;
  store_pending: (s: number) => string;
  store_done: (s: number) => string;
  tag_changed_store: (s: number) => string;
  tag_changed_all: string;
  toast_tag: (s: number) => string;
  toast_done: string;
  toast_tag_err: string;
  col_products: string;
  col_changed: string;
  col_unchanged: string;
  col_new: string;
  col_missing_catalog: string;
  col_duplicates: string;
  conflicts: (n: number) => string;
  no_changes: string;
  missing_catalog_title: string;
  missing_catalog_hint: string;
  no_missing_catalog: string;
  btn_print_missing: string;
  duplicates_title: string;
  duplicates_hint: string;
  no_duplicates: string;
  btn_print_duplicates: string;
  sync_err: string;
  sync_partial: (pages: number) => string;
  sync_done: string;
  duplicate_badge: string;
  list_err: string;
  loading: string;
  missing: string;
  tags_ready: string;
  // print sheet
  print_title: string;
  print_print: string;
  print_reload: string;
  print_empty: string;
  print_missing_title: string;
  print_missing_empty: string;
  print_duplicates_title: string;
  print_duplicates_empty: string;
  print_load_err: string;
  h_product: string;
  h_price: string;
  h_last_price: string;
  h_barcode: string;
  h_tag: string;
  locale: string;
};

export const PRICE_I18N: Record<PriceLang, Dict> = {
  es: {
    title: 'Cambios de precio',
    tab_scan: 'Cambiar precio',
    tab_photo: 'Foto grande',
    tab_list: 'Lista',
    scan_hint: 'Escanea o escribe el barcode del producto.',
    photo_hint: 'Escanea para ver la foto en grande.',
    changes_hint: 'Busca en Square solo cambios de precio. Duplicados e inventario estan en Inventory Audit.',
    ph_barcode: 'Barcode / SKU',
    btn_search: 'Buscar',
    btn_view: 'Ver',
    btn_camera: 'Escanear con camara',
    scanner_title: 'Escanear barcode',
    scanner_hint: 'Apunta la camara al barcode hasta que llene el cuadro.',
    scanner_close: 'Cerrar',
    scanner_permission_err: 'El permiso de camara fue bloqueado en este dispositivo.',
    scanner_not_found_err: 'No se encontro camara en este dispositivo.',
    scanner_start_err: 'No se pudo iniciar el escaner de camara.',
    btn_sync: 'Buscar cambios de precio',
    btn_print: 'Imprimir lista (con barcodes)',
    searching: 'Buscando…',
    syncing: 'Sincronizando…',
    not_found: 'No encontrado',
    not_in_square: 'Producto no existe en Square',
    search_err: 'Error al buscar',
    no_photo: 'Sin foto en Square',
    no_photo_long: 'Este producto no tiene foto en Square',
    barcode_label: 'Barcode',
    previous: 'Anterior',
    new_price: 'Nuevo',
    current_price: 'Precio actual',
    price_changed: '⚠️ Precio cambió — falta cambiar tags',
    price_uptodate: '✓ Precio al día',
    store_pending: s => `Tienda ${s} pendiente`,
    store_done: s => `Tienda ${s} ✓`,
    tag_changed_store: s => `Tag cambiado — tienda ${s}`,
    tag_changed_all: 'Tag cambiado - todas las tiendas',
    toast_tag: s => `✓ Tag tienda ${s} marcado`,
    toast_done: '✓ Ambas tiendas listas. Precio nuevo guardado.',
    toast_tag_err: 'Error al marcar el tag',
    col_products: 'productos',
    col_changed: 'cambiaron',
    col_unchanged: 'sin cambio',
    col_new: 'nuevos',
    col_missing_catalog: 'fuera de Square',
    col_duplicates: 'duplicados',
    conflicts: n => `${n} barcodes duplicados con precios distintos, marcados como duplicados.`,
    no_changes: 'Sin cambios de precio pendientes.',
    missing_catalog_title: 'No estan en Square',
    missing_catalog_hint: 'Productos guardados en la app que no aparecieron en la ultima sincronizacion completa de Square.',
    no_missing_catalog: 'No hay productos fuera del catalogo de Square.',
    btn_print_missing: 'Imprimir no estan en Square',
    duplicates_title: 'Duplicados',
    duplicates_hint: 'Barcodes que Square devolvio mas de una vez o con precios distintos. Revisa el catalogo antes de cambiar tags.',
    no_duplicates: 'No hay duplicados en la ultima sincronizacion.',
    btn_print_duplicates: 'Imprimir duplicados',
    sync_err: 'Error al sincronizar',
    sync_partial: pages => `Procesando catalogo completo: ${pages} tandas revisadas.`,
    sync_done: 'Sincronizacion completa.',
    duplicate_badge: 'Duplicado',
    list_err: 'Error al cargar la lista',
    loading: 'Cargando…',
    missing: 'falta',
    tags_ready: 'tags listos',
    print_title: 'Cambios de precio — tags pendientes',
    print_print: '🖨️ Imprimir',
    print_reload: '↻ Actualizar',
    print_empty: 'No hay cambios de precio pendientes. Sincroniza en la app primero.',
    print_missing_title: 'Productos que no estan en Square',
    print_missing_empty: 'No hay productos fuera del catalogo de Square.',
    print_duplicates_title: 'Productos duplicados en Square',
    print_duplicates_empty: 'No hay duplicados para imprimir.',
    print_load_err: 'Error al cargar',
    h_product: 'Producto',
    h_price: 'Precio',
    h_last_price: 'Ultimo precio',
    h_barcode: 'Barcode',
    h_tag: 'Tag cambiado',
    locale: 'es-US',
  },
  en: {
    title: 'Price changes',
    tab_scan: 'Change price',
    tab_photo: 'Large photo',
    tab_list: 'List',
    scan_hint: 'Scan or type the product barcode.',
    photo_hint: 'Scan to see the photo enlarged.',
    changes_hint: 'Check Square only for price changes. Duplicates and inventory movement are in Inventory Audit.',
    ph_barcode: 'Barcode / SKU',
    btn_search: 'Search',
    btn_view: 'View',
    btn_camera: 'Scan with camera',
    scanner_title: 'Scan barcode',
    scanner_hint: 'Point the camera at the barcode until it fills the frame.',
    scanner_close: 'Close',
    scanner_permission_err: 'Camera permission was blocked on this device.',
    scanner_not_found_err: 'No camera was found on this device.',
    scanner_start_err: 'Camera scanner could not start.',
    btn_sync: 'Find price changes',
    btn_print: 'Print list (with barcodes)',
    searching: 'Searching…',
    syncing: 'Syncing…',
    not_found: 'Not found',
    not_in_square: 'Product not found in Square',
    search_err: 'Error searching',
    no_photo: 'No photo in Square',
    no_photo_long: 'This product has no photo in Square',
    barcode_label: 'Barcode',
    previous: 'Previous',
    new_price: 'New',
    current_price: 'Current price',
    price_changed: '⚠️ Price changed — tags pending',
    price_uptodate: '✓ Price up to date',
    store_pending: s => `Store ${s} pending`,
    store_done: s => `Store ${s} ✓`,
    tag_changed_store: s => `Tag changed — store ${s}`,
    tag_changed_all: 'Tag changed - all locations',
    toast_tag: s => `✓ Store ${s} tag marked`,
    toast_done: '✓ Both stores done. New price saved.',
    toast_tag_err: 'Error marking the tag',
    col_products: 'products',
    col_changed: 'changed',
    col_unchanged: 'unchanged',
    col_new: 'new',
    col_missing_catalog: 'not in Square',
    col_duplicates: 'duplicates',
    conflicts: n => `${n} duplicate barcodes with different prices, marked as duplicates.`,
    no_changes: 'No pending price changes.',
    missing_catalog_title: 'Not in Square',
    missing_catalog_hint: 'Products stored in the app that did not appear in the last complete Square sync.',
    no_missing_catalog: 'No products are missing from the Square catalog.',
    btn_print_missing: 'Print not in Square',
    duplicates_title: 'Duplicates',
    duplicates_hint: 'Barcodes Square returned more than once or with different prices. Review the catalog before changing tags.',
    no_duplicates: 'No duplicates in the last sync.',
    btn_print_duplicates: 'Print duplicates',
    sync_err: 'Error syncing',
    sync_partial: pages => `Processing full catalog: ${pages} batches checked.`,
    sync_done: 'Sync complete.',
    duplicate_badge: 'Duplicate',
    list_err: 'Error loading the list',
    loading: 'Loading…',
    missing: 'missing',
    tags_ready: 'tags ready',
    print_title: 'Price changes — tags pending',
    print_print: '🖨️ Print',
    print_reload: '↻ Refresh',
    print_empty: 'No pending price changes. Sync in the app first.',
    print_missing_title: 'Products not in Square',
    print_missing_empty: 'No products are missing from the Square catalog.',
    print_duplicates_title: 'Duplicate products in Square',
    print_duplicates_empty: 'No duplicates to print.',
    print_load_err: 'Error loading',
    h_product: 'Product',
    h_price: 'Price',
    h_last_price: 'Last price',
    h_barcode: 'Barcode',
    h_tag: 'Tag changed',
    locale: 'en-US',
  },
};

// Hook for the interactive page: returns the current dictionary plus a toggle.
export function usePriceLang() {
  const [lang, setLang] = useState<PriceLang>(getPriceLang);
  const toggle = useCallback(() => {
    setLang(prev => {
      const next: PriceLang = prev === 'es' ? 'en' : 'es';
      setStoredPriceLang(next);
      return next;
    });
  }, []);
  return { lang, t: PRICE_I18N[lang], toggle };
}
