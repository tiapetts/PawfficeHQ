create table if not exists public.support_request (
  id uuid primary key default gen_random_uuid(), requester_name text not null check (char_length(requester_name) between 2 and 100),
  requester_email text not null check (char_length(requester_email) between 5 and 254), business_name text,
  category text not null check (category in ('product','account','billing','technical','privacy','legal','other')),
  subject text not null check (char_length(subject) between 3 and 160), message text not null check (char_length(message) between 10 and 5000),
  status text not null default 'new' check (status in ('new','in_progress','resolved')), ip_hash text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), resolved_at timestamptz
);
create index if not exists support_request_status_created_idx on public.support_request(status, created_at desc);
create index if not exists support_request_ip_created_idx on public.support_request(ip_hash, created_at desc);
alter table public.support_request enable row level security;
drop policy if exists "Platform admins can read support requests" on public.support_request;
create policy "Platform admins can read support requests" on public.support_request for select to authenticated using (public.is_platform_admin());
drop policy if exists "Platform admins can update support requests" on public.support_request;
create policy "Platform admins can update support requests" on public.support_request for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
revoke all on public.support_request from anon;
grant select, update on public.support_request to authenticated;
