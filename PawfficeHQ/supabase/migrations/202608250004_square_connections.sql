create table if not exists public.square_connection(
 business_id uuid primary key references public.business(id) on delete cascade,
 merchant_id text not null, location_id text, location_name text,
 access_token text not null, refresh_token text, token_expires_at timestamptz,
 environment text not null default 'sandbox' check(environment in('sandbox','production')),
 status text not null default 'connected' check(status in('connected','refresh_required','revoked','error')),
 connected_by uuid, connected_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.square_oauth_state(
 state text primary key, business_id uuid not null references public.business(id) on delete cascade,
 requested_by uuid not null, return_url text not null, expires_at timestamptz not null default(now()+interval '10 minutes'),
 created_at timestamptz not null default now()
);
alter table public.square_connection enable row level security;
alter table public.square_oauth_state enable row level security;

create or replace function public.get_square_connection_status(p_business_id uuid)
returns table(is_connected boolean,status text,merchant_id text,location_id text,location_name text,environment text,connected_at timestamptz)
language sql stable security definer set search_path=public as $$
 select c.status='connected',c.status,c.merchant_id,c.location_id,c.location_name,c.environment,c.connected_at
 from public.square_connection c where c.business_id=p_business_id and(public.user_belongs_to_business(p_business_id) or public.is_platform_admin());
$$;
grant execute on function public.get_square_connection_status(uuid) to authenticated;

