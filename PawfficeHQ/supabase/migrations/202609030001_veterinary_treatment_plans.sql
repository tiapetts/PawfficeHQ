-- Veterinary estimates and client-approved treatment plans.

create table if not exists public.vet_treatment_plan (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business(id) on delete cascade,
  pet_id bigint not null references public."PET"(id) on delete cascade,
  client_id bigint not null references public."CLIENT"(id) on delete restrict,
  encounter_id uuid not null references public.vet_encounter(id) on delete cascade,
  invoice_id uuid references public.invoice(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft','presented','partially_approved','approved','declined','invoiced')),
  notes text,
  expires_on date,
  presented_at timestamptz,
  decided_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (encounter_id)
);

create table if not exists public.vet_treatment_plan_item (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.vet_treatment_plan(id) on delete cascade,
  category text not null default 'procedure'
    check (category in ('service','diagnostic','procedure','medication','hospitalization','other')),
  description text not null,
  quantity numeric not null default 1 check (quantity > 0),
  unit_price numeric not null default 0 check (unit_price >= 0),
  decision text not null default 'pending'
    check (decision in ('pending','accepted','declined')),
  decision_note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vet_treatment_plan_patient_idx
  on public.vet_treatment_plan (business_id, pet_id, created_at desc);
create index if not exists vet_treatment_plan_item_plan_idx
  on public.vet_treatment_plan_item (plan_id, sort_order, created_at);

alter table public.vet_treatment_plan enable row level security;
alter table public.vet_treatment_plan_item enable row level security;

drop policy if exists "Veterinary staff access treatment plans" on public.vet_treatment_plan;
create policy "Veterinary staff access treatment plans" on public.vet_treatment_plan
for all to authenticated
using (public.can_access_business_module(business_id) and public.has_module_entitlement(business_id, 'veterinary'))
with check (public.can_access_business_module(business_id) and public.has_module_entitlement(business_id, 'veterinary'));

drop policy if exists "Veterinary staff access treatment plan items" on public.vet_treatment_plan_item;
create policy "Veterinary staff access treatment plan items" on public.vet_treatment_plan_item
for all to authenticated
using (exists (
  select 1 from public.vet_treatment_plan plan
  where plan.id = plan_id
    and public.can_access_business_module(plan.business_id)
    and public.has_module_entitlement(plan.business_id, 'veterinary')
))
with check (exists (
  select 1 from public.vet_treatment_plan plan
  where plan.id = plan_id
    and public.can_access_business_module(plan.business_id)
    and public.has_module_entitlement(plan.business_id, 'veterinary')
));

create or replace function public.validate_vet_treatment_plan()
returns trigger language plpgsql set search_path = public as $$
declare encounter_business uuid; encounter_pet bigint;
begin
  select business_id,pet_id into encounter_business,encounter_pet from public.vet_encounter where id=new.encounter_id;
  if encounter_business is null then raise exception 'Linked veterinary encounter was not found.'; end if;
  if new.business_id is distinct from encounter_business or new.pet_id is distinct from encounter_pet then
    raise exception 'Treatment plan must belong to the same business and patient as its encounter.';
  end if;
  if not exists(select 1 from public.client_pet where client_id=new.client_id and pet_id=new.pet_id) then
    raise exception 'Treatment plan client must be linked to this patient.';
  end if;
  new.updated_at := now();
  return new;
end; $$;

create or replace function public.protect_invoiced_vet_treatment_plan_item()
returns trigger language plpgsql set search_path = public as $$
declare linked_plan uuid; linked_status text;
begin
  linked_plan := case when tg_op='DELETE' then old.plan_id else new.plan_id end;
  if tg_op='UPDATE' and old.plan_id is distinct from new.plan_id then raise exception 'Treatment-plan items cannot be moved to another plan.'; end if;
  select status into linked_status from public.vet_treatment_plan where id=linked_plan;
  if linked_status='invoiced' then raise exception 'An invoiced treatment plan is locked.'; end if;
  if linked_status is null then raise exception 'Treatment plan not found.'; end if;
  if tg_op<>'DELETE' then new.updated_at := now(); end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;

drop trigger if exists validate_vet_treatment_plan on public.vet_treatment_plan;
create trigger validate_vet_treatment_plan before insert or update on public.vet_treatment_plan
for each row execute function public.validate_vet_treatment_plan();

drop trigger if exists protect_invoiced_vet_treatment_plan_item on public.vet_treatment_plan_item;
create trigger protect_invoiced_vet_treatment_plan_item before insert or update or delete on public.vet_treatment_plan_item
for each row execute function public.protect_invoiced_vet_treatment_plan_item();

create or replace function public.refresh_vet_treatment_plan_status(p_plan_id uuid)
returns public.vet_treatment_plan
language plpgsql security definer set search_path = public as $$
declare plan_row public.vet_treatment_plan; accepted_count integer; declined_count integer; pending_count integer; next_status text;
begin
  select * into plan_row from public.vet_treatment_plan where id=p_plan_id for update;
  if plan_row.id is null then raise exception 'Treatment plan not found.'; end if;
  if not public.can_access_business_module(plan_row.business_id) or not public.has_module_entitlement(plan_row.business_id,'veterinary') then raise exception 'Not authorized.'; end if;
  if plan_row.status='invoiced' then return plan_row; end if;
  select count(*) filter(where decision='accepted'),count(*) filter(where decision='declined'),count(*) filter(where decision='pending')
  into accepted_count,declined_count,pending_count from public.vet_treatment_plan_item where plan_id=p_plan_id;
  next_status := case
    when pending_count>0 then case when plan_row.presented_at is null then 'draft' else 'presented' end
    when accepted_count>0 and declined_count>0 then 'partially_approved'
    when accepted_count>0 then 'approved'
    when declined_count>0 then 'declined'
    else 'draft'
  end;
  update public.vet_treatment_plan set status=next_status,decided_at=case when pending_count=0 and accepted_count+declined_count>0 then now() else null end,updated_at=now() where id=p_plan_id returning * into plan_row;
  return plan_row;
end; $$;

create or replace function public.invoice_vet_treatment_plan(p_plan_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare plan_row public.vet_treatment_plan; invoice_items jsonb; new_invoice_id uuid;
begin
  select * into plan_row from public.vet_treatment_plan where id=p_plan_id for update;
  if plan_row.id is null then raise exception 'Treatment plan not found.'; end if;
  if not public.can_access_business_module(plan_row.business_id) or not public.has_module_entitlement(plan_row.business_id,'veterinary') then raise exception 'Not authorized.'; end if;
  if plan_row.invoice_id is not null then return plan_row.invoice_id; end if;
  select jsonb_agg(jsonb_build_object('description',description,'quantity',quantity,'unit_price',unit_price) order by sort_order,created_at)
  into invoice_items from public.vet_treatment_plan_item where plan_id=p_plan_id and decision='accepted';
  if invoice_items is null then raise exception 'Accept at least one treatment-plan item before creating an invoice.'; end if;
  new_invoice_id := public.create_standalone_invoice(plan_row.business_id,plan_row.client_id,plan_row.pet_id,null,null,null,invoice_items,0,0,'Veterinary treatment plan '||plan_row.id,true);
  update public.vet_treatment_plan set invoice_id=new_invoice_id,status='invoiced',decided_at=coalesce(decided_at,now()),updated_at=now() where id=p_plan_id;
  return new_invoice_id;
end; $$;

revoke all on function public.refresh_vet_treatment_plan_status(uuid) from public;
revoke all on function public.invoice_vet_treatment_plan(uuid) from public;
grant execute on function public.refresh_vet_treatment_plan_status(uuid) to authenticated;
grant execute on function public.invoice_vet_treatment_plan(uuid) to authenticated;
