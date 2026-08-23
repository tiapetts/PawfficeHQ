create table if not exists public.pet_sitting_booking (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.business(id) on delete cascade,
 client_id bigint not null references public."CLIENT"(id) on delete restrict, start_date date not null, end_date date not null,
 status text not null default 'confirmed' check(status in('requested','confirmed','in_progress','completed','cancelled')),
 emergency_contact_name text, emergency_contact_phone text, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(end_date>=start_date)
);
create table if not exists public.pet_sitting_booking_pet (
 booking_id uuid not null references public.pet_sitting_booking(id) on delete cascade,
 pet_id bigint not null references public."PET"(id) on delete restrict, primary key(booking_id,pet_id)
);
create table if not exists public.pet_sitting_care_plan (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.pet_sitting_booking(id) on delete cascade,
 pet_id bigint not null references public."PET"(id) on delete restrict, feeding text, water text, medication text, potty text, activity text, additional_instructions text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(booking_id,pet_id)
);
create table if not exists public.pet_sitting_visit (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.pet_sitting_booking(id) on delete cascade,
 staff_id uuid references public."STAFF"(id) on delete set null, scheduled_start timestamptz not null, scheduled_end timestamptz,
 status text not null default 'scheduled' check(status in('scheduled','in_progress','completed','missed','cancelled')),
 arrived_at timestamptz, departed_at timestamptz, checklist jsonb not null default '{"food":false,"water":false,"potty":false,"medication":false,"activity":false}'::jsonb,
 internal_notes text, parent_update text, photo_path text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.pet_sitting_access (
 booking_id uuid primary key references public.pet_sitting_booking(id) on delete cascade,
 entry_method text, entry_instructions text, alarm_instructions text, key_return_instructions text, updated_at timestamptz not null default now()
);

-- Upgrade PawfficeHQ's earlier appointment-linked pet-sitting tables in place.
alter table public.pet_sitting_booking
 add column if not exists business_id uuid,
 add column if not exists client_id bigint,
 add column if not exists start_date date,
 add column if not exists end_date date,
 add column if not exists status text not null default 'confirmed',
 add column if not exists emergency_contact_name text,
 add column if not exists emergency_contact_phone text,
 add column if not exists notes text,
 add column if not exists updated_at timestamptz not null default now();

do $$ begin
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='pet_sitting_booking' and column_name='appointment_id') then
  execute 'update public.pet_sitting_booking booking set business_id=coalesce(booking.business_id,appointment.business_id), client_id=coalesce(booking.client_id,appointment.client_id), start_date=coalesce(booking.start_date,appointment.start_at::date), end_date=coalesce(booking.end_date,appointment.end_at::date), notes=coalesce(booking.notes,booking.home_care_notes,booking.emergency_notes) from public.appointment appointment where booking.appointment_id=appointment.id and (booking.business_id is null or booking.client_id is null or booking.start_date is null or booking.end_date is null)';
  alter table public.pet_sitting_booking alter column appointment_id drop not null;
 end if;
end $$;

alter table public.pet_sitting_visit
 add column if not exists booking_id uuid,
 add column if not exists scheduled_start timestamptz,
 add column if not exists scheduled_end timestamptz,
 add column if not exists departed_at timestamptz,
 add column if not exists checklist jsonb not null default '{"food":false,"water":false,"potty":false,"medication":false,"activity":false}'::jsonb,
 add column if not exists internal_notes text,
 add column if not exists parent_update text,
 add column if not exists photo_path text,
 add column if not exists updated_at timestamptz not null default now();

do $$ begin
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='pet_sitting_visit' and column_name='pet_sitting_booking_id') then
  execute 'update public.pet_sitting_visit set booking_id=coalesce(booking_id,pet_sitting_booking_id), scheduled_start=coalesce(scheduled_start,scheduled_start_at), scheduled_end=coalesce(scheduled_end,scheduled_end_at), departed_at=coalesce(departed_at,completed_at), internal_notes=coalesce(internal_notes,visit_notes) where booking_id is null or scheduled_start is null';
  alter table public.pet_sitting_visit alter column pet_sitting_booking_id drop not null;
 end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='pet_sitting_visit' and column_name='scheduled_start_at') then
  alter table public.pet_sitting_visit alter column scheduled_start_at drop not null;
 end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='pet_sitting_visit' and column_name='scheduled_end_at') then
  alter table public.pet_sitting_visit alter column scheduled_end_at drop not null;
 end if;
end $$;

do $$ begin
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='pet_sitting_booking' and column_name='appointment_id') then
  execute 'insert into public.pet_sitting_booking_pet(booking_id,pet_id) select booking.id,link.pet_id from public.pet_sitting_booking booking join public.appointment_pet link on link.appointment_id=booking.appointment_id on conflict(booking_id,pet_id) do nothing';
  execute 'insert into public.pet_sitting_care_plan(booking_id,pet_id,additional_instructions) select booking.id,link.pet_id,booking.home_care_notes from public.pet_sitting_booking booking join public.pet_sitting_booking_pet link on link.booking_id=booking.id on conflict(booking_id,pet_id) do nothing';
  execute 'insert into public.pet_sitting_access(booking_id,entry_instructions) select id,home_entry_notes from public.pet_sitting_booking where home_entry_notes is not null on conflict(booking_id) do update set entry_instructions=coalesce(public.pet_sitting_access.entry_instructions,excluded.entry_instructions)';
 end if;
end $$;
create index if not exists pet_sitting_booking_business_dates_idx on public.pet_sitting_booking(business_id,start_date,end_date);
create index if not exists pet_sitting_visit_booking_time_idx on public.pet_sitting_visit(booking_id,scheduled_start);

create or replace function public.can_access_pet_sitting(target_booking_id uuid, sensitive boolean default false)
returns boolean language sql stable security definer set search_path=public as $$
 select public.is_platform_admin() or exists(
  select 1 from public.pet_sitting_booking booking join public."STAFF" staff on staff.business_id=booking.business_id
  where booking.id=target_booking_id and staff.auth_user_id=auth.uid() and staff.is_active=true
   and public.has_subscription_access(booking.business_id)
   and (not sensitive or lower(coalesce(staff.role,'')) in('owner','admin','manager') or lower(coalesce(staff.job_title,'')) like '%manager%'
    or exists(select 1 from public.pet_sitting_visit visit where visit.booking_id=booking.id and visit.staff_id=staff.id))
 );
$$;
revoke all on function public.can_access_pet_sitting(uuid,boolean) from public;
grant execute on function public.can_access_pet_sitting(uuid,boolean) to authenticated;

alter table public.pet_sitting_booking enable row level security; alter table public.pet_sitting_booking_pet enable row level security;
alter table public.pet_sitting_care_plan enable row level security; alter table public.pet_sitting_visit enable row level security; alter table public.pet_sitting_access enable row level security;
drop policy if exists "Staff manage pet sitting bookings" on public.pet_sitting_booking;
create policy "Staff manage pet sitting bookings" on public.pet_sitting_booking for all to authenticated using(public.can_access_business_module(business_id)) with check(public.can_access_business_module(business_id));
drop policy if exists "Staff manage pet sitting pets" on public.pet_sitting_booking_pet;
create policy "Staff manage pet sitting pets" on public.pet_sitting_booking_pet for all to authenticated using(public.can_access_pet_sitting(booking_id)) with check(public.can_access_pet_sitting(booking_id));
drop policy if exists "Staff manage pet sitting care" on public.pet_sitting_care_plan;
create policy "Staff manage pet sitting care" on public.pet_sitting_care_plan for all to authenticated using(public.can_access_pet_sitting(booking_id)) with check(public.can_access_pet_sitting(booking_id));
drop policy if exists "Staff manage pet sitting visits" on public.pet_sitting_visit;
create policy "Staff manage pet sitting visits" on public.pet_sitting_visit for all to authenticated using(public.can_access_pet_sitting(booking_id)) with check(public.can_access_pet_sitting(booking_id));
drop policy if exists "Assigned staff access home entry" on public.pet_sitting_access;
create policy "Assigned staff access home entry" on public.pet_sitting_access for all to authenticated using(public.can_access_pet_sitting(booking_id,true)) with check(public.can_access_pet_sitting(booking_id,true));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('pet-sitting-photos','pet-sitting-photos',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Staff view pet sitting photos" on storage.objects;
create policy "Staff view pet sitting photos" on storage.objects for select to authenticated using(bucket_id='pet-sitting-photos' and public.can_access_business_module(((storage.foldername(name))[1])::uuid));
drop policy if exists "Staff upload pet sitting photos" on storage.objects;
create policy "Staff upload pet sitting photos" on storage.objects for insert to authenticated with check(bucket_id='pet-sitting-photos' and public.can_access_business_module(((storage.foldername(name))[1])::uuid));
drop policy if exists "Staff update pet sitting photos" on storage.objects;
create policy "Staff update pet sitting photos" on storage.objects for update to authenticated using(bucket_id='pet-sitting-photos' and public.can_access_business_module(((storage.foldername(name))[1])::uuid)) with check(bucket_id='pet-sitting-photos' and public.can_access_business_module(((storage.foldername(name))[1])::uuid));
drop policy if exists "Staff delete pet sitting photos" on storage.objects;
create policy "Staff delete pet sitting photos" on storage.objects for delete to authenticated using(bucket_id='pet-sitting-photos' and public.can_access_business_module(((storage.foldername(name))[1])::uuid));
