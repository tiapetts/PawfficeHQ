create table if not exists public.staff_tip_allocation (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business(id) on delete cascade,
  payment_id uuid not null references public.payment(id) on delete cascade,
  staff_id uuid not null references public."STAFF"(id) on delete cascade,
  amount numeric(10,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_id, staff_id)
);

create index if not exists staff_tip_allocation_business_idx
  on public.staff_tip_allocation (business_id, payment_id);

alter table public.staff_tip_allocation enable row level security;

drop policy if exists "Business members manage tip allocations"
  on public.staff_tip_allocation;
create policy "Business members manage tip allocations"
  on public.staff_tip_allocation for all to authenticated
  using (public.can_access_business_module(business_id))
  with check (public.can_access_business_module(business_id));

