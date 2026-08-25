alter table public.boarding_booking add column if not exists business_id uuid references public.business(id);
alter table public.boarding_booking add column if not exists client_id bigint references public."CLIENT"(id);
alter table public.boarding_booking add column if not exists start_at timestamptz;
alter table public.boarding_booking add column if not exists end_at timestamptz;
alter table public.boarding_booking add column if not exists booking_type text not null default 'boarding';
alter table public.boarding_booking add column if not exists status text not null default 'reserved';
alter table public.boarding_booking add column if not exists space_id uuid;
alter table public.boarding_booking add column if not exists belongings text[] not null default '{}';
alter table public.boarding_booking add column if not exists medication_notes text;
alter table public.boarding_booking add column if not exists emergency_notes text;
alter table public.boarding_booking add column if not exists updated_at timestamptz not null default now();
alter table public.boarding_booking alter column appointment_id drop not null;

update public.boarding_booking b
set business_id=coalesce(b.business_id,a.business_id),client_id=coalesce(b.client_id,a.client_id),start_at=coalesce(b.start_at,a.start_at),end_at=coalesce(b.end_at,a.end_at)
from public.appointment a where b.appointment_id=a.id;

create table if not exists public.boarding_space(
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.business(id) on delete cascade,
 name text not null, space_type text not null default 'kennel', capacity integer not null default 1 check(capacity>0),
 is_active boolean not null default true, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(business_id,name)
);

do $$ begin
 alter table public.boarding_booking add constraint boarding_booking_space_id_fkey foreign key(space_id) references public.boarding_space(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.boarding_booking_pet(
 booking_id uuid not null references public.boarding_booking(id) on delete cascade,
 pet_id bigint not null references public."PET"(id), primary key(booking_id,pet_id)
);

insert into public.boarding_booking_pet(booking_id,pet_id)
select distinct b.id,ap.pet_id from public.boarding_booking b join public.appointment_pet ap on ap.appointment_id=b.appointment_id
on conflict do nothing;

create table if not exists public.boarding_care_log(
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.boarding_booking(id) on delete cascade,
 pet_id bigint references public."PET"(id), staff_id uuid references public."STAFF"(id), logged_at timestamptz not null default now(),
 log_type text not null default 'general', notes text, food_completed boolean not null default false,
 water_completed boolean not null default false, potty_completed boolean not null default false,
 medication_completed boolean not null default false, activity_completed boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index if not exists boarding_booking_business_dates_idx on public.boarding_booking(business_id,start_at,end_at);
create index if not exists boarding_care_log_booking_idx on public.boarding_care_log(booking_id,logged_at desc);
alter table public.boarding_booking enable row level security;
alter table public.boarding_space enable row level security;
alter table public.boarding_booking_pet enable row level security;
alter table public.boarding_care_log enable row level security;

drop policy if exists "Staff manage boarding bookings" on public.boarding_booking;
create policy "Staff manage boarding bookings" on public.boarding_booking for all to authenticated using(public.can_access_business_module(business_id)) with check(public.can_access_business_module(business_id));
drop policy if exists "Staff manage boarding spaces" on public.boarding_space;
create policy "Staff manage boarding spaces" on public.boarding_space for all to authenticated using(public.can_access_business_module(business_id)) with check(public.can_access_business_module(business_id));
drop policy if exists "Staff manage boarding pets" on public.boarding_booking_pet;
create policy "Staff manage boarding pets" on public.boarding_booking_pet for all to authenticated using(exists(select 1 from public.boarding_booking b where b.id=booking_id and public.can_access_business_module(b.business_id))) with check(exists(select 1 from public.boarding_booking b where b.id=booking_id and public.can_access_business_module(b.business_id)));
drop policy if exists "Staff manage boarding logs" on public.boarding_care_log;
create policy "Staff manage boarding logs" on public.boarding_care_log for all to authenticated using(exists(select 1 from public.boarding_booking b where b.id=booking_id and public.can_access_business_module(b.business_id))) with check(exists(select 1 from public.boarding_booking b where b.id=booking_id and public.can_access_business_module(b.business_id)));
