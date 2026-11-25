create table if not exists public.support_status_email_log (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.support_request(id) on delete cascade,
 actor_id uuid not null references auth.users(id),
 from_status text not null,
 to_status text not null,
 recipient text not null,
 subject text not null,
 message_body text not null,
 provider_message_id text,
 status text not null check (status in ('pending','sent','failed','unknown')),
 error_message text,
 created_at timestamptz not null default now(),
 sent_at timestamptz
);
create index if not exists support_status_email_log_request_idx on public.support_status_email_log(request_id, created_at desc);
alter table public.support_status_email_log enable row level security;
revoke all on public.support_status_email_log from anon, authenticated;
