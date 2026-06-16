-- Store Square category metadata for price-change grouping and printable lists.
-- The primary category is the first segment before "/" from the Square category
-- name, e.g. "Party/Favors" -> "Party".

alter table public.square_price_products
  add column if not exists category_name text,
  add column if not exists primary_category text;

create index if not exists square_price_products_primary_category_changes_idx
  on public.square_price_products (primary_category, name)
  where conflict = false
    and last_seen_price is not null
    and old_price is not null
    and last_seen_price <> old_price;
