CREATE POLICY "anon can delete batches"
ON public.receipt_batches
FOR DELETE
TO anon
USING (true);

CREATE POLICY "auth users can delete batches"
ON public.receipt_batches
FOR DELETE
TO authenticated
USING (true);

CREATE POLICY "anon can delete items"
ON public.receipt_items
FOR DELETE
TO anon
USING (true);

CREATE POLICY "auth users can delete items"
ON public.receipt_items
FOR DELETE
TO authenticated
USING (true);

CREATE POLICY "anon can delete photos"
ON public.receipt_photos
FOR DELETE
TO anon
USING (true);

CREATE POLICY "auth users can delete photos"
ON public.receipt_photos
FOR DELETE
TO authenticated
USING (true);
