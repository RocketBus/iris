-- Storage bucket policies for public organization logos and user avatars
-- Run this script in the Supabase SQL editor after creating the buckets.

-- Public read access
create policy "Public read organization logos" on storage.objects
  for select using (bucket_id = 'organization-logos');

create policy "Public read user avatars" on storage.objects
  for select using (bucket_id = 'user-avatars');

-- Authenticated users can upload or replace files
create policy "Authenticated upload organization logos" on storage.objects
  for insert with check (
    bucket_id = 'organization-logos' and auth.role() = 'authenticated'
  );

create policy "Authenticated upload user avatars" on storage.objects
  for insert with check (
    bucket_id = 'user-avatars' and auth.role() = 'authenticated'
  );

create policy "Authenticated update organization logos" on storage.objects
  for update using (
    bucket_id = 'organization-logos' and auth.role() = 'authenticated'
  ) with check (
    bucket_id = 'organization-logos'
  );

create policy "Authenticated update user avatars" on storage.objects
  for update using (
    bucket_id = 'user-avatars' and auth.role() = 'authenticated'
  ) with check (
    bucket_id = 'user-avatars'
  );

-- Authenticated users can delete existing files
create policy "Authenticated delete organization logos" on storage.objects
  for delete using (
    bucket_id = 'organization-logos' and auth.role() = 'authenticated'
  );

create policy "Authenticated delete user avatars" on storage.objects
  for delete using (
    bucket_id = 'user-avatars' and auth.role() = 'authenticated'
  );

