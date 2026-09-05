-- Show each business owner's sign-in email in the platform admin customer list.
-- The RPC remains restricted to platform administrators so login emails are not
-- exposed to tenant staff or anonymous users.

drop function if exists public.get_platform_businesses();

create function public.get_platform_businesses()
returns table (
  business_id uuid,
  business_name text,
  owner_email text,
  staff_count bigint,
  client_count bigint,
  pet_count bigint,
  appointment_count bigint,
  last_appointment_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin access required';
  end if;

  return query
  select
    b.id,
    b.business_name,
    coalesce(owner_user.email::text, owner_staff.email::text),
    count(distinct staff.id),
    count(distinct client.id),
    count(distinct pet.id),
    count(distinct appointment.id),
    max(appointment.start_at)
  from public.business b
  left join auth.users owner_user
    on owner_user.id = b.owner_id
  left join public."STAFF" owner_staff
    on owner_staff.business_id = b.id
   and owner_staff.auth_user_id = b.owner_id
  left join public."STAFF" staff
    on staff.business_id = b.id
  left join public."CLIENT" client
    on client.business_id = b.id
  left join public."PET" pet
    on pet.business_id = b.id
  left join public.appointment appointment
    on appointment.business_id = b.id
  group by b.id, b.business_name, owner_user.email, owner_staff.email
  order by b.business_name;
end;
$$;

revoke all on function public.get_platform_businesses() from public;
grant execute on function public.get_platform_businesses() to authenticated;
