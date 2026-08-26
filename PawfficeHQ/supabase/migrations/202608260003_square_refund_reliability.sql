create unique index if not exists refund_provider_refund_id_unique
on public.refund(provider_refund_id)
where provider_refund_id is not null;
