create table if not exists public.mobile_grooming_settings (
  business_id uuid primary key references public.business(id) on delete cascade,
  is_enabled boolean not null default false,
  base_address text,
  vehicle_name text,
  travel_buffer_minutes integer not null default 15 check (travel_buffer_minutes between 0 and 180),
  mileage_rate numeric(8,3) not null default 0 check (mileage_rate >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.mobile_grooming_travel_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business(id) on delete cascade,
  staff_id uuid references public."STAFF"(id) on delete set null,
  log_date date not null default current_date,
  entry_type text not null check (entry_type in ('mileage','fuel')),
  vehicle_name text,
  start_odometer numeric(10,1),
  end_odometer numeric(10,1),
  business_miles numeric(10,1) generated always as (
    case when entry_type = 'mileage' then greatest(coalesce(end_odometer, 0) - coalesce(start_odometer, 0), 0) else 0 end
  ) stored,
  fuel_gallons numeric(8,3),
  fuel_cost numeric(10,2),
  notes text,
  created_at timestamptz not null default now(),
  check (entry_type <> 'mileage' or (start_odometer is not null and end_odometer is not null and end_odometer >= start_odometer)),
  check (entry_type <> 'fuel' or (fuel_gallons is not null and fuel_gallons > 0 and fuel_cost is not null and fuel_cost >= 0))
);

create index if not exists mobile_grooming_travel_log_business_date_idx
  on public.mobile_grooming_travel_log(business_id, log_date desc);

alter table public.mobile_grooming_settings enable row level security;
alter table public.mobile_grooming_travel_log enable row level security;

create policy "Grooming staff manage mobile settings"
  on public.mobile_grooming_settings for all to authenticated
  using (public.can_access_business_module(business_id))
  with check (public.can_access_business_module(business_id));

create policy "Grooming staff manage travel logs"
  on public.mobile_grooming_travel_log for all to authenticated
  using (public.can_access_business_module(business_id))
  with check (public.can_access_business_module(business_id));

