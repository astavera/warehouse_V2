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

drop policy if exists "authenticated can read receipt photos" on storage.objects;
drop policy if exists "authenticated can upload receipt photos" on storage.objects;
drop policy if exists "authenticated can update receipt photos" on storage.objects;
drop policy if exists "authenticated can delete receipt photos" on storage.objects;

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
