-- Atomic publication after a private PDF has been uploaded by the trusted Edge Function.
create or replace function public.publish_service_agreement(
 p_business_id uuid, p_title text, p_path text, p_sha256 text,
 p_template_id uuid default null, p_requires_renewal boolean default true
) returns uuid language plpgsql security invoker set search_path = '' as $body$
declare v_template uuid; v_version uuid; v_number integer;
begin
 if length(trim(p_title)) not between 1 and 160 or p_path not like p_business_id::text || '/%' or p_sha256 !~ '^[a-f0-9]{64}$' then
  raise exception 'Invalid agreement metadata';
 end if;
 if p_template_id is null then
  insert into public.service_agreement_template(business_id,title) values(p_business_id,trim(p_title)) returning id into v_template;
 else
  select id into v_template from public.service_agreement_template where id=p_template_id and business_id=p_business_id for update;
  if v_template is null then raise exception 'Agreement template not found'; end if;
 end if;
 select coalesce(max(version_number),0)+1 into v_number from public.service_agreement_version where template_id=v_template;
 insert into public.service_agreement_version(template_id,business_id,version_number,storage_path,file_sha256,requires_renewal)
 values(v_template,p_business_id,v_number,p_path,p_sha256,p_requires_renewal) returning id into v_version;
 update public.service_agreement_template set active_version_id=v_version where id=v_template;
 return v_version;
end;
$body$;
revoke all on function public.publish_service_agreement(uuid,text,text,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.publish_service_agreement(uuid,text,text,text,uuid,boolean) to service_role;
