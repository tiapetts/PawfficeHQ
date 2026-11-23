-- Stage 1: durable, idempotent SMS onboarding jobs. This does NOT buy phone numbers.
create table if not exists public.sms_onboarding_job (
  business_id uuid primary key references public.business_sms_onboarding(business_id) on delete cascade,
  state text not null default 'queued' check (state in ('queued','processing','validated','awaiting_carrier','ready','action_required','failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sms_onboarding_job enable row level security;
-- Deliberately no client write policies: only trusted backend/service role may operate jobs.
create policy "Business staff see SMS setup progress"
on public.sms_onboarding_job for select to authenticated
using (exists (
  select 1 from public."STAFF" s
  where s.business_id = sms_onboarding_job.business_id
    and s.auth_user_id = (select auth.uid()) and s.is_active = true
));
create or replace function public.enqueue_sms_onboarding_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'submitted' then
    insert into public.sms_onboarding_job (business_id)
    values (new.business_id)
    on conflict (business_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.enqueue_sms_onboarding_request() from public, anon, authenticated;
drop trigger if exists enqueue_sms_onboarding_request on public.business_sms_onboarding;
create trigger enqueue_sms_onboarding_request
after insert on public.business_sms_onboarding
for each row execute function public.enqueue_sms_onboarding_request();
-- Queue existing submissions without changing their current onboarding status.
insert into public.sms_onboarding_job (business_id)
select business_id from public.business_sms_onboarding where status = 'submitted'
on conflict (business_id) do nothing;
