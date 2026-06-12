-- Return only rows that are true pending price changes. This keeps the Edge
-- Function from downloading the full price table just to compare two columns.

create or replace function public.square_price_pending_changes(
  p_limit integer default 1000,
  p_offset integer default 0
)
returns setof public.square_price_products
language sql
security definer
set search_path = public
as $$
  select *
  from public.square_price_products
  where conflict = false
    and catalog_missing = false
    and last_seen_price is not null
    and old_price is not null
    and last_seen_price <> old_price
  order by primary_category asc nulls last, name asc
  limit greatest(1, least(coalesce(p_limit, 1000), 5000))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.square_price_pending_changes(integer, integer) from public;
revoke all on function public.square_price_pending_changes(integer, integer) from anon;
revoke all on function public.square_price_pending_changes(integer, integer) from authenticated;
grant execute on function public.square_price_pending_changes(integer, integer) to service_role;
