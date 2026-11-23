-- Household service agreement foundation. No public signing endpoint in this stage.
create table if not exists public.service_agreement_template (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null,
 title text not null check (length(trim(title)) between 1 and 160),
 active_version_id uuid,
 created_at timestamptz not null default now(),
 unique(id,business_id)
);
create table if not exists public.service_agreement_version (
 id uuid primary key default gen_random_uuid(),
 template_id uuid not null,
 business_id uuid not null,
 version_number integer not null check(version_number > 0),
 storage_path text not null unique,
 file_sha256 text,
 requires_renewal boolean not null default true,
 published_at timestamptz not null default now(),
 unique(template_id,version_number),
 unique(id,template_id,business_id),
 foreign key (template_id,business_id) references public.service_agreement_template(id,business_id) on delete restrict
);
alter table public.service_agreement_template add constraint service_agreement_active_version_fk
 foreign key(active_version_id,id,business_id)
 references public.service_agreement_version(id,template_id,business_id) deferrable initially deferred;
-- Prevent cross-tenant household references even for privileged writers.
create or replace function public.validate_agreement_household()
returns trigger language plpgsql set search_path = '' as $
begin
 if not exists(select 1 from public."CLIENT" c where c.id = new.client_id and c.business_id = new.business_id) then
  raise exception 'Agreement client must belong to the same business';
 end if;
 return new;
end;
$;
revoke all on function public.validate_agreement_household() from public, anon, authenticated;
create table if not exists public.service_agreement_request (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null,
 client_id bigint not null,
 template_id uuid not null,
 version_id uuid not null,
 status text not null default 'draft' check(status in ('draft','sent','viewed','signed','expired','cancelled')),
 recipient_email text,
 recipient_phone text,
 token_hash text unique,
 expires_at timestamptz,
 sent_at timestamptz,
 signed_at timestamptz,
 created_at timestamptz not null default now(),
 foreign key(client_id) references public."CLIENT"(id) on delete restrict,
 foreign key(version_id,template_id,business_id) references public.service_agreement_version(id,template_id,business_id) on delete restrict,
 unique(id,business_id,client_id)
);
create trigger validate_agreement_request_household before insert or update on public.service_agreement_request
for each row execute function public.validate_agreement_household();
create table if not exists public.service_agreement_signature (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique,
 business_id uuid not null,
 client_id bigint not null,
 signer_name text not null,
 signed_document_path text not null unique,
 signed_document_sha256 text not null,
 consent_text text not null,
 signed_at timestamptz not null default now(),
 audit_json jsonb not null default '{}'::jsonb,
 foreign key(request_id,business_id,client_id) references public.service_agreement_request(id,business_id,client_id) on delete restrict
);
create index if not exists service_agreement_request_household_idx on public.service_agreement_request(business_id,client_id,created_at desc);
create index if not exists service_agreement_template_business_idx on public.service_agreement_template(business_id);
alter table public.service_agreement_template enable row level security;
alter table public.service_agreement_version enable row level security;
alter table public.service_agreement_request enable row level security;
alter table public.service_agreement_signature enable row level security;
-- Read access only for active staff in the matching business.
create policy "Staff read own business agreement templates" on public.service_agreement_template
for select to authenticated using (exists(select 1 from public."STAFF" s where s.business_id=service_agreement_template.business_id and s.auth_user_id=(select auth.uid()) and s.is_active=true));
create policy "Staff read own business agreement versions" on public.service_agreement_version
for select to authenticated using (exists(select 1 from public."STAFF" s where s.business_id=service_agreement_version.business_id and s.auth_user_id=(select auth.uid()) and s.is_active=true));
create policy "Staff read own business agreement requests" on public.service_agreement_request
for select to authenticated using (exists(select 1 from public."STAFF" s where s.business_id=service_agreement_request.business_id and s.auth_user_id=(select auth.uid()) and s.is_active=true));
create policy "Staff read own business signatures" on public.service_agreement_signature
for select to authenticated using (exists(select 1 from public."STAFF" s where s.business_id=service_agreement_signature.business_id and s.auth_user_id=(select auth.uid()) and s.is_active=true));
grant select on public.service_agreement_template,public.service_agreement_version,public.service_agreement_request,public.service_agreement_signature to authenticated;
revoke insert,update,delete on public.service_agreement_template,public.service_agreement_version,public.service_agreement_request,public.service_agreement_signature from anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('service-agreements','service-agreements',false,10485760,array['application/pdf'])
on conflict(id) do nothing;
-- No browser storage policies: privileged upload and download endpoints must verify staff tenant access.
