-- Veterinary clinical foundation: patient profiles, alerts, problems,
-- SOAP encounters, immutable finalization, amendments, and audit history.

create table if not exists public.vet_patient_profile (
  pet_id bigint primary key references public."PET"(id) on delete cascade,
  business_id uuid not null references public.business(id) on delete cascade,
  sex text check (sex in ('female','male','unknown')),
  reproductive_status text check (reproductive_status in ('intact','spayed','neutered','unknown')),
  color_markings text,
  microchip_number text,
  deceased_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vet_medical_alert (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business(id) on delete cascade,
  pet_id bigint not null references public."PET"(id) on delete cascade,
  alert_type text not null check (alert_type in ('allergy','medication','handling','medical','other')),
  description text not null,
  severity text not null default 'important' check (severity in ('information','important','critical')),
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.vet_problem (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business(id) on delete cascade,
  pet_id bigint not null references public."PET"(id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active','monitoring','resolved')),
  onset_on date,
  resolved_on date,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vet_encounter (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business(id) on delete cascade,
  pet_id bigint not null references public."PET"(id) on delete cascade,
  appointment_id uuid references public.appointment(id) on delete set null,
  attending_staff_id uuid references public."STAFF"(id) on delete set null,
  visit_type text not null default 'wellness',
  chief_complaint text,
  status text not null default 'draft' check (status in ('draft','finalized','amended')),
  subjective text,
  objective text,
  assessment text,
  plan text,
  client_instructions text,
  weight_kg numeric(7,2) check (weight_kg is null or weight_kg > 0),
  temperature_f numeric(5,2) check (temperature_f is null or temperature_f between 80 and 115),
  pulse_bpm integer check (pulse_bpm is null or pulse_bpm between 0 and 400),
  respiration_bpm integer check (respiration_bpm is null or respiration_bpm between 0 and 300),
  body_condition_score numeric(3,1) check (body_condition_score is null or body_condition_score between 1 and 9),
  pain_score integer check (pain_score is null or pain_score between 0 and 10),
  diagnoses text[] not null default '{}',
  follow_up_on date,
  created_by uuid not null default auth.uid(),
  finalized_by uuid,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vet_encounter_amendment (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business(id) on delete cascade,
  encounter_id uuid not null references public.vet_encounter(id) on delete cascade,
  amendment_text text not null,
  reason text not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.vet_record_audit (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.business(id) on delete cascade,
  record_type text not null,
  record_id uuid not null,
  action text not null,
  actor_id uuid,
  changed_at timestamptz not null default now(),
  snapshot jsonb not null default '{}'::jsonb
);

create index if not exists vet_patient_profile_business_idx on public.vet_patient_profile (business_id);
create index if not exists vet_alert_pet_idx on public.vet_medical_alert (business_id, pet_id, is_active);
create index if not exists vet_problem_pet_idx on public.vet_problem (business_id, pet_id, status);
create index if not exists vet_encounter_pet_idx on public.vet_encounter (business_id, pet_id, created_at desc);
create index if not exists vet_encounter_appointment_idx on public.vet_encounter (appointment_id) where appointment_id is not null;
create index if not exists vet_amendment_encounter_idx on public.vet_encounter_amendment (encounter_id, created_at);
create index if not exists vet_audit_record_idx on public.vet_record_audit (record_type, record_id, changed_at);

alter table public.vet_patient_profile enable row level security;
alter table public.vet_medical_alert enable row level security;
alter table public.vet_problem enable row level security;
alter table public.vet_encounter enable row level security;
alter table public.vet_encounter_amendment enable row level security;
alter table public.vet_record_audit enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array['vet_patient_profile','vet_medical_alert','vet_problem','vet_encounter','vet_encounter_amendment']
  loop
    execute format('drop policy if exists "Veterinary staff access %1$s" on public.%1$I', table_name);
    execute format(
      'create policy "Veterinary staff access %1$s" on public.%1$I for all to authenticated
       using (public.can_access_business_module(business_id) and public.has_module_entitlement(business_id, ''veterinary''))
       with check (public.can_access_business_module(business_id) and public.has_module_entitlement(business_id, ''veterinary''))',
      table_name
    );
  end loop;
end $$;

drop policy if exists "Veterinary staff read audit" on public.vet_record_audit;
create policy "Veterinary staff read audit" on public.vet_record_audit
for select to authenticated
using (
  public.can_access_business_module(business_id)
  and public.has_module_entitlement(business_id, 'veterinary')
);

create or replace function public.protect_finalized_vet_encounter()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_setting('pawffice.vet_privileged_update', true) = 'on' then
    new.updated_at := now();
    return new;
  end if;
  if old.status in ('finalized','amended') then
    raise exception 'Finalized medical records cannot be edited. Add an amendment instead.';
  end if;
  if new.status <> 'draft' then
    raise exception 'Use the finalization workflow to finalize a medical record.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_finalized_vet_encounter on public.vet_encounter;
create trigger protect_finalized_vet_encounter
before update on public.vet_encounter
for each row execute function public.protect_finalized_vet_encounter();

create or replace function public.audit_vet_record_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare row_value jsonb; row_id uuid; row_business uuid;
begin
  row_value := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  row_id := (row_value->>'id')::uuid;
  row_business := (row_value->>'business_id')::uuid;
  insert into public.vet_record_audit (business_id, record_type, record_id, action, actor_id, snapshot)
  values (row_business, tg_table_name, row_id, lower(tg_op), auth.uid(), row_value);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists audit_vet_encounter on public.vet_encounter;
create trigger audit_vet_encounter after insert or update or delete on public.vet_encounter
for each row execute function public.audit_vet_record_change();
drop trigger if exists audit_vet_amendment on public.vet_encounter_amendment;
create trigger audit_vet_amendment after insert on public.vet_encounter_amendment
for each row execute function public.audit_vet_record_change();

create or replace function public.finalize_vet_encounter(p_encounter_id uuid)
returns public.vet_encounter
language plpgsql security definer set search_path = public as $$
declare row_data public.vet_encounter; staff_id uuid;
begin
  select * into row_data from public.vet_encounter where id = p_encounter_id for update;
  if row_data.id is null then raise exception 'Encounter not found.'; end if;
  if not public.can_access_business_module(row_data.business_id) or not public.has_module_entitlement(row_data.business_id, 'veterinary') then raise exception 'Not authorized.'; end if;
  if row_data.status <> 'draft' then raise exception 'Only draft encounters can be finalized.'; end if;
  if nullif(btrim(row_data.assessment), '') is null or nullif(btrim(row_data.plan), '') is null then raise exception 'Assessment and plan are required before finalization.'; end if;
  select id into staff_id from public."STAFF" where business_id = row_data.business_id and auth_user_id = auth.uid() and is_active = true limit 1;
  perform set_config('pawffice.vet_privileged_update','on',true);
  update public.vet_encounter set status='finalized', finalized_by=auth.uid(), finalized_at=now(), attending_staff_id=coalesce(attending_staff_id,staff_id), updated_at=now()
  where id=p_encounter_id returning * into row_data;
  return row_data;
end;
$$;

create or replace function public.add_vet_encounter_amendment(p_encounter_id uuid, p_reason text, p_text text)
returns public.vet_encounter_amendment
language plpgsql security definer set search_path = public as $$
declare encounter_row public.vet_encounter; amendment_row public.vet_encounter_amendment;
begin
  select * into encounter_row from public.vet_encounter where id=p_encounter_id for update;
  if encounter_row.id is null then raise exception 'Encounter not found.'; end if;
  if not public.can_access_business_module(encounter_row.business_id) or not public.has_module_entitlement(encounter_row.business_id,'veterinary') then raise exception 'Not authorized.'; end if;
  if encounter_row.status not in ('finalized','amended') then raise exception 'Finalize the encounter before adding an amendment.'; end if;
  if nullif(btrim(p_reason),'') is null or nullif(btrim(p_text),'') is null then raise exception 'Amendment reason and text are required.'; end if;
  insert into public.vet_encounter_amendment (business_id,encounter_id,reason,amendment_text)
  values (encounter_row.business_id,p_encounter_id,btrim(p_reason),btrim(p_text)) returning * into amendment_row;
  perform set_config('pawffice.vet_privileged_update','on',true);
  update public.vet_encounter set status='amended',updated_at=now() where id=p_encounter_id;
  return amendment_row;
end;
$$;

revoke all on function public.finalize_vet_encounter(uuid) from public;
revoke all on function public.add_vet_encounter_amendment(uuid,text,text) from public;
grant execute on function public.finalize_vet_encounter(uuid) to authenticated;
grant execute on function public.add_vet_encounter_amendment(uuid,text,text) to authenticated;
