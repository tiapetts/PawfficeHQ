alter table public.square_connection alter column access_token drop not null;
alter table public.square_connection add column if not exists access_token_encrypted text;
alter table public.square_connection add column if not exists refresh_token_encrypted text;
alter table public.square_connection add column if not exists token_last_refreshed_at timestamptz;
alter table public.square_connection add column if not exists token_last_checked_at timestamptz;
alter table public.square_connection add column if not exists last_token_error text;

create or replace function public.get_square_connection_status(p_business_id uuid)
returns table(is_connected boolean,status text,merchant_id text,location_id text,location_name text,environment text,connected_at timestamptz,token_expires_at timestamptz,last_token_error text)
language sql stable security definer set search_path=public as $$
 select c.status='connected',c.status,c.merchant_id,c.location_id,c.location_name,c.environment,c.connected_at,c.token_expires_at,c.last_token_error
 from public.square_connection c where c.business_id=p_business_id and(public.user_belongs_to_business(p_business_id) or public.is_platform_admin());
$$;
grant execute on function public.get_square_connection_status(uuid) to authenticated;
