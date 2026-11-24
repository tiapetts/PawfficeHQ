alter table public.service_agreement_template add column if not exists validity_days integer not null default 365;
alter table public.service_agreement_template drop constraint if exists service_agreement_template_validity_days_check;
alter table public.service_agreement_template add constraint service_agreement_template_validity_days_check check (validity_days between 1 and 3650);
comment on column public.service_agreement_template.validity_days is 'Number of days a signed agreement remains valid; 365 by default.';
