-- Storage upserts require SELECT as well as INSERT/UPDATE permissions.
-- Restrict private object enumeration to active business owners/managers.
create policy "Business managers read branding objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'business-branding'
  and public.can_manage_staff(((storage.foldername(name))[1])::uuid)
);
