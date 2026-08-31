-- Configurable client SMS reminders and reply-to-confirm tracking.
alter table public."CLIENT"
  add column if not exists sms_consent boolean not null default false,
  add column if not exists sms_consent_at timestamptz;

alter table public.business_notification_settings
  add column if not exists client_sms_reminders_enabled boolean not null default false,
  add column if not exists initial_reminder_hours integer not null default 24,
  add column if not exists one_hour_reminder_enabled boolean not null default true,
  add column if not exists reminder_message_template text not null default
    'Hi {client_first_name}, this is {business_name}. {pet_names} has an appointment on {appointment_date} at {appointment_time}. Reply C to confirm.';

alter table public.business_notification_settings
  drop constraint if exists business_notification_settings_initial_reminder_hours_check;
alter table public.business_notification_settings
  add constraint business_notification_settings_initial_reminder_hours_check
  check (initial_reminder_hours in (24, 48));

alter table public.appointment
  add column if not exists client_confirmed_at timestamptz,
  add column if not exists client_confirmation_source text;

create table if not exists public.appointment_sms_message (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business(id) on delete cascade,
  appointment_id uuid not null references public.appointment(id) on delete cascade,
  client_id bigint not null references public."CLIENT"(id) on delete cascade,
  direction text not null check (direction in ('outbound', 'inbound')),
  message_kind text not null check (message_kind in ('initial_reminder', 'one_hour_reminder', 'confirmation_reply', 'manual_reminder')),
  phone_number text not null,
  message_body text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'received', 'failed', 'skipped')),
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists appointment_sms_one_automatic_reminder
  on public.appointment_sms_message (appointment_id, message_kind)
  where direction = 'outbound' and message_kind in ('initial_reminder', 'one_hour_reminder');
create unique index if not exists appointment_sms_provider_message
  on public.appointment_sms_message (provider_message_id)
  where provider_message_id is not null;
create index if not exists appointment_sms_reply_lookup
  on public.appointment_sms_message (phone_number, created_at desc)
  where direction = 'outbound' and status = 'sent';

alter table public.appointment_sms_message enable row level security;
drop policy if exists "Business members can view appointment SMS" on public.appointment_sms_message;
create policy "Business members can view appointment SMS"
on public.appointment_sms_message for select to authenticated
using (public.user_belongs_to_business(business_id) or public.is_platform_admin());

grant select on public.appointment_sms_message to authenticated;

-- Keep the consent timestamp truthful when staff changes the checkbox.
create or replace function public.sync_client_sms_consent_timestamp()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.sms_consent and not coalesce(old.sms_consent, false) then
    new.sms_consent_at := now();
  elsif not new.sms_consent then
    new.sms_consent_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_client_sms_consent_timestamp on public."CLIENT";
create trigger sync_client_sms_consent_timestamp
before update of sms_consent on public."CLIENT"
for each row execute function public.sync_client_sms_consent_timestamp();
