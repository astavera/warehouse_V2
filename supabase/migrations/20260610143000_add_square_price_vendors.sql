-- Store vendor metadata for price-change grouping and printable lists.
-- Vendor is read from Square catalog custom attributes when available.

alter table public.square_price_products
  add column if not exists vendor_name text;

create index if not exists square_price_products_vendor_changes_idx
  on public.square_price_products (vendor_name, name)
  where conflict = false
    and last_seen_price is not null
    and old_price is not null
    and last_seen_price <> old_price;
