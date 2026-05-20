create extension if not exists "pgcrypto";

create table if not exists public.carriers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  carrier_type text not null default 'parcel',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  passcode text not null unique check (passcode ~ '^[0-9]{4}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  contact_name text,
  phone text,
  email text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.receipt_batches (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid references public.carriers(id) on delete set null,
  received_by_employee_id uuid references public.employees(id) on delete set null,
  received_by_text text,
  received_at timestamptz not null default now(),
  notes text,
  shared_photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.receipt_batches(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  package_type text not null,
  package_count integer not null default 1 check (package_count >= 0),
  damaged_box boolean not null default false,
  damaged_notes text,
  tracking_number text,
  comments text,
  item_photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.receipt_photos (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.receipt_batches(id) on delete cascade,
  item_id uuid references public.receipt_items(id) on delete cascade,
  file_path text not null,
  photo_kind text not null default 'item',
  "Photo_received" text,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_carriers_updated_at on public.carriers;
create trigger set_carriers_updated_at
before update on public.carriers
for each row
execute function public.set_updated_at();

drop trigger if exists set_employees_updated_at on public.employees;
create trigger set_employees_updated_at
before update on public.employees
for each row
execute function public.set_updated_at();

drop trigger if exists set_suppliers_updated_at on public.suppliers;
create trigger set_suppliers_updated_at
before update on public.suppliers
for each row
execute function public.set_updated_at();

drop trigger if exists set_receipt_batches_updated_at on public.receipt_batches;
create trigger set_receipt_batches_updated_at
before update on public.receipt_batches
for each row
execute function public.set_updated_at();

drop trigger if exists set_receipt_items_updated_at on public.receipt_items;
create trigger set_receipt_items_updated_at
before update on public.receipt_items
for each row
execute function public.set_updated_at();

alter table public.carriers enable row level security;
alter table public.employees enable row level security;
alter table public.suppliers enable row level security;
alter table public.receipt_batches enable row level security;
alter table public.receipt_items enable row level security;
alter table public.receipt_photos enable row level security;

drop policy if exists "authenticated read carriers" on public.carriers;
drop policy if exists "authenticated write carriers" on public.carriers;
drop policy if exists "authenticated read employees" on public.employees;
drop policy if exists "authenticated write employees" on public.employees;
drop policy if exists "authenticated read suppliers" on public.suppliers;
drop policy if exists "authenticated write suppliers" on public.suppliers;
drop policy if exists "authenticated read receipt_batches" on public.receipt_batches;
drop policy if exists "authenticated write receipt_batches" on public.receipt_batches;
drop policy if exists "authenticated read receipt_items" on public.receipt_items;
drop policy if exists "authenticated write receipt_items" on public.receipt_items;
drop policy if exists "authenticated read receipt_photos" on public.receipt_photos;
drop policy if exists "authenticated write receipt_photos" on public.receipt_photos;
drop policy if exists "public read carriers" on public.carriers;
drop policy if exists "public write carriers" on public.carriers;
drop policy if exists "public read employees" on public.employees;
drop policy if exists "public write employees" on public.employees;
drop policy if exists "public read suppliers" on public.suppliers;
drop policy if exists "public write suppliers" on public.suppliers;
drop policy if exists "public read receipt_batches" on public.receipt_batches;
drop policy if exists "public write receipt_batches" on public.receipt_batches;
drop policy if exists "public read receipt_items" on public.receipt_items;
drop policy if exists "public write receipt_items" on public.receipt_items;
drop policy if exists "public read receipt_photos" on public.receipt_photos;
drop policy if exists "public write receipt_photos" on public.receipt_photos;

create policy "public read carriers"
on public.carriers for select
to public
using (true);

create policy "public write carriers"
on public.carriers for all
to public
using (true)
with check (true);

create policy "public read employees"
on public.employees for select
to public
using (true);

create policy "public write employees"
on public.employees for all
to public
using (true)
with check (true);

create policy "public read suppliers"
on public.suppliers for select
to public
using (true);

create policy "public write suppliers"
on public.suppliers for all
to public
using (true)
with check (true);

create policy "public read receipt_batches"
on public.receipt_batches for select
to public
using (true);

create policy "public write receipt_batches"
on public.receipt_batches for all
to public
using (true)
with check (true);

create policy "public read receipt_items"
on public.receipt_items for select
to public
using (true);

create policy "public write receipt_items"
on public.receipt_items for all
to public
using (true)
with check (true);

create policy "public read receipt_photos"
on public.receipt_photos for select
to public
using (true);

create policy "public write receipt_photos"
on public.receipt_photos for all
to public
using (true)
with check (true);

insert into storage.buckets (id, name, public)
values ('receipts_photos', 'receipts_photos', true)
on conflict (id) do nothing;

drop policy if exists "authenticated can read receipt photos" on storage.objects;
drop policy if exists "authenticated can upload receipt photos" on storage.objects;
drop policy if exists "authenticated can update receipt photos" on storage.objects;
drop policy if exists "authenticated can delete receipt photos" on storage.objects;
drop policy if exists "public can read receipt photos" on storage.objects;
drop policy if exists "public can upload receipt photos" on storage.objects;
drop policy if exists "public can update receipt photos" on storage.objects;
drop policy if exists "public can delete receipt photos" on storage.objects;

create policy "public can read receipt photos"
on storage.objects for select
to public
using (bucket_id = 'receipts_photos');

create policy "public can upload receipt photos"
on storage.objects for insert
to public
with check (bucket_id = 'receipts_photos');

create policy "public can update receipt photos"
on storage.objects for update
to public
using (bucket_id = 'receipts_photos')
with check (bucket_id = 'receipts_photos');

create policy "public can delete receipt photos"
on storage.objects for delete
to public
using (bucket_id = 'receipts_photos');
