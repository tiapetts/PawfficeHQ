create table if not exists public.vaccine_requirement (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business(id) on delete cascade,
  name text not null,
  species text not null default 'All',
  proof_required boolean not null default true,
  alert_days_before integer not null default 30 check (alert_days_before between 0 and 365),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, name, species)
);

create table if not exists public.pet_vaccination (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business(id) on delete cascade,
  pet_id bigint not null references public."PET"(id) on delete cascade,
  requirement_id uuid references public.vaccine_requirement(id) on delete set null,
  vaccine_name text not null,
  administered_on date,
  expires_on date not null,
  provider text,
  lot_number text,
  proof_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vaccine_requirement_business_idx
  on public.vaccine_requirement (business_id, is_active);
create index if not exists pet_vaccination_business_pet_idx
  on public.pet_vaccination (business_id, pet_id);
create index if not exists pet_vaccination_expiration_idx
  on public.pet_vaccination (business_id, expires_on);

alter table public.vaccine_requirement enable row level security;
alter table public.pet_vaccination enable row level security;

drop policy if exists "Business members manage vaccine requirements" on public.vaccine_requirement;
create policy "Business members manage vaccine requirements"
on public.vaccine_requirement for all to authenticated
using (
  public.is_platform_admin() or exists (
    select 1 from public."STAFF" staff
    where staff.auth_user_id = auth.uid() and staff.is_active = true
      and staff.business_id = vaccine_requirement.business_id
      and public.has_subscription_access(staff.business_id)
  )
)
with check (
  exists (
    select 1 from public."STAFF" staff
    where staff.auth_user_id = auth.uid() and staff.is_active = true
      and staff.business_id = vaccine_requirement.business_id
      and public.has_subscription_access(staff.business_id)
  )
);

drop policy if exists "Business members manage pet vaccinations" on public.pet_vaccination;
create policy "Business members manage pet vaccinations"
on public.pet_vaccination for all to authenticated
using (
  public.is_platform_admin() or exists (
    select 1 from public."STAFF" staff
    where staff.auth_user_id = auth.uid() and staff.is_active = true
      and staff.business_id = pet_vaccination.business_id
      and public.has_subscription_access(staff.business_id)
  )
)
with check (
  exists (
    select 1 from public."STAFF" staff
    where staff.auth_user_id = auth.uid() and staff.is_active = true
      and staff.business_id = pet_vaccination.business_id
      and public.has_subscription_access(staff.business_id)
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vaccination-proofs', 'vaccination-proofs', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Business members view vaccination proofs" on storage.objects;
create policy "Business members view vaccination proofs"
on storage.objects for select to authenticated
using (
  bucket_id = 'vaccination-proofs' and (
    public.is_platform_admin() or exists (
      select 1 from public."STAFF" staff
      where staff.auth_user_id = auth.uid() and staff.is_active = true
        and public.has_subscription_access(staff.business_id)
        and staff.business_id::text = (storage.foldername(name))[1]
    )
  )
);

drop policy if exists "Business members upload vaccination proofs" on storage.objects;
create policy "Business members upload vaccination proofs"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'vaccination-proofs' and exists (
    select 1 from public."STAFF" staff
    where staff.auth_user_id = auth.uid() and staff.is_active = true
      and public.has_subscription_access(staff.business_id)
      and staff.business_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "Business members update vaccination proofs" on storage.objects;
create policy "Business members update vaccination proofs"
on storage.objects for update to authenticated
using (
  bucket_id = 'vaccination-proofs' and exists (
    select 1 from public."STAFF" staff
    where staff.auth_user_id = auth.uid() and staff.is_active = true
      and public.has_subscription_access(staff.business_id)
      and staff.business_id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'vaccination-proofs' and exists (
    select 1 from public."STAFF" staff
    where staff.auth_user_id = auth.uid() and staff.is_active = true
      and public.has_subscription_access(staff.business_id)
      and staff.business_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "Business members delete vaccination proofs" on storage.objects;
create policy "Business members delete vaccination proofs"
on storage.objects for delete to authenticated
using (
  bucket_id = 'vaccination-proofs' and exists (
    select 1 from public."STAFF" staff
    where staff.auth_user_id = auth.uid() and staff.is_active = true
      and public.has_subscription_access(staff.business_id)
      and staff.business_id::text = (storage.foldername(name))[1]
  )
);
