insert into storage.buckets (id, name, public)
values ('accounting-check-photos', 'accounting-check-photos', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "accounting can read check photos" on storage.objects;
drop policy if exists "accounting can upload check photos" on storage.objects;
drop policy if exists "accounting can update check photos" on storage.objects;
drop policy if exists "accounting can delete check photos" on storage.objects;

create policy "accounting can read check photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'accounting-check-photos'
  and public.accounting_can_access('accounting.view')
);

create policy "accounting can upload check photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'accounting-check-photos'
  and public.accounting_can_access('accounting.manage')
);

create policy "accounting can update check photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'accounting-check-photos'
  and public.accounting_can_access('accounting.manage')
)
with check (
  bucket_id = 'accounting-check-photos'
  and public.accounting_can_access('accounting.manage')
);

create policy "accounting can delete check photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'accounting-check-photos'
  and public.accounting_can_access('accounting.manage')
);
