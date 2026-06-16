-- Track when a pending price-change row was last checked against Square.
-- Full catalog syncs clear this marker so stale/archived duplicate results are
-- revalidated before they appear in the printable price-change list.

alter table public.square_price_products
  add column if not exists last_square_change_verified_at timestamptz;

create index if not exists square_price_products_change_verified_idx
  on public.square_price_products (last_square_change_verified_at)
  where conflict = false
    and catalog_missing = false
    and last_seen_price is not null
    and old_price is not null
    and last_seen_price <> old_price;
