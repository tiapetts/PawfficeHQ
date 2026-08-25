alter table public."PET" add column if not exists gender text;
alter table public."PET" add column if not exists coat_length text;
alter table public."PET" add column if not exists behavior_notes text;
alter table public."PET" add column if not exists altered_status text;
alter table public."PET" add column if not exists general_notes text;
alter table public."PET" add column if not exists import_batch_id uuid;
alter table public."PET" add column if not exists imported_source_row integer;
create index if not exists pet_import_batch_idx on public."PET"(business_id,import_batch_id);
