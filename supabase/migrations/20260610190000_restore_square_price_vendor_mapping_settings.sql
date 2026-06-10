-- Admin-maintained Vendor Name mapping for Square price lists.
-- Square's Vendors API lists vendors, but CatalogItemVariation does not expose
-- vendor_id/vendor_name. This table stores the catalog export bridge:
-- SKU/UPC/barcode -> Vendor Name, maintained from Settings.

create table if not exists public.square_price_vendor_mappings (
  barcode     text primary key,
  vendor_name text not null,
  source      text not null default 'square_catalog',
  updated_at  timestamptz not null default now(),
  constraint square_price_vendor_mappings_barcode_not_blank
    check (length(trim(barcode)) > 0),
  constraint square_price_vendor_mappings_vendor_not_blank
    check (length(trim(vendor_name)) > 0)
);

create index if not exists square_price_vendor_mappings_vendor_idx
  on public.square_price_vendor_mappings (vendor_name, barcode);

alter table public.square_price_vendor_mappings enable row level security;
-- No client policies: Settings writes through the square-prices Edge Function.

create or replace function public.apply_square_price_vendor_mappings(
  p_mappings jsonb,
  p_source text default 'square_catalog'
)
returns table(imported_count integer, updated_product_count integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  drop table if exists pg_temp.tmp_square_price_vendor_mappings;

  create temp table tmp_square_price_vendor_mappings (
    barcode text primary key,
    vendor_name text not null
  ) on commit drop;

  insert into tmp_square_price_vendor_mappings (barcode, vendor_name)
  select distinct on (trim(x.barcode))
    trim(x.barcode),
    trim(x.vendor_name)
  from jsonb_to_recordset(coalesce(p_mappings, '[]'::jsonb)) as x(
    barcode text,
    vendor_name text
  )
  where length(trim(coalesce(x.barcode, ''))) > 0
    and length(trim(coalesce(x.vendor_name, ''))) > 0
  order by trim(x.barcode), trim(x.vendor_name);

  insert into public.square_price_vendor_mappings (
    barcode,
    vendor_name,
    source,
    updated_at
  )
  select
    barcode,
    vendor_name,
    coalesce(nullif(trim(p_source), ''), 'square_catalog'),
    now()
  from tmp_square_price_vendor_mappings
  on conflict (barcode) do update
  set vendor_name = excluded.vendor_name,
      source = excluded.source,
      updated_at = excluded.updated_at;

  get diagnostics imported_count = row_count;

  update public.square_price_products as products
  set vendor_name = mappings.vendor_name,
      updated_at = now()
  from tmp_square_price_vendor_mappings as mappings
  where products.barcode = mappings.barcode;

  get diagnostics updated_product_count = row_count;

  return next;
end;
$$;

create or replace function public.square_price_vendor_mapping_status()
returns table(
  mapping_count bigint,
  mapped_products bigint,
  unknown_products bigint,
  changed_products bigint,
  changed_unknown_products bigint,
  last_import_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    (select count(*) from public.square_price_vendor_mappings) as mapping_count,
    (
      select count(*)
      from public.square_price_products
      where coalesce(nullif(trim(vendor_name), ''), 'Unknown vendor') <> 'Unknown vendor'
    ) as mapped_products,
    (
      select count(*)
      from public.square_price_products
      where coalesce(nullif(trim(vendor_name), ''), 'Unknown vendor') = 'Unknown vendor'
    ) as unknown_products,
    (
      select count(*)
      from public.square_price_products
      where conflict = false
        and last_seen_price is not null
        and old_price is not null
        and last_seen_price <> old_price
    ) as changed_products,
    (
      select count(*)
      from public.square_price_products
      where conflict = false
        and last_seen_price is not null
        and old_price is not null
        and last_seen_price <> old_price
        and coalesce(nullif(trim(vendor_name), ''), 'Unknown vendor') = 'Unknown vendor'
    ) as changed_unknown_products,
    (select max(updated_at) from public.square_price_vendor_mappings) as last_import_at;
$$;

revoke all on function public.apply_square_price_vendor_mappings(jsonb, text) from public;
revoke all on function public.apply_square_price_vendor_mappings(jsonb, text) from anon;
revoke all on function public.apply_square_price_vendor_mappings(jsonb, text) from authenticated;
grant execute on function public.apply_square_price_vendor_mappings(jsonb, text) to service_role;

revoke all on function public.square_price_vendor_mapping_status() from public;
revoke all on function public.square_price_vendor_mapping_status() from anon;
revoke all on function public.square_price_vendor_mapping_status() from authenticated;
grant execute on function public.square_price_vendor_mapping_status() to service_role;
