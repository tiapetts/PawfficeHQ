-- Business SMS onboarding requests. No Twilio provisioning or messaging.
create table public.business_sms_onboarding (
  business_id uuid primary key references public.business(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started','submitted','under_review','registration_pending','approved','rejected')),
  legal_business_name text,
  contact_name text,
  contact_email text,
  business_address text,
  website_url text,
  use_case_description text,
  consent_description text,
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint submitted_request_complete check (
    status = 'not_started' or (
      nullif(btrim(legal_business_name),'') is not null
      and nullif(btrim(contact_name),'') is not null
      and nullif(btrim(contact_email),'') is not null
      and nullif(btrim(business_address),'') is not null
      and nullif(btrim(use_case_description),'') is not null
      and nullif(btrim(consent_description),'') is not null
    )
  )
);
alter table public.business_sms_onboarding enable row level security;
revoke all on public.business_sms_onboarding from anon, authenticated;
grant select, insert on public.business_sms_onboarding to authenticated;

create policy "Staff view their business SMS onboarding"
on public.business_sms_onboarding for select to authenticated
using (
  exists (
    select 1 from public."STAFF" s
    where s.business_id = business_sms_onboarding.business_id
      and s.auth_user_id = (select auth.uid())
      and s.is_active = true
  )
);
create policy "Staff submit business SMS onboarding"
on public.business_sms_onboarding for insert to authenticated
with check (
  status = 'submitted'
  and submitted_at is not null
  and exists (
    select 1 from public."STAFF" s
    where s.business_id = business_sms_onboarding.business_id
      and s.auth_user_id = (select auth.uid())
      and s.is_active = true
  )
);
