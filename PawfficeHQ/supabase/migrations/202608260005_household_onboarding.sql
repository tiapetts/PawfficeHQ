create or replace function public.create_client_household(p_business_id uuid, p_client jsonb, p_pets jsonb default '[]'::jsonb)
returns table(client_id bigint, pet_count integer)
language plpgsql security definer set search_path = public as $$
declare
  new_client_id bigint;
  new_pet_id bigint;
  pet jsonb;
  created_pet_count integer := 0;
begin
  if not public.user_belongs_to_business(p_business_id) and not public.is_platform_admin() then raise exception 'Not authorized to add clients to this business.'; end if;
  if not public.has_subscription_access(p_business_id) then raise exception 'An active subscription or access grant is required.'; end if;
  if nullif(btrim(p_client->>'FirstName'), '') is null or nullif(btrim(p_client->>'LastName'), '') is null then raise exception 'Client first and last name are required.'; end if;
  if jsonb_typeof(coalesce(p_pets, '[]'::jsonb)) <> 'array' then raise exception 'Pets must be supplied as a list.'; end if;

  insert into public."CLIENT" (business_id, "FirstName", "LastName", "PhoneNumber", "EmailAddress", "StreetAddress", "AptNumber", "ClientCity", "ClientState", "ClientZip", booking_deposit_required, booking_deposit_type, booking_deposit_value, booking_deposit_reason)
  values (p_business_id, btrim(p_client->>'FirstName'), btrim(p_client->>'LastName'), nullif(btrim(p_client->>'PhoneNumber'), ''), nullif(btrim(p_client->>'EmailAddress'), ''), nullif(btrim(p_client->>'StreetAddress'), ''), nullif(btrim(p_client->>'AptNumber'), ''), nullif(btrim(p_client->>'ClientCity'), ''), nullif(upper(btrim(p_client->>'ClientState')), ''), nullif(btrim(p_client->>'ClientZip'), ''), coalesce((p_client->>'booking_deposit_required')::boolean, false), coalesce(nullif(p_client->>'booking_deposit_type', ''), 'fixed'), coalesce(nullif(p_client->>'booking_deposit_value', '')::numeric, 0), nullif(btrim(p_client->>'booking_deposit_reason'), ''))
  returning id into new_client_id;

  for pet in select value from jsonb_array_elements(coalesce(p_pets, '[]'::jsonb)) loop
    if nullif(btrim(pet->>'PetName'), '') is null or nullif(btrim(pet->>'species'), '') is null then raise exception 'Each pet needs a name and species.'; end if;
    insert into public."PET" (business_id, "PetName", species, "PetBreed", "PetDOB", "PetWeight")
    values (p_business_id, btrim(pet->>'PetName'), btrim(pet->>'species'), nullif(btrim(pet->>'PetBreed'), ''), nullif(pet->>'PetDOB', '')::date, nullif(pet->>'PetWeight', '')::numeric)
    returning id into new_pet_id;
    insert into public.client_pet (client_id, pet_id, relationship, is_primary) values (new_client_id, new_pet_id, 'Owner', true);
    created_pet_count := created_pet_count + 1;
  end loop;

  return query select new_client_id, created_pet_count;
end; $$;

revoke all on function public.create_client_household(uuid, jsonb, jsonb) from public;
grant execute on function public.create_client_household(uuid, jsonb, jsonb) to authenticated;
