-- Correct a medical record filed under the wrong patient without erasing history.

alter table public.vet_encounter
  add column if not exists entered_in_error_reason text,
  add column if not exists entered_in_error_at timestamptz,
  add column if not exists entered_in_error_by uuid,
  add column if not exists corrected_encounter_id uuid references public.vet_encounter(id) on delete set null;

alter table public.vet_encounter drop constraint if exists vet_encounter_status_check;
alter table public.vet_encounter add constraint vet_encounter_status_check
  check (status in ('draft','finalized','amended','entered_in_error'));

create or replace function public.protect_vet_encounter_child_record()
returns trigger language plpgsql set search_path = public as $$
declare linked_encounter uuid; linked_status text; linked_business uuid; linked_pet bigint;
begin
  if current_setting('pawffice.vet_privileged_update', true) = 'on' then
    if tg_op <> 'DELETE' and tg_table_name = 'vet_treatment' then new.updated_at := now(); end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and old.encounter_id is not null and old.encounter_id is distinct from new.encounter_id then
    raise exception 'An encounter-linked clinical record cannot be moved or unlinked.';
  end if;
  linked_encounter := case when tg_op = 'DELETE' then old.encounter_id when tg_op = 'UPDATE' then coalesce(old.encounter_id,new.encounter_id) else new.encounter_id end;
  if linked_encounter is null then return case when tg_op = 'DELETE' then old else new end; end if;
  select status,business_id,pet_id into linked_status,linked_business,linked_pet from public.vet_encounter where id=linked_encounter;
  if linked_status is null then raise exception 'Linked veterinary encounter was not found.'; end if;
  if linked_status is distinct from 'draft' then raise exception 'Treatments and administered vaccines are locked when the encounter is finalized.'; end if;
  if tg_op <> 'DELETE' and (new.business_id is distinct from linked_business or new.pet_id is distinct from linked_pet) then
    raise exception 'Clinical record must belong to the same business and patient as its encounter.';
  end if;
  if tg_op <> 'DELETE' and tg_table_name = 'vet_treatment' then new.updated_at := now(); end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.correct_vet_encounter_patient(p_encounter_id uuid, p_correct_pet_id bigint, p_reason text)
returns public.vet_encounter
language plpgsql security definer set search_path = public as $$
declare original public.vet_encounter; corrected public.vet_encounter;
begin
  select * into original from public.vet_encounter where id=p_encounter_id for update;
  if original.id is null then raise exception 'Encounter not found.'; end if;
  if not public.can_access_business_module(original.business_id) or not public.has_module_entitlement(original.business_id,'veterinary') then raise exception 'Not authorized.'; end if;
  if original.status not in ('finalized','amended') then raise exception 'Only a finalized record can use the patient-correction workflow.'; end if;
  if original.pet_id=p_correct_pet_id then raise exception 'Choose a different patient.'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'A correction reason is required.'; end if;
  if not exists(select 1 from public."PET" where id=p_correct_pet_id and business_id=original.business_id and archived_at is null) then raise exception 'Correct patient was not found in this business.'; end if;

  insert into public.vet_encounter (
    business_id,pet_id,appointment_id,attending_staff_id,visit_type,chief_complaint,status,
    subjective,objective,assessment,plan,client_instructions,weight_kg,temperature_f,pulse_bpm,
    respiration_bpm,body_condition_score,pain_score,diagnoses,follow_up_on,created_by
  ) values (
    original.business_id,p_correct_pet_id,null,original.attending_staff_id,original.visit_type,original.chief_complaint,'draft',
    original.subjective,original.objective,original.assessment,original.plan,original.client_instructions,original.weight_kg,
    original.temperature_f,original.pulse_bpm,original.respiration_bpm,original.body_condition_score,original.pain_score,
    original.diagnoses,original.follow_up_on,auth.uid()
  ) returning * into corrected;

  perform set_config('pawffice.vet_privileged_update','on',true);
  update public.vet_treatment set pet_id=p_correct_pet_id,encounter_id=corrected.id,updated_at=now() where encounter_id=original.id;
  update public.pet_vaccination set pet_id=p_correct_pet_id,encounter_id=corrected.id,updated_at=now() where encounter_id=original.id;
  update public.vet_encounter set status='entered_in_error',entered_in_error_reason=btrim(p_reason),entered_in_error_at=now(),entered_in_error_by=auth.uid(),corrected_encounter_id=corrected.id,updated_at=now() where id=original.id;
  return corrected;
end;
$$;

revoke all on function public.correct_vet_encounter_patient(uuid,bigint,text) from public;
grant execute on function public.correct_vet_encounter_patient(uuid,bigint,text) to authenticated;
