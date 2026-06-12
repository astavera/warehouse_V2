-- Track products that were previously known by the price tracker but no longer
-- appear in the Square catalog during a completed sync.

alter table public.square_price_products
  add column if not exists catalog_missing boolean not null default false,
  add column if not exists catalog_missing_since timestamptz;

create index if not exists square_price_products_catalog_missing_idx
  on public.square_price_products (vendor_name, name)
  where catalog_missing = true;

create index if not exists square_price_products_live_changes_idx
  on public.square_price_products (vendor_name, name)
  where conflict = false
    and catalog_missing = false
    and last_seen_price is not null
    and old_price is not null
    and last_seen_price <> old_price;

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
      where catalog_missing = false
        and coalesce(nullif(trim(vendor_name), ''), 'Unknown vendor') <> 'Unknown vendor'
    ) as mapped_products,
    (
      select count(*)
      from public.square_price_products
      where catalog_missing = false
        and coalesce(nullif(trim(vendor_name), ''), 'Unknown vendor') = 'Unknown vendor'
    ) as unknown_products,
    (
      select count(*)
      from public.square_price_products
      where conflict = false
        and catalog_missing = false
        and last_seen_price is not null
        and old_price is not null
        and last_seen_price <> old_price
    ) as changed_products,
    (
      select count(*)
      from public.square_price_products
      where conflict = false
        and catalog_missing = false
        and last_seen_price is not null
        and old_price is not null
        and last_seen_price <> old_price
        and coalesce(nullif(trim(vendor_name), ''), 'Unknown vendor') = 'Unknown vendor'
    ) as changed_unknown_products,
    (select max(updated_at) from public.square_price_vendor_mappings) as last_import_at;
$$;

revoke all on function public.square_price_vendor_mapping_status() from public;
revoke all on function public.square_price_vendor_mapping_status() from anon;
revoke all on function public.square_price_vendor_mapping_status() from authenticated;
grant execute on function public.square_price_vendor_mapping_status() to service_role;
