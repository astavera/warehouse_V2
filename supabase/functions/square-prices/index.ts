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
const SEBASTIAN_ADMIN_AUTH_USER_ID = 'e7bb5b60-b264-49b2-8358-81d0f3c37b09';
const SEBASTIAN_ADMIN_EMPLOYEE_ID = '77f47458-3aa1-4fdb-a08a-8e7924671ec1';
const PRICE_ADMIN_ACTIONS = new Set(['sync', 'changes', 'catalog-missing', 'duplicates']);

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
  is_deleted?: boolean;
  present_at_all_locations?: boolean;
  present_at_location_ids?: string[];
  custom_attribute_values?: Record<string, SquareCatalogCustomAttributeValue>;
  category_data?: {
    name?: string;
  };
  item_data?: {
    category_id?: string;
    categories?: { id?: string; ordinal?: number }[];
    image_ids?: string[];
    is_archived?: boolean;
    name?: string;
    reporting_category?: { id?: string; ordinal?: number };
    variations?: SquareCatalogObject[];
  };
  image_data?: {
    url?: string;
  };
  custom_attribute_definition_data?: {
    key?: string;
    name?: string;
    type?: string;
    selection_config?: {
      allowed_selections?: { uid?: string; name?: string }[];
    };
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

type SquareCatalogCustomAttributeValue = {
  key?: string;
  name?: string;
  type?: string;
  custom_attribute_definition_id?: string;
  string_value?: string;
  number_value?: string | number;
  boolean_value?: boolean;
  selection_uid_values?: string[];
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
      include_deleted_objects: false,
      include_related_objects: true,
      query: { exact_query: { attribute_name, attribute_value: value } },
      limit: 1,
    },
  });
}

function isDeletedCatalogObject(object: SquareCatalogObject | null | undefined) {
  return object?.is_deleted === true;
}

function isPresentInAnyLocation(object: SquareCatalogObject | null | undefined) {
  if (!object) return false;
  if (object.present_at_all_locations !== false) return true;
  return Array.isArray(object.present_at_location_ids) && object.present_at_location_ids.length > 0;
}

function isArchivedCatalogItem(object: SquareCatalogObject | null | undefined) {
  return object?.type === 'ITEM' && object.item_data?.is_archived === true;
}

function isLiveCatalogObject(object: SquareCatalogObject | null | undefined) {
  return !isDeletedCatalogObject(object) && !isArchivedCatalogItem(object) && isPresentInAnyLocation(object);
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

const UNCATEGORIZED_CATEGORY = 'Uncategorized';
const UNKNOWN_VENDOR = 'Unknown vendor';
const VENDOR_ATTRIBUTE_KEYS = [
  'vendor',
  'supplier',
  'proveedor',
  'brand',
  'marca',
  'manufacturer',
  'maker',
  'distributor',
  'distribuidor',
  'wholesale',
  'wholesaler',
];

type CustomAttributeDefinitionIndex = {
  namesById: Map<string, string>;
  namesByKey: Map<string, string>;
  selectionNamesByDefinitionId: Map<string, Map<string, string>>;
};

let customAttributeDefinitionIndexCache: Promise<CustomAttributeDefinitionIndex> | null = null;

function mainCategory(categoryName: string | null | undefined) {
  const trimmed = String(categoryName || '').trim();
  if (!trimmed) return UNCATEGORIZED_CATEGORY;
  return trimmed.split('/')[0]?.trim() || UNCATEGORIZED_CATEGORY;
}

function categoriesForItem(
  itemObject: SquareCatalogObject | null | undefined,
  relatedObjects: SquareCatalogObject[] = []
) {
  if (!itemObject?.item_data) return [];

  const categoryNames = new Map<string, string>();
  for (const related of relatedObjects) {
    if (related.type !== 'CATEGORY') continue;
    categoryNames.set(related.id, related.category_data?.name || related.id);
  }

  const refs = [
    ...(itemObject.item_data.categories || []),
    itemObject.item_data.category_id ? { id: itemObject.item_data.category_id } : null,
    itemObject.item_data.reporting_category?.id
      ? {
          id: itemObject.item_data.reporting_category.id,
          ordinal: itemObject.item_data.reporting_category.ordinal,
        }
      : null,
  ].filter((category): category is { id?: string; ordinal?: number } => Boolean(category?.id));

  const seen = new Set<string>();
  return refs
    .sort((a, b) => (a.ordinal ?? 999_999) - (b.ordinal ?? 999_999))
    .filter(category => {
      const id = category.id || '';
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map(category => ({
      id: category.id!,
      name: categoryNames.get(category.id!) || category.id!,
    }));
}

function categoryNameFromCategories(categories: { id: string; name: string }[]) {
  return categories.find(category => category.name.trim())?.name.trim() || UNCATEGORIZED_CATEGORY;
}

async function getCustomAttributeDefinitionIndex(): Promise<CustomAttributeDefinitionIndex> {
  if (customAttributeDefinitionIndexCache) return customAttributeDefinitionIndexCache;

  customAttributeDefinitionIndexCache = (async () => {
    const index: CustomAttributeDefinitionIndex = {
      namesById: new Map(),
      namesByKey: new Map(),
      selectionNamesByDefinitionId: new Map(),
    };

    try {
      let cursor: string | null = null;
      do {
        const data = await squareFetch('/v2/catalog/search', {
          method: 'POST',
          body: {
            object_types: ['CUSTOM_ATTRIBUTE_DEFINITION'],
            include_deleted_objects: false,
            limit: 100,
            ...(cursor ? { cursor } : {}),
          },
        });

        for (const object of data.objects || []) {
          if (object.type !== 'CUSTOM_ATTRIBUTE_DEFINITION') continue;
          const definition = object.custom_attribute_definition_data;
          if (!definition) continue;

          const name = definition.name || definition.key || object.id;
          index.namesById.set(object.id, name);
          if (definition.key) index.namesByKey.set(definition.key, name);

          const selections = new Map<string, string>();
          for (const selection of definition.selection_config?.allowed_selections || []) {
            if (selection.uid && selection.name) selections.set(selection.uid, selection.name);
          }
          if (selections.size > 0) index.selectionNamesByDefinitionId.set(object.id, selections);
        }

        cursor = data.cursor || null;
      } while (cursor);
    } catch {
      // Keep price checks working even when custom attribute definitions are not visible.
    }

    return index;
  })();

  return customAttributeDefinitionIndexCache;
}

function customAttributeText(
  value: SquareCatalogCustomAttributeValue | undefined,
  definitions: CustomAttributeDefinitionIndex
) {
  if (!value) return null;
  if (typeof value.string_value === 'string' && value.string_value.trim()) {
    return value.string_value.trim();
  }
  if (typeof value.number_value === 'number') return String(value.number_value);
  if (typeof value.number_value === 'string' && value.number_value.trim()) {
    return value.number_value.trim();
  }
  if (typeof value.boolean_value === 'boolean') return value.boolean_value ? 'Yes' : 'No';
  if (value.custom_attribute_definition_id && value.selection_uid_values?.length) {
    const selections = definitions.selectionNamesByDefinitionId.get(value.custom_attribute_definition_id);
    const names = value.selection_uid_values
      .map(uid => selections?.get(uid))
      .filter((name): name is string => Boolean(name?.trim()));
    if (names.length > 0) return names.join(', ');
  }
  return null;
}

function vendorNameFromObjects(
  definitions: CustomAttributeDefinitionIndex,
  ...objects: Array<SquareCatalogObject | null | undefined>
) {
  for (const object of objects) {
    const attributes = object?.custom_attribute_values || {};
    for (const [key, value] of Object.entries(attributes)) {
      const definitionName = value?.custom_attribute_definition_id
        ? definitions.namesById.get(value.custom_attribute_definition_id)
        : null;
      const keyName = value?.key ? definitions.namesByKey.get(value.key) : null;
      const label = `${key} ${value?.key || ''} ${value?.name || ''} ${definitionName || ''} ${keyName || ''}`.toLowerCase();
      if (!VENDOR_ATTRIBUTE_KEYS.some(candidate => label.includes(candidate))) continue;
      const vendor = customAttributeText(value, definitions);
      if (vendor) return vendor;
    }
  }

  return UNKNOWN_VENDOR;
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
  categories?: { id: string; name: string }[];
  vendorName?: string;
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

  const variation = result.objects?.find(isLiveCatalogObject);
  if (!variation) {
    return { found: false, barcode: code, reason: 'Producto no encontrado en Square' };
  }

  const variationData = variation.item_variation_data || {};
  const itemId = variationData.item_id;

  const related = result.related_objects || [];
  let itemObject = related.find(o => o.type === 'ITEM' && o.id === itemId && isLiveCatalogObject(o));
  let imageRelated = related;

  if (itemId) {
    try {
      const full = await squareFetch(
        `/v2/catalog/object/${itemId}?include_related_objects=true`
      );
      if (!isLiveCatalogObject(full.object)) {
        return { found: false, barcode: code, reason: 'Producto no encontrado en Square' };
      }
      itemObject = isLiveCatalogObject(full.object) ? full.object || itemObject : itemObject;
      imageRelated = full.related_objects || related;
    } catch {
      // keep searching with the data returned by the exact lookup
    }
  }

  if (!itemObject) {
    return { found: false, barcode: code, reason: 'Producto no encontrado en Square' };
  }

  let categories = categoriesForItem(itemObject, imageRelated);
  if (
    !findImageUrl(itemObject, related) ||
    categories.length === 0 ||
    categories.some(category => category.name === category.id)
  ) {
    try {
      const full = await squareFetch(
        `/v2/catalog/object/${itemId}?include_related_objects=true`
      );
      itemObject = isLiveCatalogObject(full.object) ? full.object || itemObject : itemObject;
      imageRelated = full.related_objects || related;
      categories = categoriesForItem(itemObject, imageRelated);
    } catch {
      // keep what we have
    }
  }

  const priceMoney = variationData.price_money || {};
  const amount = typeof priceMoney.amount === 'number' ? priceMoney.amount : null;
  const customAttributeDefinitions = await getCustomAttributeDefinitionIndex();

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
    categories,
    vendorName: vendorNameFromObjects(customAttributeDefinitions, variation, itemObject),
  };
}

type Variation = {
  barcode: string;
  sku: string | null;
  upc: string | null;
  categories: { id: string; name: string }[];
  vendorName: string;
  itemId: string;
  variationId: string;
  name: string;
  priceCents: number | null;
  currency: string;
};

const SYNC_PAGE_LIMIT = 1000;
const CHANGE_VERIFICATION_STALE_MS = 5000;

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
  const customAttributeDefinitions = await getCustomAttributeDefinitionIndex();

  for (const item of data.objects || []) {
    if (item.type !== 'ITEM') continue;
    if (!isLiveCatalogObject(item)) continue;
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
      if (!isLiveCatalogObject(v)) continue;
      const vd = v.item_variation_data || {};
      const sku = vd.sku != null ? String(vd.sku).trim() : '';
      const upc = vd.upc != null ? String(vd.upc).trim() : '';
      const barcode = sku || upc || null;
      if (!barcode) continue;
      const priceMoney = vd.price_money || {};
      out.push({
        barcode: String(barcode).trim(),
        sku: sku || null,
        upc: upc || null,
        categories,
        vendorName: vendorNameFromObjects(customAttributeDefinitions, v, item),
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
const VENDOR_MAPPING_TABLE = 'square_price_vendor_mappings';

type ProductRow = {
  barcode: string;
  item_id: string | null;
  variation_id: string | null;
  name: string | null;
  image_url: string | null;
  category_name: string | null;
  primary_category: string | null;
  vendor_name: string | null;
  old_price: number | null;
  last_seen_price: number | null;
  currency: string;
  tag_72: boolean;
  tag_86: boolean;
  conflict: boolean;
  catalog_missing: boolean;
  catalog_missing_since?: string | null;
  last_square_sync_run?: string | null;
  last_square_change_verified_at?: string | null;
  updated_at?: string;
};

type Db = ReturnType<typeof createClient>;

type VendorMappingRow = {
  barcode: string;
  vendor_name: string;
};

type VendorMappingInput = {
  barcode: string;
  vendorName: string;
};

type VendorMappingStatusRow = {
  mapping_count: number;
  mapped_products: number;
  unknown_products: number;
  changed_products: number;
  changed_unknown_products: number;
  last_import_at: string | null;
};

function cleanText(value: unknown) {
  return String(value ?? '').trim();
}

function isKnownVendorName(value: string | null | undefined) {
  const cleaned = cleanText(value);
  return Boolean(cleaned) && cleaned.toLowerCase() !== UNKNOWN_VENDOR.toLowerCase();
}

function bestVendorName(squareVendor: string | null | undefined, mappedVendor: string | null | undefined) {
  const cleanedSquareVendor = cleanText(squareVendor);
  if (isKnownVendorName(cleanedSquareVendor)) return cleanedSquareVendor;

  const cleanedMappedVendor = cleanText(mappedVendor);
  return cleanedMappedVendor || UNKNOWN_VENDOR;
}

function validIsoDate(value: unknown) {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? value : null;
}

function bearerToken(req: Request) {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return (match?.[1] || '').trim();
}

async function getRequestEmployee(db: Db, req: Request) {
  const token = bearerToken(req);
  if (!token) {
    const err = new Error('Not authenticated') as SquareError;
    err.status = 401;
    throw err;
  }

  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData?.user) {
    const err = new Error('Not authenticated') as SquareError;
    err.status = 401;
    throw err;
  }

  const user = userData.user;
  const employeeId = typeof user.user_metadata?.employee_id === 'string' ? user.user_metadata.employee_id : null;
  let employee: { id?: string | null; auth_user_id?: string | null; role?: string | null; permissions?: string[] | null } | null = null;

  if (employeeId) {
    const { data, error } = await db
      .from('employees')
      .select('id, auth_user_id, role, permissions')
      .eq('id', employeeId)
      .eq('active', true)
      .maybeSingle();
    if (error) throw error;
    employee = data as typeof employee;
  }

  if (!employee) {
    const { data, error } = await db
      .from('employees')
      .select('id, auth_user_id, role, permissions')
      .eq('auth_user_id', user.id)
      .eq('active', true)
      .maybeSingle();
    if (error) throw error;
    employee = data as typeof employee;
  }

  if (!employee) {
    const err = new Error('Not authenticated') as SquareError;
    err.status = 401;
    throw err;
  }

  return employee;
}

function isSebastianAdminEmployee(
  employee: { id?: string | null; auth_user_id?: string | null } | null | undefined
) {
  return (
    employee?.auth_user_id === SEBASTIAN_ADMIN_AUTH_USER_ID ||
    employee?.id === SEBASTIAN_ADMIN_EMPLOYEE_ID
  );
}

async function requirePriceAdmin(db: Db, req: Request) {
  const employee = await getRequestEmployee(db, req);
  if (isSebastianAdminEmployee(employee)) return;

  const err = new Error('Price sync and print lists are restricted to Sebastian.') as SquareError;
  err.status = 403;
  throw err;
}

async function requireSettingsAccess(db: Db, req: Request) {
  const employee = await getRequestEmployee(db, req);
  const permissions = Array.isArray(employee?.permissions) ? employee.permissions : [];
  if (employee?.role === 'admin' || isSebastianAdminEmployee(employee) || permissions.includes('settings')) return;

  const err = new Error('Settings access required') as SquareError;
  err.status = 403;
  throw err;
}

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

async function getVendorMapping(db: Db, barcode: string) {
  const { data, error } = await db
    .from(VENDOR_MAPPING_TABLE)
    .select('vendor_name')
    .eq('barcode', barcode)
    .maybeSingle();
  if (error) throw error;
  return ((data as Pick<VendorMappingRow, 'vendor_name'> | null)?.vendor_name || null);
}

async function getVendorMappings(db: Db, barcodes: string[]) {
  const out = new Map<string, string>();
  const unique = [...new Set(barcodes.map(cleanText).filter(Boolean))];

  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);
    const { data, error } = await db
      .from(VENDOR_MAPPING_TABLE)
      .select('barcode,vendor_name')
      .in('barcode', chunk);
    if (error) throw error;
    for (const row of (data as VendorMappingRow[]) || []) {
      if (row.barcode && row.vendor_name) out.set(row.barcode, row.vendor_name);
    }
  }

  return out;
}

async function importVendorMappings(db: Db, rawRows: unknown, source: string) {
  if (!Array.isArray(rawRows)) {
    return { ok: false, error: 'rows debe ser una lista' };
  }

  const normalized = new Map<string, string>();
  let skipped = 0;
  let conflicts = 0;

  for (const raw of rawRows) {
    const row = raw as Partial<VendorMappingInput>;
    const barcode = cleanText(row?.barcode);
    const vendorName = cleanText(row?.vendorName);
    if (!barcode || !vendorName) {
      skipped += 1;
      continue;
    }

    const previous = normalized.get(barcode);
    if (previous && previous.toLowerCase() !== vendorName.toLowerCase()) conflicts += 1;
    normalized.set(barcode, vendorName);
  }

  const rows = [...normalized.entries()].map(([barcode, vendor_name]) => ({ barcode, vendor_name }));
  if (rows.length === 0) {
    return { ok: true, imported: 0, updatedProducts: 0, skipped, conflicts };
  }

  let imported = 0;
  let updatedProducts = 0;
  for (let i = 0; i < rows.length; i += 5000) {
    const chunk = rows.slice(i, i + 5000);
    const { data, error } = await db.rpc('apply_square_price_vendor_mappings', {
      p_mappings: chunk,
      p_source: source || 'square_catalog',
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    imported += Number(result?.imported_count || chunk.length);
    updatedProducts += Number(result?.updated_product_count || 0);
  }

  return {
    ok: true,
    imported,
    updatedProducts,
    skipped,
    conflicts,
  };
}

async function vendorMappingStatus(db: Db) {
  const { data, error } = await db.rpc('square_price_vendor_mapping_status');
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as VendorMappingStatusRow | null;
  return {
    ok: true,
    mappingCount: Number(row?.mapping_count || 0),
    mappedProducts: Number(row?.mapped_products || 0),
    unknownProducts: Number(row?.unknown_products || 0),
    changedProducts: Number(row?.changed_products || 0),
    changedUnknownProducts: Number(row?.changed_unknown_products || 0),
    lastImportAt: row?.last_import_at || null,
  };
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
    categoryName: row.category_name || UNCATEGORIZED_CATEGORY,
    primaryCategory: row.primary_category || mainCategory(row.category_name),
    vendorName: row.vendor_name || UNKNOWN_VENDOR,
    catalogMissing: Boolean(row.catalog_missing),
    catalogMissingSince: row.catalog_missing_since || null,
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
  const checkedAt = new Date().toISOString();
  const liveCategoryName = categoryNameFromCategories(live.categories || []);
  const livePrimaryCategory = mainCategory(liveCategoryName);
  const mappedVendorName = await getVendorMapping(db, live.barcode);
  const liveVendorName = bestVendorName(live.vendorName, mappedVendorName);

  if (!existing) {
    const saved = await upsertProduct(db, {
      barcode: live.barcode,
      item_id: live.itemId ?? null,
      variation_id: live.variationId ?? null,
      name: live.name ?? null,
      image_url: live.imageUrl ?? null,
      category_name: liveCategoryName,
      primary_category: livePrimaryCategory,
      vendor_name: liveVendorName,
      old_price: now,
      last_seen_price: now,
      currency: live.currency || 'USD',
      tag_72: false,
      tag_86: false,
      conflict: false,
      catalog_missing: false,
      catalog_missing_since: null,
      last_square_sync_run: checkedAt,
      last_square_change_verified_at: checkedAt,
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
    category_name: liveCategoryName,
    primary_category: livePrimaryCategory,
    vendor_name: liveVendorName,
    old_price: existing.old_price, // held until both stores confirm
    last_seen_price: now,
    currency: live.currency || 'USD',
    tag_72: priceChanged ? false : existing.tag_72,
    tag_86: priceChanged ? false : existing.tag_86,
    conflict: existing.catalog_missing ? false : existing.conflict,
    catalog_missing: false,
    catalog_missing_since: null,
    last_square_sync_run: existing.last_square_sync_run || checkedAt,
    last_square_change_verified_at: checkedAt,
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
    category_name: existing.category_name,
    primary_category: existing.primary_category,
    vendor_name: existing.vendor_name,
    old_price: existing.old_price,
    last_seen_price: existing.last_seen_price,
    currency: existing.currency,
    tag_72: store === 72 ? true : existing.tag_72,
    tag_86: store === 86 ? true : existing.tag_86,
    conflict: existing.conflict,
    catalog_missing: existing.catalog_missing,
    catalog_missing_since: existing.catalog_missing_since,
    last_square_sync_run: existing.last_square_sync_run,
    last_square_change_verified_at: existing.last_square_change_verified_at,
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

async function syncVariations(db: Db, variations: Variation[], syncRunStartedAt: string) {
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
  const vendorMappings = await getVendorMappings(db, barcodes);

  const toUpsert: (Partial<ProductRow> & { barcode: string })[] = [];

  for (const [barcode, g] of groups) {
    const v = g.rep;
    const existing = existingMap.get(barcode);
    const isDuplicate = g.variations.length > 1;
    const seenEarlierInRun =
      Boolean(existing && existing.variation_id) &&
      existing?.variation_id !== v.variationId &&
      existing?.last_square_sync_run === syncRunStartedAt;
    const isConflict = isDuplicate || g.prices.size > 1 || seenEarlierInRun;
    const now = g.prices.size === 1 ? [...g.prices][0] : v.priceCents;
    const categoryName = categoryNameFromCategories(v.categories);
    const primaryCategory = mainCategory(categoryName);
    const vendorName = bestVendorName(v.vendorName, vendorMappings.get(barcode));

    if (isConflict) {
      toUpsert.push({
        barcode,
        item_id: existing?.item_id || v.itemId,
        variation_id: existing?.variation_id || v.variationId,
        name: existing?.name || v.name,
        image_url: existing?.image_url || null,
        category_name: existing?.category_name || categoryName,
        primary_category: existing?.primary_category || primaryCategory,
        vendor_name: existing?.vendor_name || vendorName,
        old_price: existing?.old_price ?? now,
        last_seen_price: existing?.last_seen_price ?? now,
        currency: existing?.currency || v.currency,
        tag_72: false,
        tag_86: false,
        conflict: true,
        catalog_missing: false,
        catalog_missing_since: null,
        last_square_sync_run: syncRunStartedAt,
        last_square_change_verified_at: null,
      });
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
        category_name: categoryName,
        primary_category: primaryCategory,
        vendor_name: vendorName,
        old_price: now,
        last_seen_price: now,
        currency: v.currency,
        tag_72: false,
        tag_86: false,
        conflict: isConflict,
        catalog_missing: false,
        catalog_missing_since: null,
        last_square_sync_run: syncRunStartedAt,
        last_square_change_verified_at: null,
      });
      if (!isConflict) nuevos++;
      continue;
    }

    const livePriceChanged =
      !isConflict &&
      now != null &&
      existing.last_seen_price != null &&
      now !== existing.last_seen_price;
    const changePending =
      !isConflict && now != null && existing.old_price != null && now !== existing.old_price;

    toUpsert.push({
      barcode,
      item_id: v.itemId,
      variation_id: v.variationId,
      name: v.name,
      image_url: existing.image_url, // sync brings no images
      category_name: categoryName,
      primary_category: primaryCategory,
      vendor_name: vendorName,
      old_price: existing.old_price,
      last_seen_price: now,
      currency: v.currency,
      tag_72: livePriceChanged ? false : existing.tag_72,
      tag_86: livePriceChanged ? false : existing.tag_86,
      conflict: isConflict,
      catalog_missing: false,
      catalog_missing_since: null,
      last_square_sync_run: syncRunStartedAt,
      last_square_change_verified_at: null,
    });

    if (changePending) cambiados++;
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

async function markProductsMissingFromSync(db: Db, syncRunStartedAt: string) {
  const now = new Date().toISOString();
  const payload = {
    catalog_missing: true,
    catalog_missing_since: now,
    conflict: false,
    tag_72: false,
    tag_86: false,
    updated_at: now,
  };

  const nullRun = await db
    .from(TABLE)
    .update(payload)
    .is('last_square_sync_run', null)
    .eq('catalog_missing', false)
    .select('barcode', { count: 'exact', head: true });
  if (nullRun.error) throw nullRun.error;

  const staleRun = await db
    .from(TABLE)
    .update(payload)
    .lt('last_square_sync_run', syncRunStartedAt)
    .eq('catalog_missing', false)
    .select('barcode', { count: 'exact', head: true });
  if (staleRun.error) throw staleRun.error;

  return (nullRun.count || 0) + (staleRun.count || 0);
}

async function markProductMissing(db: Db, row: ProductRow) {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from(TABLE)
    .update({
      catalog_missing: true,
      catalog_missing_since: row.catalog_missing_since || now,
      conflict: false,
      tag_72: false,
      tag_86: false,
      updated_at: now,
      last_square_change_verified_at: now,
    })
    .eq('barcode', row.barcode)
    .select('*')
    .single();
  if (error) throw error;
  return data as ProductRow;
}

function isPendingPriceChange(row: ProductRow | null | undefined) {
  return (
    Boolean(row) &&
    row!.conflict === false &&
    row!.catalog_missing === false &&
    row!.last_seen_price != null &&
    row!.old_price != null &&
    row!.last_seen_price !== row!.old_price
  );
}

function needsSquareChangeVerification(row: ProductRow) {
  const verifiedAt = Date.parse(row.last_square_change_verified_at || '');
  const updatedAt = Date.parse(row.updated_at || '');
  if (!Number.isFinite(verifiedAt)) return true;
  return Number.isFinite(updatedAt) && verifiedAt + CHANGE_VERIFICATION_STALE_MS < updatedAt;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
) {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function refreshChangeCandidate(db: Db, row: ProductRow) {
  try {
    const live = await lookupByBarcode(row.barcode);
    if (!live.found) {
      await markProductMissing(db, row);
      return null;
    }

    const saved = await recordLookup(db, live);
    return isPendingPriceChange(saved) ? saved : null;
  } catch {
    return row;
  }
}

async function listChanges(db: Db, verifyAgainstSquare = false) {
  const pageSize = 1000;
  const rows: ProductRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .rpc('square_price_pending_changes', { p_limit: pageSize, p_offset: from });
    if (error) throw error;

    rows.push(...(((data as ProductRow[]) || [])));

    if (!data || data.length < pageSize) break;
  }

  if (!verifyAgainstSquare || rows.length === 0) return rows.map(decorate);

  const rowsToVerify = rows.filter(needsSquareChangeVerification);
  if (rowsToVerify.length === 0) return rows.map(decorate);

  const refreshed = await mapWithConcurrency(rowsToVerify, 4, row =>
    refreshChangeCandidate(db, row)
  );
  const refreshedByBarcode = new Map<string, ProductRow | null>();
  rowsToVerify.forEach((row, index) => refreshedByBarcode.set(row.barcode, refreshed[index]));

  return rows
    .map(row => (refreshedByBarcode.has(row.barcode) ? refreshedByBarcode.get(row.barcode)! : row))
    .filter((row): row is ProductRow => isPendingPriceChange(row))
    .map(decorate);
}

async function listCatalogMissing(db: Db) {
  const pageSize = 1000;
  const rows: ProductRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from(TABLE)
      .select('*')
      .eq('catalog_missing', true)
      .order('vendor_name', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;

    rows.push(...((data as ProductRow[]) || []));
    if (!data || data.length < pageSize) break;
  }

  return rows.map(decorate);
}

async function listDuplicates(db: Db) {
  const pageSize = 1000;
  const rows: ProductRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from(TABLE)
      .select('*')
      .eq('conflict', true)
      .eq('catalog_missing', false)
      .order('vendor_name', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;

    rows.push(...((data as ProductRow[]) || []));
    if (!data || data.length < pageSize) break;
  }

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

    if (PRICE_ADMIN_ACTIONS.has(action)) {
      await requirePriceAdmin(db, req);
    }

    if (action === 'vendor-map-status') {
      await requireSettingsAccess(db, req);
      return jsonResponse(await vendorMappingStatus(db));
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

    if (action === 'vendor-map-import') {
      await requireSettingsAccess(db, req);
      const source = String(payload.source || 'square_catalog').slice(0, 120);
      const result = await importVendorMappings(db, payload.rows, source);
      if (!result.ok) return jsonResponse(result, 400);
      return jsonResponse({ ...result, status: await vendorMappingStatus(db) });
    }

    if (action === 'sync') {
      const cursor = typeof payload.cursor === 'string' && payload.cursor ? payload.cursor : null;
      const syncRunStartedAt = validIsoDate(payload.syncRunStartedAt) || new Date().toISOString();
      const { variations, nextCursor } = await listVariationPage(cursor);
      const summary = await syncVariations(db, variations, syncRunStartedAt);
      const missing = nextCursor ? 0 : await markProductsMissingFromSync(db, syncRunStartedAt);
      return jsonResponse({
        ok: true,
        ...summary,
        missing,
        syncRunStartedAt,
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
          sku: v.sku,
          upc: v.upc,
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
      const changes = (await listChanges(db, tokenSet)).map(r => ({
        barcode: r!.barcode,
        name: r!.name,
        categoryName: r!.categoryName,
        primaryCategory: r!.primaryCategory,
        vendorName: r!.vendorName,
        currency: r!.currency,
        oldPrice: r!.oldPrice,
        currentPrice: r!.currentPrice,
        pendingStores: r!.pendingStores,
        confirmedStores: r!.confirmedStores,
        conflict: r!.conflict,
      }));
      return jsonResponse({ ok: true, count: changes.length, changes });
    }

    if (action === 'catalog-missing') {
      const missing = (await listCatalogMissing(db)).map(r => ({
        barcode: r!.barcode,
        name: r!.name,
        categoryName: r!.categoryName,
        primaryCategory: r!.primaryCategory,
        vendorName: r!.vendorName,
        currency: r!.currency,
        oldPrice: r!.oldPrice,
        currentPrice: r!.currentPrice,
        catalogMissing: r!.catalogMissing,
        catalogMissingSince: r!.catalogMissingSince,
      }));
      return jsonResponse({ ok: true, count: missing.length, missing });
    }

    if (action === 'duplicates') {
      const duplicates = (await listDuplicates(db)).map(r => ({
        barcode: r!.barcode,
        name: r!.name,
        categoryName: r!.categoryName,
        primaryCategory: r!.primaryCategory,
        vendorName: r!.vendorName,
        currency: r!.currency,
        oldPrice: r!.oldPrice,
        currentPrice: r!.currentPrice,
        pendingStores: r!.pendingStores,
        confirmedStores: r!.confirmedStores,
        conflict: r!.conflict,
      }));
      return jsonResponse({ ok: true, count: duplicates.length, duplicates });
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
