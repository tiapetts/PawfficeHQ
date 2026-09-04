create table if not exists public.appointment_series (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business(id) on delete cascade,
  client_id bigint not null references public."CLIENT"(id) on delete restrict,
  source_appointment_id uuid references public.appointment(id) on delete set null,
  interval_weeks integer not null check (interval_weeks between 1 and 52),
  occurrence_count integer not null check (occurrence_count between 2 and 52),
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.appointment
  add column if not exists series_id uuid references public.appointment_series(id) on delete set null,
  add column if not exists series_sequence integer,
  add column if not exists rebooked_from_id uuid references public.appointment(id) on delete set null;

create index if not exists appointment_series_business_idx on public.appointment_series(business_id, created_at desc);
create index if not exists appointment_series_appointment_idx on public.appointment(series_id, series_sequence);
create index if not exists appointment_rebooked_from_idx on public.appointment(rebooked_from_id);

alter table public.appointment_series enable row level security;
create policy "Business staff manage appointment series" on public.appointment_series for all to authenticated
  using (public.can_access_business_module(business_id))
  with check (public.can_access_business_module(business_id));

create or replace function public.rebook_appointment(
  p_source_appointment_id uuid,
  p_first_start_at timestamptz,
  p_interval_weeks integer default 6,
  p_occurrence_count integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  source_row public.appointment%rowtype;
  new_series_id uuid;
  new_appointment_id uuid;
  new_start timestamptz;
  new_end timestamptz;
  appointment_duration interval;
  created_ids uuid[] := array[]::uuid[];
  occurrence integer;
begin
  if p_first_start_at <= now() then raise exception 'Choose a future appointment time'; end if;
  if p_interval_weeks not between 1 and 52 then raise exception 'Repeat interval must be between 1 and 52 weeks'; end if;
  if p_occurrence_count not between 1 and 52 then raise exception 'Appointment count must be between 1 and 52'; end if;

  select * into source_row from public.appointment where id = p_source_appointment_id;
  if source_row.id is null then raise exception 'Source appointment not found'; end if;
  if not public.can_access_business_module(source_row.business_id) then raise exception 'Business access required'; end if;
  appointment_duration := source_row.end_at - source_row.start_at;

  if p_occurrence_count > 1 then
    insert into public.appointment_series(business_id,client_id,source_appointment_id,interval_weeks,occurrence_count)
    values(source_row.business_id,source_row.client_id,source_row.id,p_interval_weeks,p_occurrence_count)
    returning id into new_series_id;
  end if;

  for occurrence in 1..p_occurrence_count loop
    new_start := p_first_start_at + make_interval(weeks => (occurrence - 1) * p_interval_weeks);
    new_end := new_start + appointment_duration;

    if exists (
      select 1 from public.appointment existing
      join public.appointment_service existing_staff on existing_staff.appointment_id = existing.id
      where existing.business_id = source_row.business_id
        and existing.status not in ('cancelled','void')
        and existing.start_at < new_end and existing.end_at > new_start
        and existing_staff.staff_id is not null
        and exists (select 1 from public.appointment_service source_staff where source_staff.appointment_id = source_row.id and source_staff.staff_id = existing_staff.staff_id)
    ) then
      raise exception 'A staff member is already booked at %', to_char(new_start, 'Mon DD, YYYY at HH12:MI AM');
    end if;

    insert into public.appointment(business_id,client_id,start_at,end_at,status,client_notes,internal_notes,series_id,series_sequence,rebooked_from_id)
    values(source_row.business_id,source_row.client_id,new_start,new_end,'confirmed',source_row.client_notes,null,new_series_id,case when new_series_id is null then null else occurrence end,source_row.id)
    returning id into new_appointment_id;

    insert into public.appointment_pet(appointment_id,pet_id)
      select new_appointment_id,pet_id from public.appointment_pet where appointment_id=source_row.id;
    insert into public.appointment_service(appointment_id,service_id,staff_id,price_at_booking)
      select new_appointment_id,service_id,staff_id,price_at_booking from public.appointment_service where appointment_id=source_row.id;
    created_ids := array_append(created_ids,new_appointment_id);
  end loop;

  return jsonb_build_object('series_id',new_series_id,'appointment_ids',created_ids,'count',cardinality(created_ids));
end;
$$;

revoke all on function public.rebook_appointment(uuid,timestamptz,integer,integer) from public;
grant execute on function public.rebook_appointment(uuid,timestamptz,integer,integer) to authenticated;

