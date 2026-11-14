-- Storage list/remove through the API also need SELECT on storage.objects:
-- let users see (and therefore delete or replace) files in their own folder.
create policy "read own product images" on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
