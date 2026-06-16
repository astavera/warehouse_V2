-- Square price-change tracker (ported from the standalone "square-precios" app).
-- Stores, per barcode, the last confirmed price ("old price"), the last price
-- seen in Square, and the per-store tag-change confirmation state (stores 72/86).
--
-- The table is written ONLY by the `square-prices` Edge Function (service role).
-- The browser never touches it directly, so RLS is enabled with no anon/
-- authenticated policies (same closed pattern as kiosk_login_attempts).

create table if not exists public.square_price_products (
  barcode          text primary key,
  item_id          text,
  variation_id     text,
  name             text,
  image_url        text,
  old_price        integer,                       -- last confirmed price (cents)
  last_seen_price  integer,                       -- last price seen in Square (cents)
  currency         text not null default 'USD',
  tag_72           boolean not null default false, -- store 72 confirmed the tag
  tag_86           boolean not null default false, -- store 86 confirmed the tag
  conflict         boolean not null default false, -- duplicate barcode w/ different prices
  updated_at       timestamptz not null default now()
);

-- Fast lookup of pending changes for the printable list.
create index if not exists square_price_products_changes_idx
  on public.square_price_products (name)
  where conflict = false
    and last_seen_price is not null
    and old_price is not null
    and last_seen_price <> old_price;

alter table public.square_price_products enable row level security;
-- No policies on purpose: only the service role (Edge Function) may read/write.
