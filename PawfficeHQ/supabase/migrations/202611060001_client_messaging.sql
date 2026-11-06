-- Two-way SMS is routed by the business-owned Twilio destination number.
-- Provision these rows server-side; credentials themselves stay in function secrets.
create table public.business_sms_number (
  business_id uuid primary key references public.business(id) on delete cascade,
  phone_number text not null unique check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  account_sid text not null check (account_sid ~ '^AC[0-9a-fA-F]{32}$'),
  auth_token_secret text not null check (auth_token_secret ~ '^[A-Z][A-Z0-9_]+$')
);
alter table public.business_sms_number enable row level security;
revoke all on public.business_sms_number from anon, authenticated;
grant all on public.business_sms_number to service_role;

create or replace function public.messaging_phone(value text)
returns text language sql immutable set search_path = public as $$
  select case
    when regexp_replace(coalesce(value,''), '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
      then '+1' || regexp_replace(value, '[^0-9]', '', 'g')
    when regexp_replace(coalesce(value,''), '[^0-9]', '', 'g') ~ '^1[0-9]{10}$'
      then '+' || regexp_replace(value, '[^0-9]', '', 'g')
    when value ~ '^\+[1-9][0-9]{7,14}$' then value
    else null end;
$$;

create or replace function public.can_use_client_messages(p_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_subscription_access(p_business_id) and exists (
    select 1 from public."STAFF" where business_id = p_business_id
    and auth_user_id = auth.uid() and is_active = true
  );
$$;
revoke all on function public.can_use_client_messages(uuid) from public;
grant execute on function public.can_use_client_messages(uuid) to authenticated, service_role;

create table public.client_conversation (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business(id) on delete cascade,
  client_id bigint references public."CLIENT"(id) on delete set null,
  phone_number text not null check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  sms_opted_out boolean not null default false,
  last_message_at timestamptz not null default now(),
  unique (business_id, phone_number),
  unique (business_id, id)
);
create table public.client_message (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  conversation_id uuid not null,
  direction text not null check (direction in ('inbound','outbound')),
  message_body text not null,
  media_count integer not null default 0 check (media_count >= 0),
  status text not null check (status in ('pending','queued','sent','delivered','received','failed','undelivered','unknown')),
  provider_message_id text unique,
  request_id uuid,
  sender_user_id uuid references auth.users(id) on delete set null,
  error_message text,
  legacy_message_id uuid unique,
  created_at timestamptz not null default now(),
  foreign key (business_id, conversation_id) references public.client_conversation(business_id,id) on delete cascade,
  unique (business_id, request_id)
);
create index client_message_thread on public.client_message(conversation_id, created_at desc, id);
create index client_conversation_inbox on public.client_conversation(business_id, last_message_at desc);
create table public.client_conversation_read (
  conversation_id uuid not null references public.client_conversation(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null,
  primary key (conversation_id, user_id)
);

alter table public.client_conversation enable row level security;
alter table public.client_message enable row level security;
alter table public.client_conversation_read enable row level security;
revoke all on public.client_conversation, public.client_message, public.client_conversation_read from anon, authenticated;
grant select on public.client_conversation, public.client_message to authenticated;
grant all on public.client_conversation, public.client_message, public.client_conversation_read to service_role;
create policy "Staff can read business conversations" on public.client_conversation for select to authenticated
using (public.can_use_client_messages(business_id));
create policy "Staff can read business messages" on public.client_message for select to authenticated
using (public.can_use_client_messages(business_id));

-- A service-role write must not accidentally attach another tenant's client.
create function public.check_conversation_client() returns trigger language plpgsql set search_path = public as $$
begin
  if new.client_id is not null and not exists (select 1 from public."CLIENT" where id = new.client_id and business_id = new.business_id) then
    raise exception 'Client does not belong to this business';
  end if;
  return new;
end;
$$;
create trigger check_conversation_client before insert or update on public.client_conversation
for each row execute function public.check_conversation_client();
create function public.touch_client_conversation() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.client_conversation set last_message_at = greatest(last_message_at, new.created_at) where id = new.conversation_id;
  return new;
end;
$$;
create trigger touch_client_conversation after insert on public.client_message
for each row execute function public.touch_client_conversation();

create function public.get_messaging_connection(p_business_id uuid)
returns table (phone_number text) language sql stable security definer set search_path = public as $$
  select n.phone_number from public.business_sms_number n
  where n.business_id = p_business_id and public.can_use_client_messages(p_business_id);
$$;
create function public.start_client_conversation(p_business_id uuid, p_client_id bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare phone text; result uuid;
begin
  if not public.can_use_client_messages(p_business_id) then raise exception 'Not authorized'; end if;
  select public.messaging_phone("PhoneNumber") into phone from public."CLIENT"
  where id = p_client_id and business_id = p_business_id and archived_at is null;
  if phone is null then raise exception 'Client needs a valid mobile number'; end if;
  if (select count(*) from public."CLIENT" where business_id=p_business_id and public.messaging_phone("PhoneNumber")=phone) <> 1 then
    raise exception 'Multiple clients share this number. Update the client records before messaging.';
  end if;
  insert into public.client_conversation (business_id, client_id, phone_number) values (p_business_id,p_client_id,phone)
  on conflict (business_id,phone_number) do update set client_id=excluded.client_id returning id into result;
  return result;
end;
$$;
create function public.mark_client_conversation_read(p_conversation_id uuid, p_read_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.client_conversation where id=p_conversation_id and public.can_use_client_messages(business_id)) then raise exception 'Not authorized'; end if;
  insert into public.client_conversation_read values (p_conversation_id,auth.uid(),least(p_read_at,now()))
  on conflict (conversation_id,user_id) do update set read_at=greatest(client_conversation_read.read_at,excluded.read_at);
end;
$$;
create function public.messaging_inbox(p_business_id uuid)
returns table (id uuid, client_id bigint, phone_number text, client_name text, sms_opted_out boolean,
  last_message_at timestamptz, preview text, unread_count bigint)
language sql stable security definer set search_path = public as $$
  select c.id,c.client_id,c.phone_number,concat_ws(' ',cl."FirstName",cl."LastName"),c.sms_opted_out,c.last_message_at,
    (select left(m.message_body,140) from public.client_message m where m.conversation_id=c.id order by m.created_at desc,m.id desc limit 1),
    (select count(*) from public.client_message m where m.conversation_id=c.id and m.direction='inbound' and m.created_at > coalesce(r.read_at,'-infinity'::timestamptz))
  from public.client_conversation c left join public."CLIENT" cl on cl.id=c.client_id and cl.business_id=c.business_id
  left join public.client_conversation_read r on r.conversation_id=c.id and r.user_id=auth.uid()
  where c.business_id=p_business_id and public.can_use_client_messages(p_business_id)
  order by c.last_message_at desc,c.id;
$$;

-- Called only after the webhook validates the signature against the number's account.
create function public.record_client_inbound(p_business_id uuid, p_phone text, p_body text, p_sid text, p_media_count integer default 0, p_opt_out boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare target_client bigint; thread_id uuid; existing_thread uuid;
begin
  select conversation_id into existing_thread from public.client_message where provider_message_id=p_sid;
  if existing_thread is not null then return existing_thread; end if;
  select case when count(*)=1 then min(id) else null end into target_client from public."CLIENT"
    where business_id=p_business_id and public.messaging_phone("PhoneNumber")=p_phone;
  insert into public.client_conversation (business_id,client_id,phone_number,sms_opted_out)
  values (p_business_id,target_client,p_phone,p_opt_out)
  on conflict (business_id,phone_number) do update set
    client_id=excluded.client_id, sms_opted_out=client_conversation.sms_opted_out or excluded.sms_opted_out
  returning id into thread_id;
  insert into public.client_message (business_id,conversation_id,direction,message_body,media_count,status,provider_message_id)
  values (p_business_id,thread_id,'inbound',p_body,p_media_count,'received',p_sid)
  on conflict (provider_message_id) do nothing;
  if p_opt_out then
    update public."CLIENT" set sms_consent=false where business_id=p_business_id and public.messaging_phone("PhoneNumber")=p_phone;
  end if;
  return thread_id;
end;
$$;

-- Preserve reminder history and keep future reminder sends visible in Messages.
create function public.mirror_appointment_sms() returns trigger language plpgsql security definer set search_path = public as $$
declare thread_id uuid; phone text;
begin
  phone := public.messaging_phone(new.phone_number);
  if phone is null then return new; end if;
  insert into public.client_conversation (business_id,client_id,phone_number,last_message_at)
  values (new.business_id,new.client_id,phone,new.created_at)
  on conflict (business_id,phone_number) do update set last_message_at=greatest(client_conversation.last_message_at,excluded.last_message_at)
  returning id into thread_id;
  insert into public.client_message (business_id,conversation_id,direction,message_body,status,provider_message_id,legacy_message_id,created_at,error_message)
  values (new.business_id,thread_id,new.direction,new.message_body,
    case when new.status='skipped' then 'failed' else new.status end,new.provider_message_id,new.id,new.created_at,new.error_message)
  on conflict (legacy_message_id) do update set status=excluded.status,provider_message_id=excluded.provider_message_id,error_message=excluded.error_message;
  return new;
end;
$$;
create trigger mirror_appointment_sms after insert or update on public.appointment_sms_message
for each row execute function public.mirror_appointment_sms();
update public.appointment_sms_message set status=status;

revoke all on function public.get_messaging_connection(uuid), public.start_client_conversation(uuid,bigint),
  public.mark_client_conversation_read(uuid,timestamptz), public.messaging_inbox(uuid) from public;
grant execute on function public.get_messaging_connection(uuid), public.start_client_conversation(uuid,bigint),
  public.mark_client_conversation_read(uuid,timestamptz), public.messaging_inbox(uuid) to authenticated;
revoke all on function public.record_client_inbound(uuid,text,text,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.record_client_inbound(uuid,text,text,text,integer,boolean) to service_role;
revoke all on function public.check_conversation_client(), public.touch_client_conversation(), public.mirror_appointment_sms() from public;

create function public.messaging_unread_count(p_business_id uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from public.client_message m
  left join public.client_conversation_read r on r.conversation_id=m.conversation_id and r.user_id=auth.uid()
  where m.business_id=p_business_id and m.direction='inbound'
  and m.created_at > coalesce(r.read_at,'-infinity'::timestamptz)
  and public.can_use_client_messages(p_business_id);
$$;
revoke all on function public.messaging_unread_count(uuid) from public;
grant execute on function public.messaging_unread_count(uuid) to authenticated;

-- Reminder jobs and staff replies share the same locked SMS allowance row.
create function public.reserve_reminder_sms_segments(p_business_id uuid, p_segments integer)
returns table (allowed boolean) language plpgsql security definer set search_path = public as $$
declare subscription public.business_subscription%rowtype; max_segments integer;
begin
  if p_segments < 1 then raise exception 'Invalid segment count'; end if;
  select * into subscription from public.business_subscription where business_id=p_business_id for update;
  if not found or not public.has_subscription_access(p_business_id) then return query select false; return; end if;
  if subscription.sms_period_start < date_trunc('month',current_date)::date then
    update public.business_subscription set sms_used=0,sms_period_start=current_date where business_id=p_business_id
    returning * into subscription;
  end if;
  max_segments := case when subscription.plan='pro' then 1000 else 250 end;
  if subscription.sms_used + p_segments > max_segments then return query select false; return; end if;
  update public.business_subscription set sms_used=sms_used+p_segments where business_id=p_business_id;
  return query select true;
end;
$$;
revoke all on function public.reserve_reminder_sms_segments(uuid,integer) from public,anon,authenticated;
grant execute on function public.reserve_reminder_sms_segments(uuid,integer) to service_role;
