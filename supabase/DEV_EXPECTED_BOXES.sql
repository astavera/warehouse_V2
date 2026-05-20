create table if not exists public.expected_boxes (
  id uuid primary key default gen_random_uuid(),
  carrier text not null check (carrier in ('FedEx', 'UPS', 'USPS', 'Amazon')),
  tracking_number text not null unique,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  po_number text,
  match_condition text not null default 'supplier_only' check (match_condition in ('supplier_only', 'supplier_po')),
  status text not null default 'in_transit' check (status in ('in_transit', 'delivered', 'received', 'needs_review')),
  carrier_eta text,
  carrier_delivered_at timestamptz,
  carrier_tracking_events jsonb not null default '[]'::jsonb,
  warehouse_received_at timestamptz,
  last_carrier_event text,
  notes text,
  created_by_employee_id uuid references public.employees(id) on delete set null,
  received_batch_id uuid references public.receipt_batches(id) on delete set null,
  received_item_id uuid references public.receipt_items(id) on delete set null,
  carrier_delivered_email_sent boolean not null default false,
  warehouse_received_email_sent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expected_box_access (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null unique references public.employees(id) on delete cascade,
  can_view boolean not null default true,
  granted_by_employee_id uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expected_box_notification_recipients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  notify_carrier_delivered boolean not null default true,
  notify_warehouse_received boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_expected_boxes_updated_at on public.expected_boxes;
create trigger set_expected_boxes_updated_at
before update on public.expected_boxes
for each row
execute function public.set_updated_at();

drop trigger if exists set_expected_box_access_updated_at on public.expected_box_access;
create trigger set_expected_box_access_updated_at
before update on public.expected_box_access
for each row
execute function public.set_updated_at();

drop trigger if exists set_expected_box_notification_recipients_updated_at on public.expected_box_notification_recipients;
create trigger set_expected_box_notification_recipients_updated_at
before update on public.expected_box_notification_recipients
for each row
execute function public.set_updated_at();

alter table public.expected_boxes enable row level security;
alter table public.expected_box_access enable row level security;
alter table public.expected_box_notification_recipients enable row level security;

drop policy if exists "authenticated read expected_boxes" on public.expected_boxes;
drop policy if exists "authenticated write expected_boxes" on public.expected_boxes;
drop policy if exists "public read expected_boxes" on public.expected_boxes;
drop policy if exists "public write expected_boxes" on public.expected_boxes;

create policy "public read expected_boxes"
on public.expected_boxes for select
to public
using (true);

create policy "public write expected_boxes"
on public.expected_boxes for all
to public
using (true)
with check (true);

drop policy if exists "authenticated read expected_box_access" on public.expected_box_access;
drop policy if exists "authenticated write expected_box_access" on public.expected_box_access;
drop policy if exists "public read expected_box_access" on public.expected_box_access;
drop policy if exists "public write expected_box_access" on public.expected_box_access;

create policy "public read expected_box_access"
on public.expected_box_access for select
to public
using (true);

create policy "public write expected_box_access"
on public.expected_box_access for all
to public
using (true)
with check (true);

drop policy if exists "authenticated read expected_box_notification_recipients" on public.expected_box_notification_recipients;
drop policy if exists "authenticated write expected_box_notification_recipients" on public.expected_box_notification_recipients;
drop policy if exists "public read expected_box_notification_recipients" on public.expected_box_notification_recipients;
drop policy if exists "public write expected_box_notification_recipients" on public.expected_box_notification_recipients;

create policy "public read expected_box_notification_recipients"
on public.expected_box_notification_recipients for select
to public
using (true);

create policy "public write expected_box_notification_recipients"
on public.expected_box_notification_recipients for all
to public
using (true)
with check (true);
