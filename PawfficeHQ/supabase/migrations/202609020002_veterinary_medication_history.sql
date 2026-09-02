-- Non-controlled medication orders and longitudinal medication history.

create table if not exists public.vet_medication_order (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business(id) on delete cascade,
  pet_id bigint not null references public."PET"(id) on delete cascade,
  encounter_id uuid references public.vet_encounter(id) on delete set null,
  medication_name text not null,
  strength text,
  dosage text not null,
  route text not null,
  frequency text not null,
  duration text,
  quantity text,
  refills integer not null default 0 check (refills between 0 and 99),
  indication text,
  instructions text not null,
  prescribing_veterinarian text not null,
  license_number text,
  license_state text,
  start_on date not null default current_date,
  end_on date,
  status text not null default 'active' check (status in ('active','completed','discontinued')),
  is_controlled boolean not null default false check (is_controlled = false),
  discontinued_reason text,
  discontinued_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vet_medication_pet_idx on public.vet_medication_order (business_id,pet_id,status,start_on desc);
create index if not exists vet_medication_encounter_idx on public.vet_medication_order (encounter_id) where encounter_id is not null;

alter table public.vet_medication_order enable row level security;
drop policy if exists "Veterinary staff access medication orders" on public.vet_medication_order;
create policy "Veterinary staff access medication orders" on public.vet_medication_order for all to authenticated
using (public.can_access_business_module(business_id) and public.has_module_entitlement(business_id,'veterinary'))
with check (public.can_access_business_module(business_id) and public.has_module_entitlement(business_id,'veterinary'));

create or replace function public.validate_vet_medication_order()
returns trigger language plpgsql set search_path=public as $$
declare encounter_business uuid; encounter_pet bigint;
begin
  if new.is_controlled then raise exception 'Controlled substances are not supported in this workflow.'; end if;
  if new.encounter_id is not null then
    select business_id,pet_id into encounter_business,encounter_pet from public.vet_encounter where id=new.encounter_id;
    if encounter_business is null then raise exception 'Linked encounter was not found.'; end if;
    if new.business_id is distinct from encounter_business or new.pet_id is distinct from encounter_pet then
      raise exception 'Medication order must belong to the same business and patient as its encounter.';
    end if;
  end if;
  if tg_op='UPDATE' and old.status in ('completed','discontinued') then raise exception 'Completed or discontinued medication history cannot be edited.'; end if;
  new.updated_at=now();
  return new;
end;
$$;

drop trigger if exists validate_vet_medication_order on public.vet_medication_order;
create trigger validate_vet_medication_order before insert or update on public.vet_medication_order
for each row execute function public.validate_vet_medication_order();

drop trigger if exists audit_vet_medication_order on public.vet_medication_order;
create trigger audit_vet_medication_order after insert or update or delete on public.vet_medication_order
for each row execute function public.audit_vet_record_change();
