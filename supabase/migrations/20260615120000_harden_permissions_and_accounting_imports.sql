create or replace function public.app_is_active_employee()
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
  );
$$;

create or replace function public.app_can_access(required_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with current_employee as (
    select role, coalesce(permissions, array[]::text[]) as permissions
    from public.employees
    where auth_user_id = auth.uid()
      and active = true
    limit 1
  )
  select exists (
    select 1
    from current_employee
    where role = 'admin'
      or (
        required_module = 'receiving'
        and (role in ('warehouse', 'accounting') or permissions @> array['receiving']::text[])
      )
      or (
        required_module = 'expected_boxes'
        and (role = 'accounting' or permissions @> array['expected_boxes']::text[])
      )
      or (
        required_module = 'prices'
        and (role in ('accounting', 'store') or permissions @> array['prices']::text[])
      )
      or (
        required_module = 'audit'
        and (role = 'accounting' or permissions @> array['audit']::text[])
      )
      or (
        required_module = 'accounting'
        and (
          role = 'accounting'
          or permissions @> array['accounting']::text[]
          or exists (select 1 from unnest(permissions) as p(permission) where p.permission like 'accounting.%')
        )
      )
      or (
        required_module = 'settings'
        and permissions @> array['settings']::text[]
      )
  );
$$;

revoke all on function public.app_is_active_employee() from public, anon;
revoke all on function public.app_can_access(text) from public, anon;
revoke all on function public.accounting_can_access(text) from public, anon;
grant execute on function public.app_is_active_employee() to authenticated;
grant execute on function public.app_can_access(text) to authenticated;
grant execute on function public.accounting_can_access(text) to authenticated;

revoke all on table public.employees from anon, authenticated;
grant select (id, name, active, created_at, updated_at, auth_user_id, role, store_number, permissions)
on public.employees to authenticated;

revoke all on table public.carriers from anon;
revoke all on table public.suppliers from anon;
revoke all on table public.receipt_batches from anon;
revoke all on table public.receipt_items from anon;
revoke all on table public.receipt_photos from anon;
revoke all on table public.expected_boxes from anon;
revoke all on table public.expected_box_access from anon;
revoke all on table public.expected_box_notification_recipients from anon;
revoke all on table public.kiosk_login_attempts from anon, authenticated;

grant select, insert, update, delete on table public.carriers to authenticated;
grant select, insert, update, delete on table public.suppliers to authenticated;
grant select, insert, update, delete on table public.receipt_batches to authenticated;
grant select, insert, update, delete on table public.receipt_items to authenticated;
grant select, insert, update, delete on table public.receipt_photos to authenticated;
grant select, insert, update, delete on table public.expected_boxes to authenticated;
grant select, insert, update, delete on table public.expected_box_access to authenticated;
grant select, insert, update, delete on table public.expected_box_notification_recipients to authenticated;

drop policy if exists "authenticated read carriers" on public.carriers;
drop policy if exists "authenticated write carriers" on public.carriers;
drop policy if exists "authenticated read employees" on public.employees;
drop policy if exists "authenticated update employees" on public.employees;
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

create policy "employees readable by active employees"
on public.employees for select
to authenticated
using (auth_user_id = auth.uid() or public.app_is_active_employee());

create policy "carriers readable by warehouse workflows"
on public.carriers for select
to authenticated
using (public.app_can_access('receiving') or public.app_can_access('expected_boxes'));

create policy "carriers insertable by receiving"
on public.carriers for insert
to authenticated
with check (public.app_can_access('receiving'));

create policy "carriers updatable by receiving"
on public.carriers for update
to authenticated
using (public.app_can_access('receiving'))
with check (public.app_can_access('receiving'));

create policy "carriers deletable by receiving"
on public.carriers for delete
to authenticated
using (public.app_can_access('receiving'));

create policy "suppliers readable by warehouse workflows"
on public.suppliers for select
to authenticated
using (public.app_can_access('receiving') or public.app_can_access('expected_boxes'));

create policy "suppliers insertable by receiving"
on public.suppliers for insert
to authenticated
with check (public.app_can_access('receiving'));

create policy "suppliers updatable by receiving"
on public.suppliers for update
to authenticated
using (public.app_can_access('receiving'))
with check (public.app_can_access('receiving'));

create policy "suppliers deletable by receiving"
on public.suppliers for delete
to authenticated
using (public.app_can_access('receiving'));

create policy "receipt batches readable by receiving"
on public.receipt_batches for select
to authenticated
using (public.app_can_access('receiving'));

create policy "receipt batches insertable by receiving"
on public.receipt_batches for insert
to authenticated
with check (public.app_can_access('receiving'));

create policy "receipt batches updatable by receiving"
on public.receipt_batches for update
to authenticated
using (public.app_can_access('receiving'))
with check (public.app_can_access('receiving'));

create policy "receipt batches deletable by receiving"
on public.receipt_batches for delete
to authenticated
using (public.app_can_access('receiving'));

create policy "receipt items readable by receiving"
on public.receipt_items for select
to authenticated
using (public.app_can_access('receiving'));

create policy "receipt items insertable by receiving"
on public.receipt_items for insert
to authenticated
with check (public.app_can_access('receiving'));

create policy "receipt items updatable by receiving"
on public.receipt_items for update
to authenticated
using (public.app_can_access('receiving'))
with check (public.app_can_access('receiving'));

create policy "receipt items deletable by receiving"
on public.receipt_items for delete
to authenticated
using (public.app_can_access('receiving'));

create policy "receipt photos readable by receiving"
on public.receipt_photos for select
to authenticated
using (public.app_can_access('receiving'));

create policy "receipt photos insertable by receiving"
on public.receipt_photos for insert
to authenticated
with check (public.app_can_access('receiving'));

create policy "receipt photos updatable by receiving"
on public.receipt_photos for update
to authenticated
using (public.app_can_access('receiving'))
with check (public.app_can_access('receiving'));

create policy "receipt photos deletable by receiving"
on public.receipt_photos for delete
to authenticated
using (public.app_can_access('receiving'));

create policy "expected boxes readable by warehouse workflows"
on public.expected_boxes for select
to authenticated
using (public.app_can_access('expected_boxes') or public.app_can_access('receiving'));

create policy "expected boxes insertable by expected boxes"
on public.expected_boxes for insert
to authenticated
with check (public.app_can_access('expected_boxes'));

create policy "expected boxes updatable by warehouse workflows"
on public.expected_boxes for update
to authenticated
using (public.app_can_access('expected_boxes') or public.app_can_access('receiving'))
with check (public.app_can_access('expected_boxes') or public.app_can_access('receiving'));

create policy "expected boxes deletable by expected boxes"
on public.expected_boxes for delete
to authenticated
using (public.app_can_access('expected_boxes'));

create policy "expected box access readable by expected boxes"
on public.expected_box_access for select
to authenticated
using (public.app_can_access('expected_boxes'));

create policy "expected box access insertable by expected boxes"
on public.expected_box_access for insert
to authenticated
with check (public.app_can_access('expected_boxes'));

create policy "expected box access updatable by expected boxes"
on public.expected_box_access for update
to authenticated
using (public.app_can_access('expected_boxes'))
with check (public.app_can_access('expected_boxes'));

create policy "expected box access deletable by expected boxes"
on public.expected_box_access for delete
to authenticated
using (public.app_can_access('expected_boxes'));

create policy "expected box recipients readable by expected boxes"
on public.expected_box_notification_recipients for select
to authenticated
using (public.app_can_access('expected_boxes'));

create policy "expected box recipients insertable by expected boxes"
on public.expected_box_notification_recipients for insert
to authenticated
with check (public.app_can_access('expected_boxes'));

create policy "expected box recipients updatable by expected boxes"
on public.expected_box_notification_recipients for update
to authenticated
using (public.app_can_access('expected_boxes'))
with check (public.app_can_access('expected_boxes'));

create policy "expected box recipients deletable by expected boxes"
on public.expected_box_notification_recipients for delete
to authenticated
using (public.app_can_access('expected_boxes'));

insert into storage.buckets (id, name, public)
values ('receipts_photos', 'receipts_photos', false)
on conflict (id) do update set public = false;

drop policy if exists "public can read receipt photos" on storage.objects;
drop policy if exists "public can upload receipt photos" on storage.objects;
drop policy if exists "public can update receipt photos" on storage.objects;
drop policy if exists "public can delete receipt photos" on storage.objects;
drop policy if exists "authenticated can read receipt photos" on storage.objects;
drop policy if exists "authenticated can upload receipt photos" on storage.objects;
drop policy if exists "authenticated can update receipt photos" on storage.objects;
drop policy if exists "authenticated can delete receipt photos" on storage.objects;
drop policy if exists "receipt photos storage readable by receiving" on storage.objects;
drop policy if exists "receipt photos storage uploadable by receiving" on storage.objects;
drop policy if exists "receipt photos storage updatable by receiving" on storage.objects;
drop policy if exists "receipt photos storage deletable by receiving" on storage.objects;

create policy "receipt photos storage readable by receiving"
on storage.objects for select
to authenticated
using (
  bucket_id = 'receipts_photos'
  and public.app_can_access('receiving')
);

create policy "receipt photos storage uploadable by receiving"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'receipts_photos'
  and public.app_can_access('receiving')
);

create policy "receipt photos storage updatable by receiving"
on storage.objects for update
to authenticated
using (
  bucket_id = 'receipts_photos'
  and public.app_can_access('receiving')
)
with check (
  bucket_id = 'receipts_photos'
  and public.app_can_access('receiving')
);

create policy "receipt photos storage deletable by receiving"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'receipts_photos'
  and public.app_can_access('receiving')
);

update public.employees
set
  role = 'admin',
  permissions = array['receiving', 'expected_boxes', 'prices', 'audit', 'accounting', 'settings']::text[],
  updated_at = now()
where id = '77f47458-3aa1-4fdb-a08a-8e7924671ec1'::uuid
   or auth_user_id = 'e7bb5b60-b264-49b2-8358-81d0f3c37b09'::uuid;

alter table public.accounting_invoices
  drop constraint if exists accounting_invoices_source_file_name_source_sheet_source_row_key,
  drop constraint if exists accounting_invoices_source_file_sha256_source_sheet_source_row_key,
  add constraint accounting_invoices_source_file_sha256_source_sheet_source_row_key
    unique (source_file_sha256, source_sheet, source_row);

alter table public.accounting_invoice_payments
  drop constraint if exists accounting_invoice_payments_source_file_name_source_sheet_source_row_key,
  drop constraint if exists accounting_invoice_payments_source_file_sha256_source_sheet_source_row_key,
  add constraint accounting_invoice_payments_source_file_sha256_source_sheet_source_row_key
    unique (source_file_sha256, source_sheet, source_row);

alter table public.accounting_credit_card_payments
  drop constraint if exists accounting_credit_card_payments_source_file_name_source_sheet_source_row_key,
  drop constraint if exists accounting_credit_card_payments_source_file_sha256_source_sheet_source_row_key,
  add constraint accounting_credit_card_payments_source_file_sha256_source_sheet_source_row_key
    unique (source_file_sha256, source_sheet, source_row);

alter table public.accounting_personal_bills
  drop constraint if exists accounting_personal_bills_source_file_name_source_sheet_source_row_key,
  drop constraint if exists accounting_personal_bills_source_file_sha256_source_sheet_source_row_key,
  add constraint accounting_personal_bills_source_file_sha256_source_sheet_source_row_key
    unique (source_file_sha256, source_sheet, source_row);

alter table public.accounting_truck_violations
  drop constraint if exists accounting_truck_violations_source_file_name_source_sheet_source_row_key,
  drop constraint if exists accounting_truck_violations_source_file_sha256_source_sheet_source_row_key,
  add constraint accounting_truck_violations_source_file_sha256_source_sheet_source_row_key
    unique (source_file_sha256, source_sheet, source_row);
