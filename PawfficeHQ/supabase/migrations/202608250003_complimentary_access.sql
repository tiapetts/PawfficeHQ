alter table public.business_subscription add column if not exists access_override_plan text check(access_override_plan in('basic','pro'));
alter table public.business_subscription add column if not exists access_override_expires_at timestamptz;
alter table public.business_subscription add column if not exists access_override_reason text;
alter table public.business_subscription add column if not exists access_override_granted_by uuid;
alter table public.business_subscription add column if not exists access_override_granted_at timestamptz;

create table if not exists public.complimentary_module_access(
 business_id uuid not null references public.business(id) on delete cascade,
 module_key text not null check(module_key in('pet_sitting','boarding_daycare','veterinary')),
 expires_at timestamptz, granted_by uuid, granted_at timestamptz not null default now(),
 primary key(business_id,module_key)
);
alter table public.complimentary_module_access enable row level security;
drop policy if exists "Business members view complimentary modules" on public.complimentary_module_access;
create policy "Business members view complimentary modules" on public.complimentary_module_access for select to authenticated using(public.user_belongs_to_business(business_id) or public.is_platform_admin());
drop policy if exists "Platform admins manage complimentary modules" on public.complimentary_module_access;
create policy "Platform admins manage complimentary modules" on public.complimentary_module_access for all to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
drop policy if exists "Platform admins manage complimentary subscriptions" on public.business_subscription;
create policy "Platform admins manage complimentary subscriptions" on public.business_subscription for update to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());

drop function if exists public.get_subscription_access(uuid);
create function public.get_subscription_access(p_business_id uuid)
returns table(plan text,status text,trial_end timestamptz,current_period_end timestamptz,grace_period_end timestamptz,cancel_at_period_end boolean,sms_used integer,sms_limit integer,has_access boolean,is_complimentary boolean,access_override_expires_at timestamptz,access_override_reason text)
language sql stable security definer set search_path=public as $$
 select case when s.access_override_reason is not null and(s.access_override_expires_at is null or s.access_override_expires_at>now()) then coalesce(s.access_override_plan,s.plan) else s.plan end,
 case when s.access_override_reason is not null and(s.access_override_expires_at is null or s.access_override_expires_at>now()) then 'complimentary' else s.status end,
 s.trial_end,s.current_period_end,s.grace_period_end,s.cancel_at_period_end,s.sms_used,
 case when(case when s.access_override_reason is not null and(s.access_override_expires_at is null or s.access_override_expires_at>now()) then coalesce(s.access_override_plan,s.plan) else s.plan end)='pro' then 1000 else 250 end,
 (public.is_platform_admin() or(s.access_override_reason is not null and(s.access_override_expires_at is null or s.access_override_expires_at>now())) or s.status='active' or(s.status='trialing' and coalesce(s.trial_end,now())>now()) or(s.status='past_due' and s.grace_period_end>now())),
 (s.access_override_reason is not null and(s.access_override_expires_at is null or s.access_override_expires_at>now())),s.access_override_expires_at,s.access_override_reason
 from public.business_subscription s where s.business_id=p_business_id and(public.user_belongs_to_business(p_business_id) or public.is_platform_admin());
$$;
grant execute on function public.get_subscription_access(uuid) to authenticated;

create or replace function public.has_subscription_access(p_business_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.is_platform_admin() or exists(select 1 from public.business_subscription s where s.business_id=p_business_id and((s.access_override_reason is not null and(s.access_override_expires_at is null or s.access_override_expires_at>now())) or s.status='active' or(s.status='trialing' and coalesce(s.trial_end,now())>now()) or(s.status='past_due' and s.grace_period_end>now())));
$$;
grant execute on function public.has_subscription_access(uuid) to authenticated;

create or replace function public.has_module_entitlement(target_business_id uuid,target_module text) returns boolean language sql stable security definer set search_path=public as $$
 select public.is_platform_admin() or exists(select 1 from public.business_module_entitlement e where e.business_id=target_business_id and e.module_key=target_module and e.status in('active','trialing') and(e.expires_at is null or e.expires_at>now())) or exists(select 1 from public.complimentary_module_access c join public.business_subscription s on s.business_id=c.business_id where c.business_id=target_business_id and c.module_key=target_module and(c.expires_at is null or c.expires_at>now()) and s.access_override_reason is not null and(s.access_override_expires_at is null or s.access_override_expires_at>now()));
$$;
grant execute on function public.has_module_entitlement(uuid,text) to authenticated;
