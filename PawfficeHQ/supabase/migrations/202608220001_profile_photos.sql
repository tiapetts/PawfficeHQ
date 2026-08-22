alter table public."CLIENT"
  add column if not exists profile_photo_path text,
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text;

alter table public."PET"
  add column if not exists profile_photo_path text,
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text;

create index if not exists client_business_archived_idx
  on public."CLIENT" (business_id, archived_at);

create index if not exists pet_business_archived_idx
  on public."PET" (business_id, archived_at);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Business members can view profile photos" on storage.objects;
create policy "Business members can view profile photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-photos'
  and (
    public.is_platform_admin()
    or exists (
      select 1 from public."STAFF" staff
      where staff.auth_user_id = auth.uid()
        and staff.is_active = true
        and public.has_subscription_access(staff.business_id)
        and staff.business_id::text = (storage.foldername(name))[1]
    )
  )
);

drop policy if exists "Business members can upload profile photos" on storage.objects;
create policy "Business members can upload profile photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and exists (
    select 1 from public."STAFF" staff
    where staff.auth_user_id = auth.uid()
      and staff.is_active = true
      and public.has_subscription_access(staff.business_id)
      and staff.business_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "Business members can update profile photos" on storage.objects;
create policy "Business members can update profile photos"
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-photos'
  and exists (
    select 1 from public."STAFF" staff
    where staff.auth_user_id = auth.uid()
      and staff.is_active = true
      and public.has_subscription_access(staff.business_id)
      and staff.business_id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'profile-photos'
  and exists (
    select 1 from public."STAFF" staff
    where staff.auth_user_id = auth.uid()
      and staff.is_active = true
      and public.has_subscription_access(staff.business_id)
      and staff.business_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "Business members can delete profile photos" on storage.objects;
create policy "Business members can delete profile photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-photos'
  and exists (
    select 1 from public."STAFF" staff
    where staff.auth_user_id = auth.uid()
      and staff.is_active = true
      and public.has_subscription_access(staff.business_id)
      and staff.business_id::text = (storage.foldername(name))[1]
  )
);
