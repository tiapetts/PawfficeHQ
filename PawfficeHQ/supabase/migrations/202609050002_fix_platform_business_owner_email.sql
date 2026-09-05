-- Repair get_platform_businesses after the owner email migration referenced
-- a business.owner_id column that does not exist in the production schema.
-- The business owner is represented by the STAFF row whose role is owner.

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
    owner_account.email,
    (select count(*) from public."STAFF" staff where staff.business_id = b.id),
    (select count(*) from public."CLIENT" client where client.business_id = b.id),
    (select count(*) from public."PET" pet where pet.business_id = b.id),
    (select count(*) from public.appointment appointment where appointment.business_id = b.id),
    (select max(appointment.start_at) from public.appointment appointment where appointment.business_id = b.id)
  from public.business b
  left join lateral (
    select coalesce(auth_user.email::text, staff.email::text) as email
    from public."STAFF" staff
    left join auth.users auth_user
      on auth_user.id = staff.auth_user_id
    where staff.business_id = b.id
    order by
      (staff.role = 'owner') desc,
      (staff.auth_user_id is not null) desc,
      staff.created_at asc
    limit 1
  ) owner_account on true
  order by b.business_name;
end;
$$;

revoke all on function public.get_platform_businesses() from public;
grant execute on function public.get_platform_businesses() to authenticated;
