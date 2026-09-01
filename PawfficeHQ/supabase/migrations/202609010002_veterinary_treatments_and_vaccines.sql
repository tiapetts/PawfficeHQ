-- Encounter-linked treatments and clinic-administered vaccines.

alter table public.pet_vaccination
  add column if not exists encounter_id uuid references public.vet_encounter(id) on delete set null,
  add column if not exists administration_site text,
  add column if not exists administered_by uuid references public."STAFF"(id) on delete set null;

create index if not exists pet_vaccination_encounter_idx
  on public.pet_vaccination (encounter_id) where encounter_id is not null;

create table if not exists public.vet_treatment (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business(id) on delete cascade,
  pet_id bigint not null references public."PET"(id) on delete cascade,
  encounter_id uuid not null references public.vet_encounter(id) on delete cascade,
  treatment_type text not null default 'treatment'
    check (treatment_type in ('treatment','procedure','injection','diagnostic','supportive_care','other')),
  name text not null,
  dose text,
  route text,
  administration_site text,
  quantity text,
  notes text,
  performed_at timestamptz not null default now(),
  performed_by uuid references public."STAFF"(id) on delete set null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vet_treatment_encounter_idx
  on public.vet_treatment (encounter_id, performed_at);
create index if not exists vet_treatment_pet_idx
  on public.vet_treatment (business_id, pet_id, performed_at desc);

alter table public.vet_treatment enable row level security;
drop policy if exists "Veterinary staff access vet_treatment" on public.vet_treatment;
create policy "Veterinary staff access vet_treatment" on public.vet_treatment
for all to authenticated
using (
  public.can_access_business_module(business_id)
  and public.has_module_entitlement(business_id, 'veterinary')
)
with check (
  public.can_access_business_module(business_id)
  and public.has_module_entitlement(business_id, 'veterinary')
);

create or replace function public.protect_vet_encounter_child_record()
returns trigger language plpgsql set search_path = public as $$
declare linked_encounter uuid; linked_status text; linked_business uuid; linked_pet bigint;
begin
  if tg_op = 'UPDATE' and old.encounter_id is not null and old.encounter_id is distinct from new.encounter_id then
    raise exception 'An encounter-linked clinical record cannot be moved or unlinked.';
  end if;
  linked_encounter := case
    when tg_op = 'DELETE' then old.encounter_id
    when tg_op = 'UPDATE' then coalesce(old.encounter_id, new.encounter_id)
    else new.encounter_id
  end;
  if linked_encounter is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select status, business_id, pet_id into linked_status, linked_business, linked_pet
  from public.vet_encounter where id = linked_encounter;
  if linked_status is null then raise exception 'Linked veterinary encounter was not found.'; end if;
  if linked_status is distinct from 'draft' then
    raise exception 'Treatments and administered vaccines are locked when the encounter is finalized.';
  end if;
  if tg_op <> 'DELETE' and (new.business_id is distinct from linked_business or new.pet_id is distinct from linked_pet) then
    raise exception 'Clinical record must belong to the same business and patient as its encounter.';
  end if;
  if tg_op <> 'DELETE' and tg_table_name = 'vet_treatment' then new.updated_at := now(); end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists protect_vet_treatment on public.vet_treatment;
create trigger protect_vet_treatment
before insert or update or delete on public.vet_treatment
for each row execute function public.protect_vet_encounter_child_record();

drop trigger if exists protect_encounter_vaccination on public.pet_vaccination;
create trigger protect_encounter_vaccination
before insert or update or delete on public.pet_vaccination
for each row execute function public.protect_vet_encounter_child_record();

drop trigger if exists audit_vet_treatment on public.vet_treatment;
create trigger audit_vet_treatment after insert or update or delete on public.vet_treatment
for each row execute function public.audit_vet_record_change();
