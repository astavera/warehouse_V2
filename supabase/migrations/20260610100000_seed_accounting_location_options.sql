insert into public.accounting_stores (name, normalized_name)
values
  ('All Locations', 'all locations'),
  ('Both Stores', 'both stores'),
  ('86 Street', '86 street'),
  ('3rd Avenue', '3rd avenue'),
  ('Warehouse', 'warehouse')
on conflict (normalized_name) do nothing;
