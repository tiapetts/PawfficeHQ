create table if not exists public.pet_report_card (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business(id) on delete cascade,
  appointment_id uuid not null references public.appointment(id) on delete cascade,
  pet_id bigint not null references public."PET"(id) on delete restrict,
  client_id bigint not null references public."CLIENT"(id) on delete restrict,
  staff_id uuid references public."STAFF"(id) on delete set null,
  report_type text not null check (report_type in ('grooming','daycare','boarding','pet_sitting')),
  status text not null default 'draft' check (status in ('draft','completed')),
  visit_summary text,
  behavior text,
  food text,
  water text,
  potty text,
  medication text,
  activity text,
  staff_notes text,
  before_photo_path text,
  after_photo_path text,
  completed_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id, pet_id)
);

create index if not exists pet_report_card_business_created_idx on public.pet_report_card (business_id, created_at desc);
create index if not exists pet_report_card_pet_idx on public.pet_report_card (business_id, pet_id, created_at desc);
alter table public.pet_report_card enable row level security;

create or replace function public.can_access_report_card_business(target_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists (
    select 1 from public."STAFF" staff
    where staff.auth_user_id = auth.uid() and staff.is_active = true
      and staff.business_id = target_business_id
      and public.has_subscription_access(target_business_id)
  );
$$;
revoke all on function public.can_access_report_card_business(uuid) from public;
grant execute on function public.can_access_report_card_business(uuid) to authenticated;

drop policy if exists "Business members manage report cards" on public.pet_report_card;
create policy "Business members manage report cards" on public.pet_report_card for all to authenticated
using (public.can_access_report_card_business(business_id))
with check (public.can_access_report_card_business(business_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-card-photos','report-card-photos',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Business members view report card photos" on storage.objects;
create policy "Business members view report card photos" on storage.objects for select to authenticated
using (bucket_id='report-card-photos' and public.can_access_report_card_business(((storage.foldername(name))[1])::uuid));
drop policy if exists "Business members upload report card photos" on storage.objects;
create policy "Business members upload report card photos" on storage.objects for insert to authenticated
with check (bucket_id='report-card-photos' and public.can_access_report_card_business(((storage.foldername(name))[1])::uuid));
drop policy if exists "Business members update report card photos" on storage.objects;
create policy "Business members update report card photos" on storage.objects for update to authenticated
using (bucket_id='report-card-photos' and public.can_access_report_card_business(((storage.foldername(name))[1])::uuid))
with check (bucket_id='report-card-photos' and public.can_access_report_card_business(((storage.foldername(name))[1])::uuid));
drop policy if exists "Business members delete report card photos" on storage.objects;
create policy "Business members delete report card photos" on storage.objects for delete to authenticated
using (bucket_id='report-card-photos' and public.can_access_report_card_business(((storage.foldername(name))[1])::uuid));
