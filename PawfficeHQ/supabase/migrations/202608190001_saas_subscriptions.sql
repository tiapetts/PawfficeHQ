create table if not exists public.business_subscription (
  business_id uuid primary key references public.business(id) on delete cascade,
  plan text not null default 'pro' check (plan in ('basic', 'pro')),
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  trial_end timestamptz default (now() + interval '14 days'),
  current_period_end timestamptz,
  grace_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  sms_used integer not null default 0 check (sms_used >= 0),
  sms_period_start date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.business_subscription enable row level security;

insert into public.business_subscription (business_id)
select id from public.business
on conflict (business_id) do nothing;

create or replace function public.create_business_subscription()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.business_subscription (business_id) values (new.id)
  on conflict (business_id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_business_subscription_after_business on public.business;
create trigger create_business_subscription_after_business
after insert on public.business for each row execute function public.create_business_subscription();

create or replace function public.user_belongs_to_business(p_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public."STAFF"
    where business_id = p_business_id and auth_user_id = auth.uid()
  );
$$;

create policy "Business members can view subscription"
on public.business_subscription for select to authenticated
using (public.user_belongs_to_business(business_id) or public.is_platform_admin());

create or replace function public.get_subscription_access(p_business_id uuid)
returns table (
  plan text,
  status text,
  trial_end timestamptz,
  current_period_end timestamptz,
  grace_period_end timestamptz,
  cancel_at_period_end boolean,
  sms_used integer,
  sms_limit integer,
  has_access boolean
)
language sql stable security definer set search_path = public as $$
  select
    s.plan,
    s.status,
    s.trial_end,
    s.current_period_end,
    s.grace_period_end,
    s.cancel_at_period_end,
    s.sms_used,
    case when s.plan = 'pro' then 1000 else 250 end,
    (
      public.is_platform_admin()
      or s.status = 'active'
      or (s.status = 'trialing' and coalesce(s.trial_end, now()) > now())
      or (s.status = 'past_due' and s.grace_period_end > now())
    )
  from public.business_subscription s
  where s.business_id = p_business_id
    and (public.user_belongs_to_business(p_business_id) or public.is_platform_admin());
$$;

grant execute on function public.get_subscription_access(uuid) to authenticated;

create or replace function public.has_subscription_access(p_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists (
    select 1 from public.business_subscription s
    where s.business_id = p_business_id and (
      s.status = 'active'
      or (s.status = 'trialing' and coalesce(s.trial_end, now()) > now())
      or (s.status = 'past_due' and s.grace_period_end > now())
    )
  );
$$;

grant execute on function public.has_subscription_access(uuid) to authenticated;

-- Add a restrictive paywall to every current tenant table that has business_id.
-- STAFF remains readable so the app can identify the user's business before showing billing.
do $$
declare table_name text;
begin
  for table_name in
    select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'business_id'
      and t.table_type = 'BASE TABLE'
      and c.table_name not in ('business_subscription', 'STAFF')
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists "Active subscription required" on public.%I', table_name);
    execute format(
      'create policy "Active subscription required" on public.%I as restrictive for all to authenticated using (public.has_subscription_access(business_id)) with check (public.has_subscription_access(business_id))',
      table_name
    );
  end loop;
end $$;

create or replace function public.enforce_client_plan_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare current_plan text; client_total integer;
begin
  select plan into current_plan from public.business_subscription where business_id = new.business_id;
  if current_plan = 'basic' then
    select count(*) into client_total from public."CLIENT" where business_id = new.business_id;
    if client_total >= 100 then raise exception 'Basic includes up to 100 clients. Upgrade to Pro to add more.'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_client_plan_limit on public."CLIENT";
create trigger enforce_client_plan_limit before insert on public."CLIENT"
for each row execute function public.enforce_client_plan_limit();

create or replace function public.enforce_staff_plan_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare current_plan text; staff_total integer; staff_limit integer;
begin
  select plan into current_plan from public.business_subscription where business_id = new.business_id;
  staff_limit := case when current_plan = 'basic' then 2 else 10 end;
  select count(*) into staff_total from public."STAFF" where business_id = new.business_id;
  if staff_total >= staff_limit then raise exception '% includes up to % staff accounts.', initcap(coalesce(current_plan, 'Pro')), staff_limit; end if;
  return new;
end;
$$;

drop trigger if exists enforce_staff_plan_limit on public."STAFF";
create trigger enforce_staff_plan_limit before insert on public."STAFF"
for each row execute function public.enforce_staff_plan_limit();

create or replace function public.consume_sms_segments(p_business_id uuid, p_segments integer default 1)
returns table (allowed boolean, used integer, monthly_limit integer)
language plpgsql security definer set search_path = public as $$
declare row_data public.business_subscription%rowtype; plan_limit integer;
begin
  if p_segments < 1 then raise exception 'SMS segment count must be positive.'; end if;
  if not public.user_belongs_to_business(p_business_id) and not public.is_platform_admin() then raise exception 'Not authorized.'; end if;
  select * into row_data from public.business_subscription where business_id = p_business_id for update;
  if row_data.sms_period_start < date_trunc('month', current_date)::date then
    update public.business_subscription set sms_used = 0, sms_period_start = current_date where business_id = p_business_id
    returning * into row_data;
  end if;
  plan_limit := case when row_data.plan = 'pro' then 1000 else 250 end;
  if row_data.sms_used + p_segments > plan_limit then return query select false, row_data.sms_used, plan_limit; return; end if;
  update public.business_subscription set sms_used = sms_used + p_segments where business_id = p_business_id returning sms_used into row_data.sms_used;
  return query select true, row_data.sms_used, plan_limit;
end;
$$;

grant execute on function public.consume_sms_segments(uuid, integer) to authenticated;
