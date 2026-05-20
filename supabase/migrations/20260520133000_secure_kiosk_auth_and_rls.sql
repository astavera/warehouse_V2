alter table public.employees
add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

alter table public.carriers enable row level security;
alter table public.employees enable row level security;
alter table public.suppliers enable row level security;
alter table public.receipt_batches enable row level security;
alter table public.receipt_items enable row level security;
alter table public.receipt_photos enable row level security;
alter table public.expected_boxes enable row level security;
alter table public.expected_box_access enable row level security;
alter table public.expected_box_notification_recipients enable row level security;

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
drop policy if exists "public read expected_boxes" on public.expected_boxes;
drop policy if exists "public write expected_boxes" on public.expected_boxes;
drop policy if exists "public read expected_box_access" on public.expected_box_access;
drop policy if exists "public write expected_box_access" on public.expected_box_access;
drop policy if exists "public read expected_box_notification_recipients" on public.expected_box_notification_recipients;
drop policy if exists "public write expected_box_notification_recipients" on public.expected_box_notification_recipients;

drop policy if exists "anon can delete batches" on public.receipt_batches;
drop policy if exists "anon can delete items" on public.receipt_items;
drop policy if exists "anon can delete photos" on public.receipt_photos;

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
drop policy if exists "authenticated read expected_boxes" on public.expected_boxes;
drop policy if exists "authenticated write expected_boxes" on public.expected_boxes;
drop policy if exists "authenticated read expected_box_access" on public.expected_box_access;
drop policy if exists "authenticated write expected_box_access" on public.expected_box_access;
drop policy if exists "authenticated read expected_box_notification_recipients" on public.expected_box_notification_recipients;
drop policy if exists "authenticated write expected_box_notification_recipients" on public.expected_box_notification_recipients;

create policy "authenticated read carriers"
on public.carriers for select
to authenticated
using (true);

create policy "authenticated write carriers"
on public.carriers for all
to authenticated
using (true)
with check (true);

create policy "authenticated read employees"
on public.employees for select
to authenticated
using (true);

create policy "authenticated write employees"
on public.employees for all
to authenticated
using (true)
with check (true);

create policy "authenticated read suppliers"
on public.suppliers for select
to authenticated
using (true);

create policy "authenticated write suppliers"
on public.suppliers for all
to authenticated
using (true)
with check (true);

create policy "authenticated read receipt_batches"
on public.receipt_batches for select
to authenticated
using (true);

create policy "authenticated write receipt_batches"
on public.receipt_batches for all
to authenticated
using (true)
with check (true);

create policy "authenticated read receipt_items"
on public.receipt_items for select
to authenticated
using (true);

create policy "authenticated write receipt_items"
on public.receipt_items for all
to authenticated
using (true)
with check (true);

create policy "authenticated read receipt_photos"
on public.receipt_photos for select
to authenticated
using (true);

create policy "authenticated write receipt_photos"
on public.receipt_photos for all
to authenticated
using (true)
with check (true);

create policy "authenticated read expected_boxes"
on public.expected_boxes for select
to authenticated
using (true);

create policy "authenticated write expected_boxes"
on public.expected_boxes for all
to authenticated
using (true)
with check (true);

create policy "authenticated read expected_box_access"
on public.expected_box_access for select
to authenticated
using (true);

create policy "authenticated write expected_box_access"
on public.expected_box_access for all
to authenticated
using (true)
with check (true);

create policy "authenticated read expected_box_notification_recipients"
on public.expected_box_notification_recipients for select
to authenticated
using (true);

create policy "authenticated write expected_box_notification_recipients"
on public.expected_box_notification_recipients for all
to authenticated
using (true)
with check (true);

revoke select (passcode) on public.employees from anon, authenticated;

drop policy if exists "public can read receipt photos" on storage.objects;
drop policy if exists "public can upload receipt photos" on storage.objects;
drop policy if exists "public can update receipt photos" on storage.objects;
drop policy if exists "public can delete receipt photos" on storage.objects;
drop policy if exists "authenticated can read receipt photos" on storage.objects;
drop policy if exists "authenticated can upload receipt photos" on storage.objects;
drop policy if exists "authenticated can update receipt photos" on storage.objects;
drop policy if exists "authenticated can delete receipt photos" on storage.objects;

create policy "authenticated can read receipt photos"
on storage.objects for select
to authenticated
using (bucket_id = 'receipts_photos');

create policy "authenticated can upload receipt photos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'receipts_photos');

create policy "authenticated can update receipt photos"
on storage.objects for update
to authenticated
using (bucket_id = 'receipts_photos')
with check (bucket_id = 'receipts_photos');

create policy "authenticated can delete receipt photos"
on storage.objects for delete
to authenticated
using (bucket_id = 'receipts_photos');
