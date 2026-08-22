create table if not exists public.business_module (
  business_id uuid not null references public.business(id) on delete cascade,
  module_key text not null check (module_key in ('grooming','pet_sitting','boarding_daycare','veterinary')),
  is_enabled boolean not null default false,
  enabled_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (business_id, module_key)
);

insert into public.business_module (business_id, module_key, is_enabled, enabled_at)
select business.id, modules.module_key,
  modules.module_key = 'grooming',
  case when modules.module_key = 'grooming' then now() else null end
from public.business
cross join (values ('grooming'),('pet_sitting'),('boarding_daycare'),('veterinary')) as modules(module_key)
on conflict (business_id, module_key) do nothing;

create index if not exists business_module_enabled_idx on public.business_module (business_id, is_enabled);
alter table public.business_module enable row level security;

create or replace function public.can_access_business_module(target_business_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_platform_admin() or exists (
    select 1 from public."STAFF" staff
    where staff.auth_user_id=auth.uid() and staff.is_active=true
      and staff.business_id=target_business_id
      and public.has_subscription_access(target_business_id)
  );
$$;
revoke all on function public.can_access_business_module(uuid) from public;
grant execute on function public.can_access_business_module(uuid) to authenticated;

drop policy if exists "Business members view modules" on public.business_module;
create policy "Business members view modules" on public.business_module for select to authenticated
using (public.can_access_business_module(business_id));
drop policy if exists "Business members update modules" on public.business_module;
create policy "Business members update modules" on public.business_module for update to authenticated
using (public.can_access_business_module(business_id))
with check (public.can_access_business_module(business_id));
