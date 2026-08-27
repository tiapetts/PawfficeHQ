create table if not exists public.business_admin_state (
  business_id uuid primary key references public.business(id) on delete cascade,
  archived_at timestamptz,
  archive_reason text,
  archived_by uuid references auth.users(id),
  access_suspended_at timestamptz,
  suspension_reason text,
  suspended_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.business_admin_state enable row level security;
drop policy if exists "Platform admins manage business admin state" on public.business_admin_state;
create policy "Platform admins manage business admin state"
on public.business_admin_state for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

create or replace function public.set_business_archive(
  p_business_id uuid,
  p_archive boolean,
  p_suspend boolean default false,
  p_reason text default null
) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_platform_admin() then raise exception 'Only a platform administrator can archive a business.'; end if;
  if not exists(select 1 from public.business where id=p_business_id) then raise exception 'Business not found.'; end if;
  if p_archive and length(trim(coalesce(p_reason,'')))<3 then raise exception 'Enter a reason for archiving this business.'; end if;
  insert into public.business_admin_state(
    business_id,archived_at,archive_reason,archived_by,
    access_suspended_at,suspension_reason,suspended_by,updated_at
  ) values(
    p_business_id,
    case when p_archive then now() else null end,
    case when p_archive then trim(p_reason) else null end,
    case when p_archive then auth.uid() else null end,
    case when p_archive and p_suspend then now() else null end,
    case when p_archive and p_suspend then trim(p_reason) else null end,
    case when p_archive and p_suspend then auth.uid() else null end,
    now()
  ) on conflict(business_id) do update set
    archived_at=excluded.archived_at,
    archive_reason=excluded.archive_reason,
    archived_by=excluded.archived_by,
    access_suspended_at=case when p_archive and p_suspend then now() else business_admin_state.access_suspended_at end,
    suspension_reason=case when p_archive and p_suspend then trim(p_reason) else business_admin_state.suspension_reason end,
    suspended_by=case when p_archive and p_suspend then auth.uid() else business_admin_state.suspended_by end,
    updated_at=now();
end;
$$;
grant execute on function public.set_business_archive(uuid,boolean,boolean,text) to authenticated;

create or replace function public.set_business_suspension(
  p_business_id uuid,
  p_suspend boolean,
  p_reason text default null
) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_platform_admin() then raise exception 'Only a platform administrator can change business access.'; end if;
  if p_suspend and length(trim(coalesce(p_reason,'')))<3 then raise exception 'Enter a reason for suspending access.'; end if;
  insert into public.business_admin_state(business_id,access_suspended_at,suspension_reason,suspended_by,updated_at)
  values(p_business_id,case when p_suspend then now() else null end,case when p_suspend then trim(p_reason) else null end,case when p_suspend then auth.uid() else null end,now())
  on conflict(business_id) do update set access_suspended_at=excluded.access_suspended_at,suspension_reason=excluded.suspension_reason,suspended_by=excluded.suspended_by,updated_at=now();
end;
$$;
grant execute on function public.set_business_suspension(uuid,boolean,text) to authenticated;

drop function if exists public.get_subscription_access(uuid);
create function public.get_subscription_access(p_business_id uuid)
returns table(plan text,status text,trial_end timestamptz,current_period_end timestamptz,grace_period_end timestamptz,cancel_at_period_end boolean,sms_used integer,sms_limit integer,has_access boolean,is_complimentary boolean,access_override_expires_at timestamptz,access_override_reason text)
language sql stable security definer set search_path=public as $$
 select
  case when s.access_override_reason is not null and(s.access_override_expires_at is null or s.access_override_expires_at>now()) then coalesce(s.access_override_plan,s.plan) else s.plan end,
  case when a.access_suspended_at is not null then 'suspended' when s.access_override_reason is not null and(s.access_override_expires_at is null or s.access_override_expires_at>now()) then 'complimentary' else s.status end,
  s.trial_end,s.current_period_end,s.grace_period_end,s.cancel_at_period_end,s.sms_used,
  case when(case when s.access_override_reason is not null and(s.access_override_expires_at is null or s.access_override_expires_at>now()) then coalesce(s.access_override_plan,s.plan) else s.plan end)='pro' then 1000 else 250 end,
  (public.is_platform_admin() or(a.access_suspended_at is null and((s.access_override_reason is not null and(s.access_override_expires_at is null or s.access_override_expires_at>now())) or s.status='active' or(s.status='trialing' and coalesce(s.trial_end,now())>now()) or(s.status='past_due' and s.grace_period_end>now()))),
  (s.access_override_reason is not null and(s.access_override_expires_at is null or s.access_override_expires_at>now())),s.access_override_expires_at,s.access_override_reason
 from public.business_subscription s left join public.business_admin_state a on a.business_id=s.business_id
 where s.business_id=p_business_id and(public.user_belongs_to_business(p_business_id) or public.is_platform_admin());
$$;
grant execute on function public.get_subscription_access(uuid) to authenticated;

create or replace function public.has_subscription_access(p_business_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.is_platform_admin() or exists(
  select 1 from public.business_subscription s left join public.business_admin_state a on a.business_id=s.business_id
  where s.business_id=p_business_id and a.access_suspended_at is null and((s.access_override_reason is not null and(s.access_override_expires_at is null or s.access_override_expires_at>now())) or s.status='active' or(s.status='trialing' and coalesce(s.trial_end,now())>now()) or(s.status='past_due' and s.grace_period_end>now()))
 );
$$;
grant execute on function public.has_subscription_access(uuid) to authenticated;
