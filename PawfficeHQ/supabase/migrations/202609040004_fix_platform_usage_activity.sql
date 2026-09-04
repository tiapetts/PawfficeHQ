create or replace function public.get_platform_usage_activity(p_limit integer default 250)
returns table(
  id bigint,
  business_id uuid,
  business_name text,
  staff_id uuid,
  staff_name text,
  staff_email text,
  event_type text,
  page_key text,
  occurred_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin access required';
  end if;

  return query
  select
    e.id,
    e.business_id,
    b.business_name::text,
    e.staff_id,
    concat_ws(' ', s.first_name, s.last_name)::text,
    s.email::text,
    e.event_type::text,
    e.page_key::text,
    e.occurred_at
  from public.platform_usage_event e
  join public.business b on b.id = e.business_id
  join public."STAFF" s on s.id = e.staff_id
  order by e.occurred_at desc
  limit greatest(1, least(coalesce(p_limit, 250), 1000));
end;
$$;

grant execute on function public.get_platform_usage_activity(integer) to authenticated;
