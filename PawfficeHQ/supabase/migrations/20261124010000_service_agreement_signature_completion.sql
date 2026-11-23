-- Signing must be single-use, bound to an unexpired invitation and immutable PDF version.
create or replace function public.complete_service_agreement_signature(
 p_token_hash text,p_signer_name text,p_document_path text,p_document_sha256 text,p_consent_text text,p_audit jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $body$
declare v_request public.service_agreement_request%rowtype; v_id uuid;
begin
 select * into v_request from public.service_agreement_request
 where token_hash=p_token_hash for update;
 if not found or v_request.status not in ('sent','viewed') or v_request.expires_at<=now() then
  raise exception 'Invalid, expired or already used invitation';
 end if;
 if length(trim(p_signer_name))<2 or length(trim(p_signer_name))>160
 or p_document_path not like v_request.business_id::text || '/signed/%'
 or p_document_sha256 !~ '^[a-f0-9]{64}$' or length(p_consent_text)<20 then
  raise exception 'Invalid signature record';
 end if;
 insert into public.service_agreement_signature(request_id,business_id,client_id,signer_name,signed_document_path,signed_document_sha256,consent_text,audit_json)
 values(v_request.id,v_request.business_id,v_request.client_id,trim(p_signer_name),p_document_path,p_document_sha256,p_consent_text,p_audit)
 returning id into v_id;
 update public.service_agreement_request set status='signed',signed_at=now(),token_hash=null where id=v_request.id;
 return v_id;
end;
$body$;
revoke all on function public.complete_service_agreement_signature(text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.complete_service_agreement_signature(text,text,text,text,text,jsonb) to service_role;
