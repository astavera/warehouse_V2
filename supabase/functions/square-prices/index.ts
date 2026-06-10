// =====================================================================
//  Edge Function: square-prices
//  Ported from the standalone "square-precios" app (server.js + square.js +
//  db.js). Single function dispatched by an `action` field in the body, like
//  the kiosk-auth function.
//
//  Security:
//   - Runs with verify_jwt (default) -> only logged-in warehouse users.
//   - The Square access token lives ONLY here as a Supabase secret; it never
//     reaches the browser.
//   - Writes to public.square_price_products with the service-role key
//     (the table has RLS enabled and no client policies).
// =====================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const SQUARE_ENV = Deno.env.get('SQUARE_ENV') === 'production' ? 'production' : 'sandbox';
const ACCESS_TOKEN = Deno.env.get('SQUARE_ACCESS_TOKEN') || '';
const API_VERSION = Deno.env.get('SQUARE_API_VERSION') || '2025-01-23';
const BASE_URL =
  SQUARE_ENV === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Reflect whatever headers the browser asks for in the preflight, so an extra
// header added by a newer supabase-js never breaks the CORS preflight.
function corsFor(req: Request): Record<string, string> {
  const requested = req.headers.get('access-control-request-headers');
  return requested
    ? { ...corsHeaders, 'Access-Control-Allow-Headers': requested }
    : corsHeaders;
}

function jsonResponse(body: unknown, status = 200, cors: Record<string, string> = corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ---------------------------------------------------------------------
//  Square Catalog API client (ported from square.js)
// ---------------------------------------------------------------------
type SquareError = Error & { status?: number; squareErrors?: unknown };

type SquareCatalogObject = {
  id: string;
  type?: string;
  category_data?: {
    name?: string;
  };
  item_data?: {
    category_id?: string;
    categories?: { id?: string; ordinal?: number }[];
    image_ids?: string[];
    name?: string;
    reporting_category?: { id?: string; ordinal?: number };
    variations?: SquareCatalogObject[];
  };
  image_data?: {
    url?: string;
  };
  item_variation_data?: {
    item_id?: string;
    name?: string;
    price_money?: {
      amount?: number;
      currency?: string;
    };
    sku?: string | number;
    upc?: string | number;
  };
};

type SquareCatalogResponse = {
  objects?: SquareCatalogObject[];
  related_objects?: SquareCatalogObject[];
  object?: SquareCatalogObject;
  cursor?: string;
  errors?: { detail?: string; message?: string }[];
  raw?: string;
};

async function squareFetch<T = SquareCatalogResponse>(
  path: string,
  { method = 'GET', body, retries = 3 }: { method?: string; body?: unknown; retries?: number } = {}
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          'Square-Version': API_VERSION,
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (netErr) {
      lastErr = netErr;
      await sleep(400 * (attempt + 1));
      continue;
    }

    const text = await res.text();
    let data: (T & { errors?: { detail?: string; message?: string }[]; raw?: string }) = {} as T;
    try {
      data = (text ? JSON.parse(text) : {}) as T & {
        errors?: { detail?: string; message?: string }[];
        raw?: string;
      };
    } catch {
      data = { raw: text } as T & { raw?: string };
    }

    if (res.ok) return data;

    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(500 * (attempt + 1));
      continue;
    }

    const detail = data?.errors?.[0]?.detail || `HTTP ${res.status}`;
    const err = new Error(`Square API: ${detail}`) as SquareError;
    err.status = res.status;
    err.squareErrors = data?.errors;
    throw err;
  }
  const err = new Error(
    `Square API: sin respuesta (${(lastErr as Error)?.message || 'red'})`
  ) as SquareError;
  err.status = 503;
  throw err;
}

async function searchVariationByAttribute(attribute_name: string, value: string) {
  return await squareFetch('/v2/catalog/search', {
    method: 'POST',
    body: {
      object_types: ['ITEM_VARIATION'],
      include_related_objects: true,
      query: { exact_query: { attribute_name, attribute_value: value } },
      limit: 1,
    },
  });
}

function findImageUrl(
  itemObject: SquareCatalogObject | null | undefined,
  relatedObjects: SquareCatalogObject[] = []
): string | null {
  const imageIds = itemObject?.item_data?.image_ids || [];
  if (imageIds.length === 0) return null;
  const img = relatedObjects.find(o => o.type === 'IMAGE' && imageIds.includes(o.id));
  return img?.image_data?.url || null;
}

type LiveProduct = {
  found: boolean;
  barcode: string;
  reason?: string;
  matchedField?: string;
  itemId?: string;
  variationId?: string;
  name?: string;
  variationName?: string | null;
  imageUrl?: string | null;
  priceCents?: number | null;
  price?: number | null;
  currency?: string;
};

async function lookupByBarcode(barcode: string): Promise<LiveProduct> {
  const code = String(barcode).trim();
  if (!code) return { found: false, barcode: code, reason: 'Barcode vacio' };

  let result: SquareCatalogResponse | null = null;
  let matchedField: string | null = null;

  for (const field of ['sku', 'upc']) {
    const data = await searchVariationByAttribute(field, code);
    if (data.objects && data.objects.length > 0) {
      result = data;
      matchedField = field;
      break;
    }
  }

  if (!result) {
    return { found: false, barcode: code, reason: 'Producto no encontrado en Square' };
  }

  const variation = result.objects?.[0];
  if (!variation) {
    return { found: false, barcode: code, reason: 'Producto no encontrado en Square' };
  }

  const variationData = variation.item_variation_data || {};
  const itemId = variationData.item_id;

  const related = result.related_objects || [];
  let itemObject = related.find(o => o.type === 'ITEM' && o.id === itemId);

  let imageRelated = related;
  if (!itemObject || !findImageUrl(itemObject, related)) {
    try {
      const full = await squareFetch(
        `/v2/catalog/object/${itemId}?include_related_objects=true`
      );
      itemObject = full.object || itemObject;
      imageRelated = full.related_objects || related;
    } catch {
      // keep what we have
    }
  }

  const priceMoney = variationData.price_money || {};
  const amount = typeof priceMoney.amount === 'number' ? priceMoney.amount : null;

  return {
    found: true,
    barcode: code,
    matchedField: matchedField || undefined,
    itemId,
    variationId: variation.id,
    name: itemObject?.item_data?.name || variationData.name || 'Sin nombre',
    variationName: variationData.name || null,
    imageUrl: findImageUrl(itemObject, imageRelated),
    priceCents: amount,
    price: amount != null ? amount / 100 : null,
    currency: priceMoney.currency || 'USD',
  };
}

type Variation = {
  barcode: string;
  categories: { id: string; name: string }[];
  itemId: string;
  variationId: string;
  name: string;
  priceCents: number | null;
  currency: string;
};

const SYNC_PAGE_LIMIT = 250;

async function listVariationPage(cursor: string | null): Promise<{
  variations: Variation[];
  nextCursor: string | null;
}> {
  const out: Variation[] = [];

  const data = await squareFetch('/v2/catalog/search', {
    method: 'POST',
    body: {
      object_types: ['ITEM'],
      include_deleted_objects: false,
      include_related_objects: true,
      limit: SYNC_PAGE_LIMIT,
      ...(cursor ? { cursor } : {}),
    },
  });

  const categoryNames = new Map<string, string>();
  for (const related of data.related_objects || []) {
    if (related.type !== 'CATEGORY') continue;
    categoryNames.set(related.id, related.category_data?.name || related.id);
  }

  for (const item of data.objects || []) {
    if (item.type !== 'ITEM') continue;
    const itemName = item.item_data?.name || 'Sin nombre';
    const variations = item.item_data?.variations || [];
    const categoryIds = [
      ...(item.item_data?.categories || []).map(category => category.id).filter(Boolean),
      item.item_data?.category_id,
      item.item_data?.reporting_category?.id,
    ].filter((id): id is string => Boolean(id));
    const categories = [...new Set(categoryIds)].map(id => ({
      id,
      name: categoryNames.get(id) || id,
    }));
    for (const v of variations) {
      const vd = v.item_variation_data || {};
      const barcode = vd.sku || vd.upc || null;
      if (!barcode) continue;
      const priceMoney = vd.price_money || {};
      out.push({
        barcode: String(barcode).trim(),
        categories,
        itemId: item.id,
        variationId: v.id,
        name: variations.length > 1 && vd.name ? `${itemName} - ${vd.name}` : itemName,
        priceCents: typeof priceMoney.amount === 'number' ? priceMoney.amount : null,
        currency: priceMoney.currency || 'USD',
      });
    }
  }

  return { variations: out, nextCursor: data.cursor || null };
}

type SquareInventoryChange = {
  type?: string;
  physical_count?: {
    catalog_object_id?: string;
  };
  adjustment?: {
    catalog_object_id?: string;
  };
  transfer?: {
    catalog_object_id?: string;
  };
};

type SquareInventoryChangesResponse = {
  changes?: SquareInventoryChange[];
  cursor?: string;
  errors?: { detail?: string; message?: string }[];
};

function inventoryChangeObjectId(change: SquareInventoryChange) {
  return (
    change.physical_count?.catalog_object_id ||
    change.adjustment?.catalog_object_id ||
    change.transfer?.catalog_object_id ||
    null
  );
}

async function listInventoryMovementIds(catalogObjectIds: string[]) {
  const uniqueIds = [...new Set(catalogObjectIds.filter(Boolean))];
  const withMovement = new Set<string>();

  for (let i = 0; i < uniqueIds.length; i += 500) {
    const chunk = uniqueIds.slice(i, i + 500);
    let cursor: string | null = null;

    do {
      const data = await squareFetch<SquareInventoryChangesResponse>(
        '/v2/inventory/changes/batch-retrieve',
        {
          method: 'POST',
          body: {
            catalog_object_ids: chunk,
            limit: 1000,
            ...(cursor ? { cursor } : {}),
          },
        }
      );

      for (const change of data.changes || []) {
        const id = inventoryChangeObjectId(change);
        if (id) withMovement.add(id);
      }

      cursor = data.cursor || null;
    } while (cursor && chunk.some(id => !withMovement.has(id)));
  }

  return withMovement;
}

// ---------------------------------------------------------------------
//  Data layer (ported from db.js) backed by Postgres via supabase-js
// ---------------------------------------------------------------------
const TABLE = 'square_price_products';

type ProductRow = {
  barcode: string;
  item_id: string | null;
  variation_id: string | null;
  name: string | null;
  image_url: string | null;
  old_price: number | null;
  last_seen_price: number | null;
  currency: string;
  tag_72: boolean;
  tag_86: boolean;
  conflict: boolean;
  updated_at?: string;
};

type Db = ReturnType<typeof createClient>;

async function getProduct(db: Db, barcode: string): Promise<ProductRow | null> {
  const { data, error } = await db.from(TABLE).select('*').eq('barcode', barcode).maybeSingle();
  if (error) throw error;
  return (data as ProductRow) || null;
}

async function upsertProduct(db: Db, row: Partial<ProductRow> & { barcode: string }) {
  const payload = { ...row, updated_at: new Date().toISOString() };
  const { data, error } = await db.from(TABLE).upsert(payload, { onConflict: 'barcode' }).select('*').single();
  if (error) throw error;
  return data as ProductRow;
}

function decorate(row: ProductRow | null) {
  if (!row) return row;
  const changePending =
    row.last_seen_price != null &&
    row.old_price != null &&
    row.last_seen_price !== row.old_price;

  return {
    ...row,
    oldPrice: row.old_price != null ? row.old_price / 100 : null,
    currentPrice: row.last_seen_price != null ? row.last_seen_price / 100 : null,
    changePending,
    pendingStores: changePending
      ? [...(row.tag_72 ? [] : [72]), ...(row.tag_86 ? [] : [86])]
      : [],
    confirmedStores: [...(row.tag_72 ? [72] : []), ...(row.tag_86 ? [86] : [])],
  };
}

async function recordLookup(db: Db, live: LiveProduct) {
  const existing = await getProduct(db, live.barcode);
  const now = live.priceCents ?? null;

  if (!existing) {
    const saved = await upsertProduct(db, {
      barcode: live.barcode,
      item_id: live.itemId ?? null,
      variation_id: live.variationId ?? null,
      name: live.name ?? null,
      image_url: live.imageUrl ?? null,
      old_price: now,
      last_seen_price: now,
      currency: live.currency || 'USD',
      tag_72: false,
      tag_86: false,
      conflict: false,
    });
    return decorate(saved);
  }

  const priceChanged =
    now != null && existing.last_seen_price != null && now !== existing.last_seen_price;

  const saved = await upsertProduct(db, {
    barcode: live.barcode,
    item_id: live.itemId ?? null,
    variation_id: live.variationId ?? null,
    name: live.name ?? null,
    image_url: live.imageUrl ?? null,
    old_price: existing.old_price, // held until both stores confirm
    last_seen_price: now,
    currency: live.currency || 'USD',
    tag_72: priceChanged ? false : existing.tag_72,
    tag_86: priceChanged ? false : existing.tag_86,
    conflict: existing.conflict,
  });

  return decorate(saved);
}

async function confirmTag(db: Db, barcode: string, store: 72 | 86) {
  const existing = await getProduct(db, barcode);
  if (!existing) {
    const err = new Error('Producto no escaneado todavia') as SquareError;
    err.status = 404;
    throw err;
  }

  const next: Partial<ProductRow> & { barcode: string } = {
    barcode: existing.barcode,
    item_id: existing.item_id,
    variation_id: existing.variation_id,
    name: existing.name,
    image_url: existing.image_url,
    old_price: existing.old_price,
    last_seen_price: existing.last_seen_price,
    currency: existing.currency,
    tag_72: store === 72 ? true : existing.tag_72,
    tag_86: store === 86 ? true : existing.tag_86,
    conflict: existing.conflict,
  };

  // Both stores confirmed -> promote new price to old and reset flags.
  if (next.tag_72 && next.tag_86) {
    next.old_price = existing.last_seen_price;
    next.tag_72 = false;
    next.tag_86 = false;
  }

  const saved = await upsertProduct(db, next);
  return decorate(saved);
}

async function syncVariations(db: Db, variations: Variation[]) {
  // 1) Group by barcode.
  const groups = new Map<string, { rep: Variation; variations: Variation[]; prices: Set<number> }>();
  for (const v of variations) {
    if (!v.barcode) continue;
    let g = groups.get(v.barcode);
    if (!g) {
      g = { rep: v, variations: [], prices: new Set<number>() };
      groups.set(v.barcode, g);
    }
    g.variations.push(v);
    if (v.priceCents != null) g.prices.add(v.priceCents);
  }

  let nuevos = 0;
  let cambiados = 0;
  let sinCambio = 0;
  let conflictos = 0;
  let duplicadosOmitidos = 0;

  const barcodes = [...groups.keys()];
  // Load existing rows in chunks to avoid a query per barcode.
  const existingMap = new Map<string, ProductRow>();
  for (let i = 0; i < barcodes.length; i += 500) {
    const chunk = barcodes.slice(i, i + 500);
    const { data, error } = await db.from(TABLE).select('*').in('barcode', chunk);
    if (error) throw error;
    for (const row of (data as ProductRow[]) || []) existingMap.set(row.barcode, row);
  }

  const toUpsert: (Partial<ProductRow> & { barcode: string })[] = [];

  for (const [barcode, g] of groups) {
    const v = g.rep;
    const isDuplicate = g.variations.length > 1;
    const isConflict = isDuplicate || g.prices.size > 1;
    const now = g.prices.size === 1 ? [...g.prices][0] : v.priceCents;
    const existing = existingMap.get(barcode);

    if (isConflict) {
      conflictos++;
      duplicadosOmitidos++;
      continue;
    }

    if (!existing) {
      toUpsert.push({
        barcode,
        item_id: v.itemId,
        variation_id: v.variationId,
        name: v.name,
        image_url: null,
        old_price: now,
        last_seen_price: now,
        currency: v.currency,
        tag_72: false,
        tag_86: false,
        conflict: isConflict,
      });
      if (!isConflict) nuevos++;
      continue;
    }

    const priceChanged =
      !isConflict && now != null && existing.old_price != null && now !== existing.old_price;

    toUpsert.push({
      barcode,
      item_id: v.itemId,
      variation_id: v.variationId,
      name: v.name,
      image_url: existing.image_url, // sync brings no images
      old_price: existing.old_price,
      last_seen_price: now,
      currency: v.currency,
      tag_72: priceChanged ? false : existing.tag_72,
      tag_86: priceChanged ? false : existing.tag_86,
      conflict: isConflict,
    });

    if (priceChanged) cambiados++;
    else if (!isConflict) sinCambio++;
  }

  // Batch upserts.
  const stamped = toUpsert.map(r => ({ ...r, updated_at: new Date().toISOString() }));
  for (let i = 0; i < stamped.length; i += 500) {
    const chunk = stamped.slice(i, i + 500);
    const { error } = await db.from(TABLE).upsert(chunk, { onConflict: 'barcode' });
    if (error) throw error;
  }

  return {
    total: variations.length,
    unicos: groups.size,
    nuevos,
    cambiados,
    sinCambio,
    conflictos,
    duplicadosOmitidos,
  };
}

async function listChanges(db: Db) {
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('conflict', false)
    .not('last_seen_price', 'is', null)
    .not('old_price', 'is', null)
    .order('name', { ascending: true });
  if (error) throw error;
  const rows = ((data as ProductRow[]) || []).filter(r => r.last_seen_price !== r.old_price);
  return rows.map(decorate);
}

// ---------------------------------------------------------------------
//  HTTP dispatch
// ---------------------------------------------------------------------
Deno.serve(async req => {
  const cors = corsFor(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Missing Supabase secrets' }, 500);
    }

    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const payload = await req.json().catch(() => ({}));
    const action = typeof payload.action === 'string' ? payload.action : '';

    const tokenSet = !!ACCESS_TOKEN && ACCESS_TOKEN !== 'PEGA_AQUI_TU_TOKEN';

    if (action === 'health') {
      return jsonResponse({ ok: true, environment: SQUARE_ENV, tokenConfigured: tokenSet });
    }

    if (!tokenSet && (action === 'lookup' || action === 'sync' || action === 'audit')) {
      return jsonResponse({ error: 'SQUARE_ACCESS_TOKEN no esta configurado en el servidor.' }, 500);
    }

    if (action === 'lookup') {
      const barcode = String(payload.barcode ?? '').trim();
      const live = await lookupByBarcode(barcode);
      if (!live.found) return jsonResponse(live);
      const record = await recordLookup(db, live);
      return jsonResponse({
        found: true,
        barcode: record!.barcode,
        name: record!.name,
        imageUrl: record!.image_url,
        currency: record!.currency,
        oldPrice: record!.oldPrice,
        currentPrice: record!.currentPrice,
        changePending: record!.changePending,
        pendingStores: record!.pendingStores,
        confirmedStores: record!.confirmedStores,
        matchedField: live.matchedField,
      });
    }

    if (action === 'tag') {
      const barcode = String(payload.barcode ?? '').trim();
      const store = Number(payload.store);
      if (store !== 72 && store !== 86) {
        return jsonResponse({ error: 'store debe ser 72 o 86' }, 400);
      }
      const record = await confirmTag(db, barcode, store as 72 | 86);
      return jsonResponse({
        ok: true,
        barcode: record!.barcode,
        name: record!.name,
        imageUrl: record!.image_url,
        currency: record!.currency,
        oldPrice: record!.oldPrice,
        currentPrice: record!.currentPrice,
        changePending: record!.changePending,
        pendingStores: record!.pendingStores,
        confirmedStores: record!.confirmedStores,
      });
    }

    if (action === 'sync') {
      const cursor = typeof payload.cursor === 'string' && payload.cursor ? payload.cursor : null;
      const { variations, nextCursor } = await listVariationPage(cursor);
      const summary = await syncVariations(db, variations);
      return jsonResponse({
        ok: true,
        ...summary,
        cursor: nextCursor,
        hasMore: Boolean(nextCursor),
        complete: !nextCursor,
      });
    }

    if (action === 'audit') {
      const cursor = typeof payload.cursor === 'string' && payload.cursor ? payload.cursor : null;
      const { variations, nextCursor } = await listVariationPage(cursor);
      const movementIds = await listInventoryMovementIds(variations.map(v => v.variationId));
      return jsonResponse({
        ok: true,
        total: variations.length,
        products: variations.map(v => ({
          barcode: v.barcode,
          categories: v.categories,
          itemId: v.itemId,
          variationId: v.variationId,
          name: v.name,
          currentPrice: v.priceCents != null ? v.priceCents / 100 : null,
          currency: v.currency,
          hasInventoryMovement: movementIds.has(v.variationId),
        })),
        cursor: nextCursor,
        hasMore: Boolean(nextCursor),
        complete: !nextCursor,
      });
    }

    if (action === 'changes') {
      const changes = (await listChanges(db)).map(r => ({
        barcode: r!.barcode,
        name: r!.name,
        currency: r!.currency,
        oldPrice: r!.oldPrice,
        currentPrice: r!.currentPrice,
        pendingStores: r!.pendingStores,
        confirmedStores: r!.confirmedStores,
        conflict: r!.conflict,
      }));
      return jsonResponse({ ok: true, count: changes.length, changes });
    }

    return jsonResponse({ error: `Accion no soportada: ${action || '(vacia)'}` }, 400);
  } catch (error) {
    const err = error as SquareError;
    return jsonResponse(
      { error: err?.message || 'Error desconocido', squareErrors: err?.squareErrors },
      err?.status || 500
    );
  }
});
