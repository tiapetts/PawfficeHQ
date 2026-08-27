create or replace function public.update_client_household(
  p_business_id uuid,
  p_client_id bigint,
  p_client jsonb,
  p_pets jsonb default '[]'::jsonb
)
returns table(client_id bigint, pet_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_pet_id bigint;
  pet jsonb;
  created_pet_count integer := 0;
begin
  if not public.user_belongs_to_business(p_business_id) and not public.is_platform_admin() then
    raise exception 'Not authorized to update clients for this business.';
  end if;
  if not public.has_subscription_access(p_business_id) then
    raise exception 'An active subscription or access grant is required.';
  end if;
  if nullif(btrim(p_client->>'FirstName'), '') is null or nullif(btrim(p_client->>'LastName'), '') is null then
    raise exception 'Client first and last name are required.';
  end if;
  if jsonb_typeof(coalesce(p_pets, '[]'::jsonb)) <> 'array' then
    raise exception 'Pets must be supplied as a list.';
  end if;

  update public."CLIENT"
  set "FirstName" = btrim(p_client->>'FirstName'),
      "LastName" = btrim(p_client->>'LastName'),
      "PhoneNumber" = nullif(btrim(p_client->>'PhoneNumber'), ''),
      "EmailAddress" = nullif(btrim(p_client->>'EmailAddress'), ''),
      "StreetAddress" = nullif(btrim(p_client->>'StreetAddress'), ''),
      "AptNumber" = nullif(btrim(p_client->>'AptNumber'), ''),
      "ClientCity" = nullif(btrim(p_client->>'ClientCity'), ''),
      "ClientState" = nullif(upper(btrim(p_client->>'ClientState')), ''),
      "ClientZip" = nullif(btrim(p_client->>'ClientZip'), ''),
      booking_deposit_required = coalesce((p_client->>'booking_deposit_required')::boolean, false),
      booking_deposit_type = coalesce(nullif(p_client->>'booking_deposit_type', ''), 'fixed'),
      booking_deposit_value = coalesce(nullif(p_client->>'booking_deposit_value', '')::numeric, 0),
      booking_deposit_reason = nullif(btrim(p_client->>'booking_deposit_reason'), '')
  where id = p_client_id and business_id = p_business_id;

  if not found then raise exception 'Client not found for this business.'; end if;

  for pet in select value from jsonb_array_elements(coalesce(p_pets, '[]'::jsonb)) loop
    if nullif(btrim(pet->>'PetName'), '') is null or nullif(btrim(pet->>'species'), '') is null then
      raise exception 'Each pet needs a name and species.';
    end if;
    insert into public."PET" (business_id, "PetName", species, "PetBreed", "PetDOB", "PetWeight")
    values (p_business_id, btrim(pet->>'PetName'), btrim(pet->>'species'), nullif(btrim(pet->>'PetBreed'), ''), nullif(pet->>'PetDOB', '')::date, nullif(pet->>'PetWeight', '')::numeric)
    returning id into new_pet_id;
    insert into public.client_pet (client_id, pet_id, relationship, is_primary)
    values (p_client_id, new_pet_id, 'Owner', true);
    created_pet_count := created_pet_count + 1;
  end loop;

  return query select p_client_id, created_pet_count;
end;
$$;

revoke all on function public.update_client_household(uuid, bigint, jsonb, jsonb) from public;
grant execute on function public.update_client_household(uuid, bigint, jsonb, jsonb) to authenticated;
