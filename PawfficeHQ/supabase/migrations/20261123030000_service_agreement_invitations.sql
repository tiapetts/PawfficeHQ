-- Server-only, one-time signing invitation issuance. The bearer token is stored only as SHA-256.
create or replace function public.create_agreement_invitation(
 p_business_id uuid, p_client_id bigint, p_template_id uuid, p_token_hash text
) returns uuid language plpgsql security invoker set search_path = '' as $body$
declare v_version uuid; v_request uuid;
begin
 if p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid token hash'; end if;
 select active_version_id into v_version from public.service_agreement_template
 where id=p_template_id and business_id=p_business_id;
 if v_version is null then raise exception 'No published agreement'; end if;
 if not exists(select 1 from public."CLIENT" where id=p_client_id and business_id=p_business_id) then
 raise exception 'Client not found'; end if;
 insert into public.service_agreement_request(business_id,client_id,template_id,version_id,status,token_hash,expires_at,sent_at)
 values(p_business_id,p_client_id,p_template_id,v_version,'sent',p_token_hash,now()+interval '7 days',now())
 returning id into v_request;
 return v_request;
end;
$body$;
revoke all on function public.create_agreement_invitation(uuid,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.create_agreement_invitation(uuid,bigint,uuid,text) to service_role;
