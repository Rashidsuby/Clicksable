-- Public article covers live in a dedicated bucket. Only MFA-verified HQ admins may write.
alter table public.learning_articles
  add column if not exists cover_image_alt text not null default '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'learning-media',
  'learning-media',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "MFA HQ admins can upload learning media" on storage.objects;
create policy "MFA HQ admins can upload learning media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'learning-media'
  and (select public.is_clicksable_hq_admin_mfa())
);

drop policy if exists "MFA HQ admins can update learning media" on storage.objects;
create policy "MFA HQ admins can update learning media"
on storage.objects for update to authenticated
using (
  bucket_id = 'learning-media'
  and (select public.is_clicksable_hq_admin_mfa())
)
with check (
  bucket_id = 'learning-media'
  and (select public.is_clicksable_hq_admin_mfa())
);

drop policy if exists "MFA HQ admins can delete learning media" on storage.objects;
create policy "MFA HQ admins can delete learning media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'learning-media'
  and (select public.is_clicksable_hq_admin_mfa())
);
