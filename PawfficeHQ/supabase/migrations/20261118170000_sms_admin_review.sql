-- Admin-only SMS onboarding review. No Twilio provisioning or activation.
create policy "Platform admins review SMS onboarding"
on public.business_sms_onboarding for select to authenticated
using (public.is_platform_admin());

create or replace function public.review_sms_onboarding(
  p_business_id uuid,
  p_status text
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_status not in ('under_review', 'registration_pending', 'rejected') then
    raise exception 'Invalid review status' using errcode = '22023';
  end if;
  update public.business_sms_onboarding
     set status = p_status, updated_at = now()
   where business_id = p_business_id
     and status in ('submitted','under_review','registration_pending','rejected');
  if not found then
    raise exception 'Onboarding request not found or not reviewable' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.review_sms_onboarding(uuid,text) from public,anon,authenticated;
grant execute on function public.review_sms_onboarding(uuid,text) to authenticated,service_role;
