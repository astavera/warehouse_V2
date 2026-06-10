create extension if not exists pgcrypto;

create or replace function public.accounting_can_access(required_permission text default 'accounting.view')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.employees
    where auth_user_id = auth.uid()
      and active = true
      and (
        role = 'admin'
        or role = 'accounting'
        or coalesce(permissions, array[]::text[]) @> array['accounting']::text[]
        or coalesce(permissions, array[]::text[]) @> array[required_permission]::text[]
      )
  );
$$;

grant execute on function public.accounting_can_access(text) to authenticated;

create table if not exists public.accounting_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_file_name text not null,
  source_file_sha256 text not null,
  imported_at timestamptz not null default now(),
  imported_by uuid null references public.employees(id) on delete set null,
  sheets_processed jsonb not null default '[]'::jsonb,
  rows_processed integer not null default 0,
  rows_inserted integer not null default 0,
  rows_updated integer not null default 0,
  rows_skipped integer not null default 0,
  warnings_count integer not null default 0,
  errors_count integer not null default 0,
  reconciliation_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounting_import_warnings (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid null references public.accounting_import_batches(id) on delete cascade,
  source_file_name text,
  source_sheet text,
  source_row integer,
  severity text not null default 'warning',
  code text not null,
  message text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.accounting_vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  source text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounting_stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounting_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  account_type text,
  brand text,
  last_four text,
  active boolean not null default true,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounting_payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounting_invoice_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounting_invoices (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid null references public.accounting_vendors(id) on delete set null,
  store_id uuid null references public.accounting_stores(id) on delete set null,
  invoice_number text,
  order_number text,
  issue_date date,
  due_date date,
  amount numeric(12,2),
  credit numeric(12,2) not null default 0,
  final_amount_to_pay numeric(12,2) generated always as (coalesce(amount, 0) - coalesce(credit, 0)) stored,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled', 'unknown')),
  paid boolean not null default false,
  category_id uuid null references public.accounting_invoice_categories(id) on delete set null,
  batch_number text,
  cloud text,
  notes text,
  excel_comments text,
  source_file_name text not null default 'manual',
  source_file_sha256 text not null default 'manual',
  source_sheet text not null default 'manual',
  source_row integer not null default 0,
  source_row_hash text not null default md5(random()::text),
  import_batch_id uuid null references public.accounting_import_batches(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_file_sha256, source_sheet, source_row)
);

create table if not exists public.accounting_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid null references public.accounting_invoices(id) on delete set null,
  vendor_id uuid null references public.accounting_vendors(id) on delete set null,
  invoice_number text,
  payment_date date,
  payment_method_id uuid null references public.accounting_payment_methods(id) on delete set null,
  account_id uuid null references public.accounting_accounts(id) on delete set null,
  check_number text,
  reference_number text,
  amount_paid numeric(12,2),
  status text,
  category_id uuid null references public.accounting_invoice_categories(id) on delete set null,
  notes text,
  source_file_name text not null default 'manual',
  source_file_sha256 text not null default 'manual',
  source_sheet text not null default 'manual',
  source_row integer not null default 0,
  source_row_hash text not null default md5(random()::text),
  import_batch_id uuid null references public.accounting_import_batches(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_file_sha256, source_sheet, source_row)
);

create table if not exists public.accounting_credit_card_payments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid null references public.accounting_accounts(id) on delete set null,
  payment_date date,
  amount numeric(12,2),
  confirmation_number text,
  status text,
  notes text,
  source_file_name text not null default 'manual',
  source_file_sha256 text not null default 'manual',
  source_sheet text not null default 'manual',
  source_row integer not null default 0,
  source_row_hash text not null default md5(random()::text),
  import_batch_id uuid null references public.accounting_import_batches(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_file_sha256, source_sheet, source_row)
);

create table if not exists public.accounting_personal_bills (
  id uuid primary key default gen_random_uuid(),
  bill_name text,
  vendor_id uuid null references public.accounting_vendors(id) on delete set null,
  payer text,
  payment_method_id uuid null references public.accounting_payment_methods(id) on delete set null,
  payment_date date,
  amount numeric(12,2),
  status text,
  notes text,
  source_file_name text not null default 'manual',
  source_file_sha256 text not null default 'manual',
  source_sheet text not null default 'manual',
  source_row integer not null default 0,
  source_row_hash text not null default md5(random()::text),
  import_batch_id uuid null references public.accounting_import_batches(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_file_sha256, source_sheet, source_row)
);

create table if not exists public.accounting_truck_violations (
  id uuid primary key default gen_random_uuid(),
  violation_number text,
  violation_date date,
  description text,
  amount numeric(12,2),
  receipt_number text,
  payment_method text,
  paid_amount numeric(12,2),
  payment_date date,
  is_possible_duplicate boolean not null default false,
  duplicate_group_key text,
  notes text,
  source_file_name text not null default 'manual',
  source_file_sha256 text not null default 'manual',
  source_sheet text not null default 'manual',
  source_row integer not null default 0,
  source_row_hash text not null default md5(random()::text),
  import_batch_id uuid null references public.accounting_import_batches(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_file_sha256, source_sheet, source_row)
);

create index if not exists accounting_invoices_status_idx on public.accounting_invoices(status);
create index if not exists accounting_invoices_due_date_idx on public.accounting_invoices(due_date);
create index if not exists accounting_invoices_vendor_id_idx on public.accounting_invoices(vendor_id);
create index if not exists accounting_invoice_payments_payment_date_idx on public.accounting_invoice_payments(payment_date);
create index if not exists accounting_credit_card_payments_payment_date_idx on public.accounting_credit_card_payments(payment_date);
create index if not exists accounting_truck_violations_duplicate_key_idx on public.accounting_truck_violations(duplicate_group_key);

alter table public.accounting_import_batches enable row level security;
alter table public.accounting_import_warnings enable row level security;
alter table public.accounting_vendors enable row level security;
alter table public.accounting_stores enable row level security;
alter table public.accounting_accounts enable row level security;
alter table public.accounting_payment_methods enable row level security;
alter table public.accounting_invoice_categories enable row level security;
alter table public.accounting_invoices enable row level security;
alter table public.accounting_invoice_payments enable row level security;
alter table public.accounting_credit_card_payments enable row level security;
alter table public.accounting_personal_bills enable row level security;
alter table public.accounting_truck_violations enable row level security;

create policy "accounting read import batches"
on public.accounting_import_batches for select
to authenticated
using (public.accounting_can_access('accounting.import') or public.accounting_can_access('accounting.reports'));

create policy "accounting write import batches"
on public.accounting_import_batches for all
to authenticated
using (public.accounting_can_access('accounting.import'))
with check (public.accounting_can_access('accounting.import'));

create policy "accounting read import warnings"
on public.accounting_import_warnings for select
to authenticated
using (public.accounting_can_access('accounting.import') or public.accounting_can_access('accounting.reports'));

create policy "accounting write import warnings"
on public.accounting_import_warnings for all
to authenticated
using (public.accounting_can_access('accounting.import'))
with check (public.accounting_can_access('accounting.import'));

create policy "accounting read vendors"
on public.accounting_vendors for select
to authenticated
using (public.accounting_can_access('accounting.view') or public.accounting_can_access('accounting.catalogs'));

create policy "accounting write vendors"
on public.accounting_vendors for all
to authenticated
using (public.accounting_can_access('accounting.catalogs') or public.accounting_can_access('accounting.manage'))
with check (public.accounting_can_access('accounting.catalogs') or public.accounting_can_access('accounting.manage'));

create policy "accounting read stores"
on public.accounting_stores for select
to authenticated
using (public.accounting_can_access('accounting.view') or public.accounting_can_access('accounting.catalogs'));

create policy "accounting write stores"
on public.accounting_stores for all
to authenticated
using (public.accounting_can_access('accounting.catalogs') or public.accounting_can_access('accounting.manage'))
with check (public.accounting_can_access('accounting.catalogs') or public.accounting_can_access('accounting.manage'));

create policy "accounting read accounts"
on public.accounting_accounts for select
to authenticated
using (public.accounting_can_access('accounting.view') or public.accounting_can_access('accounting.catalogs'));

create policy "accounting write accounts"
on public.accounting_accounts for all
to authenticated
using (public.accounting_can_access('accounting.catalogs') or public.accounting_can_access('accounting.manage'))
with check (public.accounting_can_access('accounting.catalogs') or public.accounting_can_access('accounting.manage'));

create policy "accounting read payment methods"
on public.accounting_payment_methods for select
to authenticated
using (public.accounting_can_access('accounting.view') or public.accounting_can_access('accounting.catalogs'));

create policy "accounting write payment methods"
on public.accounting_payment_methods for all
to authenticated
using (public.accounting_can_access('accounting.catalogs') or public.accounting_can_access('accounting.manage'))
with check (public.accounting_can_access('accounting.catalogs') or public.accounting_can_access('accounting.manage'));

create policy "accounting read invoice categories"
on public.accounting_invoice_categories for select
to authenticated
using (public.accounting_can_access('accounting.view') or public.accounting_can_access('accounting.catalogs'));

create policy "accounting write invoice categories"
on public.accounting_invoice_categories for all
to authenticated
using (public.accounting_can_access('accounting.catalogs') or public.accounting_can_access('accounting.manage'))
with check (public.accounting_can_access('accounting.catalogs') or public.accounting_can_access('accounting.manage'));

create policy "accounting read invoices"
on public.accounting_invoices for select
to authenticated
using (public.accounting_can_access('accounting.view'));

create policy "accounting write invoices"
on public.accounting_invoices for all
to authenticated
using (public.accounting_can_access('accounting.manage') or public.accounting_can_access('accounting.import'))
with check (public.accounting_can_access('accounting.manage') or public.accounting_can_access('accounting.import'));

create policy "accounting read invoice payments"
on public.accounting_invoice_payments for select
to authenticated
using (public.accounting_can_access('accounting.view'));

create policy "accounting write invoice payments"
on public.accounting_invoice_payments for all
to authenticated
using (public.accounting_can_access('accounting.manage') or public.accounting_can_access('accounting.import'))
with check (public.accounting_can_access('accounting.manage') or public.accounting_can_access('accounting.import'));

create policy "accounting read credit card payments"
on public.accounting_credit_card_payments for select
to authenticated
using (public.accounting_can_access('accounting.view'));

create policy "accounting write credit card payments"
on public.accounting_credit_card_payments for all
to authenticated
using (public.accounting_can_access('accounting.manage') or public.accounting_can_access('accounting.import'))
with check (public.accounting_can_access('accounting.manage') or public.accounting_can_access('accounting.import'));

create policy "accounting read personal bills"
on public.accounting_personal_bills for select
to authenticated
using (public.accounting_can_access('accounting.view'));

create policy "accounting write personal bills"
on public.accounting_personal_bills for all
to authenticated
using (public.accounting_can_access('accounting.manage') or public.accounting_can_access('accounting.import'))
with check (public.accounting_can_access('accounting.manage') or public.accounting_can_access('accounting.import'));

create policy "accounting read truck violations"
on public.accounting_truck_violations for select
to authenticated
using (public.accounting_can_access('accounting.view'));

create policy "accounting write truck violations"
on public.accounting_truck_violations for all
to authenticated
using (public.accounting_can_access('accounting.manage') or public.accounting_can_access('accounting.import'))
with check (public.accounting_can_access('accounting.manage') or public.accounting_can_access('accounting.import'));
