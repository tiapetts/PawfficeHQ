create table if not exists public.square_checkout (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business(id) on delete cascade,
  invoice_id uuid not null references public.invoice(id) on delete cascade,
  square_order_id text not null unique,
  square_payment_link_id text,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'USD',
  status text not null default 'pending' check (status in ('pending','completed','failed','cancelled')),
  square_payment_id text,
  created_by uuid not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists square_checkout_business_invoice_idx
  on public.square_checkout (business_id, invoice_id, created_at desc);

alter table public.square_checkout enable row level security;

create unique index if not exists payment_square_provider_id_unique
  on public.payment (provider, provider_payment_id)
  where provider = 'square' and provider_payment_id is not null;

create table if not exists public.square_webhook_event (
  event_id text primary key,
  event_type text not null,
  merchant_id text,
  processed_at timestamptz not null default now()
);

alter table public.square_webhook_event enable row level security;

drop policy if exists "Business members view Square checkouts" on public.square_checkout;
create policy "Business members view Square checkouts"
  on public.square_checkout for select to authenticated
  using (public.user_belongs_to_business(business_id) or public.is_platform_admin());
