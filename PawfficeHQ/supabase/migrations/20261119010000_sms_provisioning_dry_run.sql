-- Phase 3: audited dry-run only. NO Twilio API calls, numbers, or charges.
create table if not exists public.sms_provisioning_dry_run (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_sms_onboarding(business_id),
  requested_by uuid not null,
  outcome text not null check (outcome in ('ready_for_registration','blocked')),
  checks jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.sms_provisioning_dry_run enable row level security;
create policy "Platform admins read SMS provisioning dry runs"
  on public.sms_provisioning_dry_run for select to authenticated
  using (public.is_platform_admin());

create or replace function public.preview_sms_provisioning(p_business_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r public.business_sms_onboarding%rowtype;
  has_number boolean;
  checks jsonb;
  outcome text;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into r from public.business_sms_onboarding
    where business_id = p_business_id;
  if not found then
    raise exception 'SMS onboarding request not found' using errcode = 'P0002';
  end if;
  select exists(select 1 from public.business_sms_number n where n.business_id = p_business_id)
    into has_number;
  checks := jsonb_build_object(
    'registration_pending', r.status = 'registration_pending',
    'business_name_present', nullif(btrim(r.legal_business_name), '') is not null,
    'contact_present', nullif(btrim(r.contact_name), '') is not null and nullif(btrim(r.contact_email), '') is not null,
    'address_present', nullif(btrim(r.business_address), '') is not null,
    'use_case_present', nullif(btrim(r.use_case_description), '') is not null,
    'consent_description_present', nullif(btrim(r.consent_description), '') is not null,
    'number_not_assigned', not has_number
  );
  select case when bool_and(value::text = 'true') then 'ready_for_registration' else 'blocked' end
    into outcome from jsonb_each(checks);
  insert into public.sms_provisioning_dry_run(business_id, requested_by, outcome, checks)
    values (p_business_id, auth.uid(), outcome, checks);
  return jsonb_build_object('outcome',outcome,'checks',checks,
    'dry_run',true,'twilio_called',false,'number_purchased',false,
    'note','This preview is not carrier approval and does not provision anything.');
end;
$$;
revoke all on function public.preview_sms_provisioning(uuid) from public, anon, authenticated;
grant execute on function public.preview_sms_provisioning(uuid) to authenticated, service_role;
