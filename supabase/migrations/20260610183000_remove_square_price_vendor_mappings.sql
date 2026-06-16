-- The vendor mapping import flow was removed. Keep price vendor grouping tied
-- only to fields Square exposes through the Catalog API.

drop function if exists public.apply_square_price_vendor_mappings(jsonb, text);
drop table if exists public.square_price_vendor_mappings;
