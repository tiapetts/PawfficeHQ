create or replace function public.start_client_conversation(p_business_id uuid, p_client_id bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare phone text; result uuid;
begin
  if not public.can_use_client_messages(p_business_id) then raise exception 'Not authorized'; end if;
  select public.messaging_phone("PhoneNumber") into phone from public."CLIENT"
  where id = p_client_id and business_id = p_business_id and archived_at is null;
  if phone is null then raise exception 'Client needs a valid mobile number'; end if;
  if (select count(*) from public."CLIENT" where business_id=p_business_id and archived_at is null and public.messaging_phone("PhoneNumber")=phone) <> 1 then
    raise exception 'Multiple clients share this number. Update the client records before messaging.';
  end if;
  insert into public.client_conversation (business_id, client_id, phone_number) values (p_business_id,p_client_id,phone)
  on conflict (business_id,phone_number) do update set client_id=excluded.client_id returning id into result;
  return result;
end;
$$;

create or replace function public.record_client_inbound(p_business_id uuid, p_phone text, p_body text, p_sid text, p_media_count integer default 0, p_opt_out boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare target_client bigint; thread_id uuid; existing_thread uuid;
begin
  select conversation_id into existing_thread from public.client_sms_message where provider_message_id=p_sid;
  if existing_thread is not null then return existing_thread; end if;
  select case when count(*)=1 then min(id) else null end into target_client from public."CLIENT"
    where business_id=p_business_id and archived_at is null and public.messaging_phone("PhoneNumber")=p_phone;
  insert into public.client_conversation (business_id,client_id,phone_number,sms_opted_out)
  values (p_business_id,target_client,p_phone,p_opt_out)
  on conflict (business_id,phone_number) do update set
    client_id=excluded.client_id, sms_opted_out=client_conversation.sms_opted_out or excluded.sms_opted_out
  returning id into thread_id;
  insert into public.client_sms_message (business_id,conversation_id,direction,message_body,media_count,status,provider_message_id)
  values (p_business_id,thread_id,'inbound',p_body,p_media_count,'received',p_sid)
  on conflict (provider_message_id) do nothing;
  if p_opt_out then
    update public."CLIENT" set sms_consent=false where business_id=p_business_id and public.messaging_phone("PhoneNumber")=p_phone;
  end if;
  return thread_id;
end;
$$;
-- Repair unlinked conversations only where exactly one active client matches.
update public.client_conversation c set client_id=matches.client_id
from (
 select business_id, public.messaging_phone("PhoneNumber") as phone, min(id) as client_id
 from public."CLIENT" where archived_at is null
 group by business_id, public.messaging_phone("PhoneNumber") having count(*)=1
) matches
where c.client_id is null and c.business_id=matches.business_id and c.phone_number=matches.phone;
