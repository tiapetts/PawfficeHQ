create or replace function public.grant_complimentary_access(
  p_business_id uuid,
  p_plan text,
  p_expires_at timestamptz,
  p_reason text,
  p_modules text[] default array[]::text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invalid_module text;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can grant complimentary access.';
  end if;
  if p_plan not in ('basic', 'pro') then
    raise exception 'Complimentary plan must be Basic or Pro.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Enter a reason for complimentary access.';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'The complimentary expiration must be in the future.';
  end if;
  select module_key into invalid_module
  from unnest(coalesce(p_modules, array[]::text[])) module_key
  where module_key not in ('pet_sitting', 'boarding_daycare', 'veterinary')
  limit 1;
  if invalid_module is not null then
    raise exception 'Unknown complimentary module: %', invalid_module;
  end if;

  insert into public.business_subscription (
    business_id, plan, status, access_override_plan,
    access_override_expires_at, access_override_reason,
    access_override_granted_by, access_override_granted_at, updated_at
  ) values (
    p_business_id, p_plan, 'trialing', p_plan,
    p_expires_at, trim(p_reason), auth.uid(), now(), now()
  )
  on conflict (business_id) do update set
    access_override_plan = excluded.access_override_plan,
    access_override_expires_at = excluded.access_override_expires_at,
    access_override_reason = excluded.access_override_reason,
    access_override_granted_by = excluded.access_override_granted_by,
    access_override_granted_at = excluded.access_override_granted_at,
    updated_at = excluded.updated_at;

  delete from public.complimentary_module_access where business_id = p_business_id;
  insert into public.complimentary_module_access (business_id, module_key, expires_at, granted_by)
  select p_business_id, module_key, p_expires_at, auth.uid()
  from unnest(coalesce(p_modules, array[]::text[])) module_key
  on conflict (business_id, module_key) do update set
    expires_at = excluded.expires_at,
    granted_by = excluded.granted_by,
    granted_at = now();
end;
$$;

create or replace function public.revoke_complimentary_access(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can revoke complimentary access.';
  end if;
  update public.business_subscription set
    access_override_plan = null,
    access_override_expires_at = null,
    access_override_reason = null,
    access_override_granted_by = null,
    access_override_granted_at = null,
    updated_at = now()
  where business_id = p_business_id;
  delete from public.complimentary_module_access where business_id = p_business_id;
end;
$$;

revoke all on function public.grant_complimentary_access(uuid,text,timestamptz,text,text[]) from public;
revoke all on function public.revoke_complimentary_access(uuid) from public;
grant execute on function public.grant_complimentary_access(uuid,text,timestamptz,text,text[]) to authenticated;
grant execute on function public.revoke_complimentary_access(uuid) to authenticated;
