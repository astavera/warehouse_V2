-- Track the exact full-catalog sync run that last saw each Square price row.
-- This is separate from updated_at because vendor imports, tag confirmations, or
-- lookups can update a row without proving that it appeared in the latest Square
-- catalog sweep.

alter table public.square_price_products
  add column if not exists last_square_sync_run timestamptz;

create index if not exists square_price_products_last_sync_run_idx
  on public.square_price_products (last_square_sync_run);
