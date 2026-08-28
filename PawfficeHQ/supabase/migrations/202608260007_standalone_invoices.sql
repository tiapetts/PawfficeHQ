alter table public.invoice alter column client_id drop not null;
alter table public.invoice add column if not exists pet_id bigint references public."PET"(id) on delete set null;
alter table public.invoice add column if not exists walk_in_name text;
alter table public.invoice add column if not exists walk_in_email text;
alter table public.invoice add column if not exists walk_in_phone text;

create or replace function public.create_standalone_invoice(
  p_business_id uuid, p_client_id bigint default null, p_pet_id bigint default null,
  p_walk_in_name text default null, p_walk_in_email text default null, p_walk_in_phone text default null,
  p_items jsonb default '[]'::jsonb, p_discount_total numeric default 0,
  p_tax_total numeric default 0, p_notes text default null, p_issue_now boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare new_invoice_id uuid; item jsonb; calculated_subtotal numeric := 0; quantity_value numeric; price_value numeric;
begin
  if not public.user_belongs_to_business(p_business_id) and not public.is_platform_admin() then raise exception 'Not authorized to create invoices for this business.'; end if;
  if not public.has_subscription_access(p_business_id) then raise exception 'An active subscription or access grant is required.'; end if;
  if (p_client_id is null) = (nullif(btrim(p_walk_in_name), '') is null) then raise exception 'Choose one saved client or enter one walk-in customer.'; end if;
  if p_client_id is not null and not exists(select 1 from public."CLIENT" where id=p_client_id and business_id=p_business_id) then raise exception 'Client not found for this business.'; end if;
  if p_pet_id is not null and (p_client_id is null or not exists(select 1 from public.client_pet where client_id=p_client_id and pet_id=p_pet_id)) then raise exception 'The selected pet is not linked to this client.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'Add at least one invoice item.'; end if;

  for item in select value from jsonb_array_elements(p_items) loop
    quantity_value := nullif(item->>'quantity','')::numeric; price_value := nullif(item->>'unit_price','')::numeric;
    if nullif(btrim(item->>'description'),'') is null or quantity_value <= 0 or price_value < 0 then raise exception 'Every invoice item needs a description, positive quantity, and valid price.'; end if;
    calculated_subtotal := calculated_subtotal + quantity_value * price_value;
  end loop;
  if coalesce(p_discount_total,0)<0 or coalesce(p_tax_total,0)<0 or coalesce(p_discount_total,0)>calculated_subtotal+coalesce(p_tax_total,0) then raise exception 'Discount or tax amount is invalid.'; end if;

  insert into public.invoice(business_id, appointment_id, client_id, pet_id, walk_in_name, walk_in_email, walk_in_phone, invoice_number, status, currency, subtotal, discount_total, tax_total, notes, issued_at)
  values(p_business_id, null, p_client_id, p_pet_id, nullif(btrim(p_walk_in_name),''), nullif(btrim(p_walk_in_email),''), nullif(btrim(p_walk_in_phone),''), 'INV-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)), case when p_issue_now then 'open' else 'draft' end, 'usd', calculated_subtotal, coalesce(p_discount_total,0), coalesce(p_tax_total,0), nullif(btrim(p_notes),''), case when p_issue_now then now() else null end)
  returning id into new_invoice_id;

  for item in select value from jsonb_array_elements(p_items) loop
    insert into public.invoice_item(invoice_id, service_id, description, quantity, unit_price)
    values(new_invoice_id, nullif(item->>'service_id','')::uuid, btrim(item->>'description'), (item->>'quantity')::numeric, (item->>'unit_price')::numeric);
  end loop;
  return new_invoice_id;
end; $$;

revoke all on function public.create_standalone_invoice(uuid,bigint,bigint,text,text,text,jsonb,numeric,numeric,text,boolean) from public;
grant execute on function public.create_standalone_invoice(uuid,bigint,bigint,text,text,text,jsonb,numeric,numeric,text,boolean) to authenticated;
