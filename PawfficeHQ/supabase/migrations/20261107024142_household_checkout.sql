BEGIN;

-- Preserve each appointment while allowing one invoice/payment for a household.
create table public.invoice_appointment (
  invoice_id uuid not null references public.invoice(id) on delete cascade,
  appointment_id uuid not null references public.appointment(id),
  active boolean not null default true,
  primary key (invoice_id, appointment_id)
);
create unique index invoice_appointment_one_active
  on public.invoice_appointment(appointment_id) where active;
create index invoice_appointment_appointment on public.invoice_appointment(appointment_id);
alter table public.invoice_appointment enable row level security;
revoke all on public.invoice_appointment from public, anon, authenticated;
grant select on public.invoice_appointment to authenticated;
grant all on public.invoice_appointment to service_role;
create policy "Read links for visible invoices" on public.invoice_appointment
  for select to authenticated using (exists (
    select 1 from public.invoice i where i.id=invoice_id
  ));

-- Keep voided history, but release the appointment for a replacement invoice.
insert into public.invoice_appointment(invoice_id,appointment_id,active)
select id,appointment_id,status <> 'void' from public.invoice where appointment_id is not null;

create function public.validate_invoice_appointment() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.invoice i join public.appointment a
      on a.business_id=i.business_id and a.client_id=i.client_id
    where i.id=new.invoice_id and a.id=new.appointment_id
      and new.active=(i.status <> 'void')
  ) then raise exception 'Invoice and appointment must belong to the same business and client.'; end if;
  return new;
end;
$$;
create trigger validate_invoice_appointment before insert or update on public.invoice_appointment
for each row execute function public.validate_invoice_appointment();

create function public.sync_invoice_appointments() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' then
    if new.appointment_id is distinct from old.appointment_id
       or new.business_id is distinct from old.business_id
       or new.client_id is distinct from old.client_id then
      if exists(select 1 from public.invoice_appointment where invoice_id=old.id) then
        raise exception 'An appointment invoice cannot be reassigned.';
      end if;
    end if;
  end if;
  if new.appointment_id is not null then
    insert into public.invoice_appointment(invoice_id,appointment_id,active)
    values(new.id,new.appointment_id,new.status <> 'void')
    on conflict (invoice_id,appointment_id) do update set active=excluded.active;
  end if;
  update public.invoice_appointment set active=(new.status <> 'void')
  where invoice_id=new.id and active is distinct from (new.status <> 'void');
  return new;
end;
$$;
create trigger sync_invoice_appointments after insert or update of status,appointment_id,business_id,client_id
on public.invoice for each row execute function public.sync_invoice_appointments();
revoke all on function public.validate_invoice_appointment(),public.sync_invoice_appointments() from public,anon,authenticated;

COMMIT;

create function public.create_invoice_from_appointments(p_appointment_ids uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  ids uuid[]; anchor public.appointment%rowtype; employee uuid; result uuid;
  linked_count integer; invoice_count integer; existing_invoice uuid;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  select array_agg(distinct x order by x) into ids from unnest(p_appointment_ids) x where x is not null;
  if coalesce(cardinality(ids),0) not between 1 and 30 then
    raise exception 'Select between 1 and 30 appointments.';
  end if;
  select * into anchor from public.appointment where id=ids[1];
  if not found then raise exception 'Appointment not found.'; end if;
  select id into employee from public."STAFF" where auth_user_id=auth.uid()
    and business_id=anchor.business_id and is_active=true limit 1;
  if employee is null then raise exception 'You do not have access to these appointments.'; end if;
  if not public.has_subscription_access(anchor.business_id) then
    raise exception 'An active subscription or access grant is required.';
  end if;
  -- Serialize all single/group checkout requests for this owner, then lock appointments.
  perform 1 from public."CLIENT" where id=anchor.client_id and business_id=anchor.business_id for update;
  perform 1 from public.appointment where id=any(ids) order by id for update;
  if (select count(*) from public.appointment where id=any(ids)
      and client_id=anchor.client_id and business_id=anchor.business_id) <> cardinality(ids) then
    raise exception 'Select appointments belonging to one client in the same business.';
  end if;
  select count(*),count(distinct invoice_id),(array_agg(invoice_id))[1]
  into linked_count,invoice_count,existing_invoice
  from public.invoice_appointment where appointment_id=any(ids) and active;
  if linked_count=cardinality(ids) and invoice_count=1 then return existing_invoice; end if;
  if linked_count>0 then raise exception 'An appointment already has an invoice. Open that invoice or select only unbilled appointments.'; end if;
  if exists(select 1 from public.appointment where id=any(ids)
    and status in ('cancelled','canceled','void','no_show','requested')) then
    raise exception 'Cancelled, no-show, or unconfirmed appointments cannot be checked out.';
  end if;
  if exists(select 1 from public.appointment a where a.id=any(ids)
    and not exists(select 1 from public.appointment_service s where s.appointment_id=a.id)) then
    raise exception 'Each selected appointment needs at least one service.';
  end if;
  if exists(select 1 from public.appointment_service aps join public.service s on s.id=aps.service_id
    where aps.appointment_id=any(ids) and (s.business_id is distinct from anchor.business_id
      or coalesce(aps.price_at_booking,s.base_price,0)<0)) then
    raise exception 'Check the selected services and their prices before checkout.';
  end if;
  result := gen_random_uuid();
  insert into public.invoice(id,business_id,appointment_id,client_id,invoice_number,status,created_by)
  values(result,anchor.business_id,ids[1],anchor.client_id,
    'INV-'||upper(left(replace(result::text,'-',''),8)),'draft',employee);
  insert into public.invoice_appointment(invoice_id,appointment_id)
  select result,x from unnest(ids) x on conflict (invoice_id,appointment_id) do nothing;
  insert into public.invoice_item(invoice_id,service_id,description,quantity,unit_price)
  select result,s.service_id,
    coalesce((select string_agg(p."PetName",', ' order by p."PetName")
      from public.appointment_pet ap join public."PET" p on p.id=ap.pet_id
      where ap.appointment_id=s.appointment_id and p.business_id=anchor.business_id),'Pet') ||
      ' — ' || coalesce(svc.name,'Pet-care service'),
    1,coalesce(s.price_at_booking,svc.base_price,0)
  from public.appointment_service s join public.service svc on svc.id=s.service_id
  where s.appointment_id=any(ids) and svc.business_id=anchor.business_id
  order by s.appointment_id,s.id;
  perform public.refresh_invoice_totals(result);
  return result;
end;
$$;
-- Older UI versions must also respect group links and checkout serialization.
create or replace function public.create_invoice_from_appointment(p_appointment_id uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select public.create_invoice_from_appointments(array[p_appointment_id]);
$$;
revoke all on function public.create_invoice_from_appointments(uuid[]),
  public.create_invoice_from_appointment(uuid) from public,anon,authenticated;
grant execute on function public.create_invoice_from_appointments(uuid[]),
  public.create_invoice_from_appointment(uuid) to authenticated;

create function public.get_household_checkout(p_appointment_id uuid,p_day_start timestamptz,p_day_end timestamptz)
returns table(id uuid,start_at timestamptz,status text,client_name text,pet_names text,
  services jsonb,amount numeric,invoice_id uuid,invoice_status text)
language plpgsql security definer set search_path = '' as $$
declare anchor public.appointment%rowtype;
begin
  select * into anchor from public.appointment a where a.id=p_appointment_id;
  if auth.uid() is null or anchor.id is null or not exists(
    select 1 from public."STAFF" s where s.auth_user_id=auth.uid()
      and s.business_id=anchor.business_id and s.is_active=true
  ) then raise exception 'You do not have access to this appointment.'; end if;
  if p_day_start is null or p_day_end is null or p_day_end<=p_day_start
    or p_day_end-p_day_start>interval '26 hours'
    or anchor.start_at<p_day_start or anchor.start_at>=p_day_end then
    raise exception 'Choose the appointment date.';
  end if;
  return query select a.id,a.start_at,a.status::text,
    concat_ws(' ',c."FirstName",c."LastName"),
    coalesce((select string_agg(p."PetName",', ' order by p."PetName")
      from public.appointment_pet ap join public."PET" p on p.id=ap.pet_id
      where ap.appointment_id=a.id and p.business_id=anchor.business_id),'Pet'),
    coalesce((select jsonb_agg(jsonb_build_object('name',s.name,'price',coalesce(aps.price_at_booking,s.base_price,0)) order by aps.id)
      from public.appointment_service aps join public.service s on s.id=aps.service_id
      where aps.appointment_id=a.id and s.business_id=anchor.business_id),'[]'::jsonb),
    coalesce((select sum(coalesce(aps.price_at_booking,s.base_price,0))
      from public.appointment_service aps join public.service s on s.id=aps.service_id
      where aps.appointment_id=a.id and s.business_id=anchor.business_id),0),
    i.id,i.status
  from public.appointment a join public."CLIENT" c on c.id=a.client_id and c.business_id=a.business_id
  left join public.invoice_appointment ia on ia.appointment_id=a.id and ia.active
  left join public.invoice i on i.id=ia.invoice_id
  where a.business_id=anchor.business_id and a.client_id=anchor.client_id
    and a.start_at>=p_day_start and a.start_at<p_day_end
  order by a.start_at,a.id;
end;
$$;
revoke all on function public.get_household_checkout(uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.get_household_checkout(uuid,timestamptz,timestamptz) to authenticated;

COMMIT;

