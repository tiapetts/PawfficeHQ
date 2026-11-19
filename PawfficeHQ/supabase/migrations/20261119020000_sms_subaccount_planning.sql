-- Phase 3B: plan subaccount isolation without creating any Twilio resources.
-- Never store Twilio auth tokens or API secrets in this table.
create table if not exists public.sms_subaccount_plan (
  business_id uuid primary key references public.business_sms_onboarding(business_id) on delete restrict,
  state text not null default 'planned' check (state in ('planned','cancelled')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sms_subaccount_plan enable row level security;
create policy "Platform admins view SMS subaccount plans"
  on public.sms_subaccount_plan for select to authenticated
  using (public.is_platform_admin());

create or replace function public.plan_sms_subaccount(p_business_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_status text;
  v_has_number boolean;
  v_state text;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select status into v_status from public.business_sms_onboarding
    where business_id = p_business_id for update;
  if not found then
    raise exception 'SMS onboarding request not found' using errcode = 'P0002';
  end if;
  if v_status <> 'registration_pending' then
    raise exception 'Request must be registration pending' using errcode = '22023';
  end if;
  select exists(select 1 from public.business_sms_number where business_id = p_business_id)
    into v_has_number;
  if v_has_number then
    raise exception 'Business already has a messaging number' using errcode = '22023';
  end if;
  insert into public.sms_subaccount_plan(business_id, created_by)
    values (p_business_id, auth.uid())
    on conflict (business_id) do nothing;
  select state into v_state from public.sms_subaccount_plan where business_id = p_business_id;
  return jsonb_build_object(
    'business_id', p_business_id, 'state', v_state,
    'twilio_called', false, 'subaccount_created', false,
    'number_purchased', false,
    'note', 'Local plan only; no Twilio resources or credentials created.'
  );
end;
$$;
revoke all on function public.plan_sms_subaccount(uuid) from public, anon, authenticated;
grant execute on function public.plan_sms_subaccount(uuid) to authenticated;
