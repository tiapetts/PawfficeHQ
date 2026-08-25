create table if not exists public.business_module_entitlement (
  business_id uuid not null references public.business(id) on delete cascade,
  module_key text not null check (module_key in ('grooming','pet_sitting','boarding_daycare','veterinary')),
  status text not null default 'active' check (status in ('active','trialing','pending','revoked','expired')),
  source text not null default 'manual' check (source in ('included','subscription','manual','trial','grandfathered')),
  granted_at timestamptz not null default now(), expires_at timestamptz,
  updated_at timestamptz not null default now(), primary key (business_id,module_key)
);
create table if not exists public.module_access_request (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.business(id) on delete cascade,
  module_key text not null check (module_key in ('pet_sitting','boarding_daycare','veterinary')),
  request_type text not null default 'upgrade' check (request_type in ('upgrade','approval','question')),
  status text not null default 'pending' check (status in ('pending','approved','denied','cancelled')),
  message text, requested_by uuid not null default auth.uid(), reviewed_by uuid, reviewed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists module_access_request_one_pending_idx on public.module_access_request(business_id,module_key) where status='pending';
create index if not exists module_access_request_status_idx on public.module_access_request(status,created_at desc);
insert into public.business_module_entitlement(business_id,module_key,status,source) select id,'grooming','active','included' from public.business on conflict do nothing;
insert into public.business_module_entitlement(business_id,module_key,status,source) select business_id,module_key,'active','grandfathered' from public.business_module where is_enabled=true on conflict do nothing;
alter table public.business_module_entitlement enable row level security;
alter table public.module_access_request enable row level security;
drop policy if exists "Business members view module entitlements" on public.business_module_entitlement;
create policy "Business members view module entitlements" on public.business_module_entitlement for select to authenticated using(public.can_access_business_module(business_id));
drop policy if exists "Platform admins manage module entitlements" on public.business_module_entitlement;
create policy "Platform admins manage module entitlements" on public.business_module_entitlement for all to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
drop policy if exists "Business members create module requests" on public.module_access_request;
create policy "Business members create module requests" on public.module_access_request for insert to authenticated with check(public.can_access_business_module(business_id) and requested_by=auth.uid());
drop policy if exists "Business members view module requests" on public.module_access_request;
create policy "Business members view module requests" on public.module_access_request for select to authenticated using(public.can_access_business_module(business_id));
drop policy if exists "Platform admins manage module requests" on public.module_access_request;
create policy "Platform admins manage module requests" on public.module_access_request for all to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
create or replace function public.has_module_entitlement(target_business_id uuid,target_module text) returns boolean language sql stable security definer set search_path=public as $$
 select public.is_platform_admin() or exists(select 1 from public.business_module_entitlement e where e.business_id=target_business_id and e.module_key=target_module and e.status in('active','trialing') and(e.expires_at is null or e.expires_at>now()));
$$;
revoke all on function public.has_module_entitlement(uuid,text) from public;
grant execute on function public.has_module_entitlement(uuid,text) to authenticated;
drop policy if exists "Business members update modules" on public.business_module;
create policy "Business members update modules" on public.business_module for update to authenticated using(public.can_access_business_module(business_id)) with check(public.can_access_business_module(business_id) and public.has_module_entitlement(business_id,module_key));
drop policy if exists "Pet sitting entitlement required" on public.pet_sitting_booking;
create policy "Pet sitting entitlement required" on public.pet_sitting_booking as restrictive for all to authenticated using(public.has_module_entitlement(business_id,'pet_sitting')) with check(public.has_module_entitlement(business_id,'pet_sitting'));
drop policy if exists "Boarding entitlement required" on public.boarding_booking;
create policy "Boarding entitlement required" on public.boarding_booking as restrictive for all to authenticated using(public.has_module_entitlement(business_id,'boarding_daycare')) with check(public.has_module_entitlement(business_id,'boarding_daycare'));
drop policy if exists "Boarding space entitlement required" on public.boarding_space;
create policy "Boarding space entitlement required" on public.boarding_space as restrictive for all to authenticated using(public.has_module_entitlement(business_id,'boarding_daycare')) with check(public.has_module_entitlement(business_id,'boarding_daycare'));
drop policy if exists "Boarding service entitlement required" on public.boarding_service;
create policy "Boarding service entitlement required" on public.boarding_service as restrictive for all to authenticated using(public.has_module_entitlement(business_id,'boarding_daycare')) with check(public.has_module_entitlement(business_id,'boarding_daycare'));
