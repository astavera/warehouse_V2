insert into storage.buckets (id, name, public)
values ('receipts_photos', 'receipts_photos', true)
on conflict (id) do nothing;

drop policy if exists "authenticated can read receipt photos" on storage.objects;
create policy "authenticated can read receipt photos"
on storage.objects for select
to authenticated
using (bucket_id = 'receipts_photos');

drop policy if exists "authenticated can upload receipt photos" on storage.objects;
create policy "authenticated can upload receipt photos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'receipts_photos');

drop policy if exists "authenticated can update receipt photos" on storage.objects;
create policy "authenticated can update receipt photos"
on storage.objects for update
to authenticated
using (bucket_id = 'receipts_photos')
with check (bucket_id = 'receipts_photos');

drop policy if exists "authenticated can delete receipt photos" on storage.objects;
create policy "authenticated can delete receipt photos"
on storage.objects for delete
to authenticated
using (bucket_id = 'receipts_photos');
