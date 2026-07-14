alter table public.square_price_products
  add column if not exists price_changed_at timestamptz;

update public.square_price_products
set price_changed_at = coalesce(price_changed_at, updated_at, last_square_sync_run, now())
where conflict = false
  and catalog_missing = false
  and last_seen_price is not null
  and old_price is not null
  and last_seen_price <> old_price
  and price_changed_at is null;

update public.square_price_products
set price_changed_at = null
where price_changed_at is not null
  and (
    conflict = true
    or catalog_missing = true
    or last_seen_price is null
    or old_price is null
    or last_seen_price = old_price
  );

create index if not exists square_price_products_price_changed_at_idx
  on public.square_price_products (price_changed_at)
  where conflict = false
    and catalog_missing = false
    and last_seen_price is not null
    and old_price is not null
    and last_seen_price <> old_price;
