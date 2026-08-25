create table if not exists public.boarding_service(
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.business(id) on delete cascade,
 name text not null, service_type text not null default 'boarding' check(service_type in('boarding','daycare')),
 billing_unit text not null default 'night' check(billing_unit in('night','day')),
 unit_price numeric(10,2) not null check(unit_price>=0), is_active boolean not null default true,
 description text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.boarding_booking add column if not exists boarding_service_id uuid references public.boarding_service(id);
alter table public.boarding_booking add column if not exists invoice_id uuid references public.invoice(id);
create index if not exists boarding_service_business_idx on public.boarding_service(business_id,is_active);
alter table public.boarding_service enable row level security;
drop policy if exists "Staff manage boarding services" on public.boarding_service;
create policy "Staff manage boarding services" on public.boarding_service for all to authenticated using(public.can_access_business_module(business_id)) with check(public.can_access_business_module(business_id));
