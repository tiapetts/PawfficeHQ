import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
// Minimal schema contract for the checkout migration; all records are synthetic.
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to authenticated,anon,service_role;
create table business(id uuid primary key);
create table "STAFF"(id uuid primary key, business_id uuid, auth_user_id uuid, is_active boolean);
create table "CLIENT"(id bigint primary key,business_id uuid,"FirstName" text,"LastName" text);
create table "PET"(id bigint primary key,business_id uuid,"PetName" text);
create table appointment(id uuid primary key,business_id uuid,client_id bigint,start_at timestamptz,status text);
create table appointment_pet(appointment_id uuid,pet_id bigint);
create table service(id uuid primary key,business_id uuid,name text,base_price numeric);
create table appointment_service(id uuid primary key default gen_random_uuid(),appointment_id uuid,service_id uuid,price_at_booking numeric);
create table invoice(id uuid primary key default gen_random_uuid(), business_id uuid,appointment_id uuid,client_id bigint,invoice_number text,status text,created_by uuid,subtotal numeric default 0,total numeric generated always as (subtotal) stored);
create table invoice_item(id uuid primary key default gen_random_uuid(),invoice_id uuid,service_id uuid,description text,quantity numeric,unit_price numeric,line_total numeric generated always as (quantity*unit_price) stored);
create function has_subscription_access(uuid) returns boolean language sql stable as $$ select true $$;
create function refresh_invoice_totals(p_invoice_id uuid) returns void language sql as $$ update public.invoice set subtotal=(select coalesce(sum(line_total),0) from public.invoice_item where invoice_id=p_invoice_id) where id=p_invoice_id $$;
alter table invoice enable row level security;
create policy invoice_read on invoice for select to authenticated using(exists(select 1 from "STAFF" s where s.business_id=invoice.business_id and s.auth_user_id=auth.uid() and s.is_active));
grant select on invoice,"STAFF" to authenticated;
alter default privileges in schema public grant execute on functions to anon,authenticated;
`);
const a='10000000-0000-0000-0000-000000000001', b='10000000-0000-0000-0000-000000000002';
const user='20000000-0000-0000-0000-000000000001', other='20000000-0000-0000-0000-000000000002';
const ids=Array.from({length:8},(_,i)=>`30000000-0000-0000-0000-00000000000${i+1}`);
const svc='40000000-0000-0000-0000-000000000001';
await db.query('insert into business values ($1),($2)',[a,b]);
await db.query('insert into "STAFF" values ($1,$2,$1,true),($3,$4,$3,true)',[user,a,other,b]);
await db.query(`insert into "CLIENT" values (1,$1,'Owner','One'),(2,$1,'Owner','Two'),(3,$2,'Other','Business')`,[a,b]);
await db.query(`insert into "PET" values (1,$1,'Milo'),(2,$1,'Luna')`,[a]);
await db.query(`insert into service values ($1,$2,'Groom',50)`,[svc,a]);
for(let n=0;n<ids.length;n++){
 await db.query(`insert into appointment values($1,$2,$3,$4,$5)`,[ids[n],n===3?b:a,n===2?2:n===3?3:1,n===7?'2026-11-08T15:00:00Z':'2026-11-07T15:00:00Z',n===4?'cancelled':'completed']);
 await db.query('insert into appointment_pet values($1,$2)',[ids[n],n%2+1]);
 await db.query('insert into appointment_service(appointment_id,service_id,price_at_booking) values($1,$2,$3)',[ids[n],svc,n===0?65:45]);
}
// A pre-existing single appointment invoice is linked without changing its items.
const legacy='50000000-0000-0000-0000-000000000001';
await db.query(`insert into invoice(id,business_id,appointment_id,client_id,invoice_number,status) values($1,$2,$3,1,'LEGACY','paid')`,[legacy,a,ids[5]]);
await db.exec(await readFile(new URL('../supabase/migrations/20261107024142_household_checkout.sql',import.meta.url),'utf8'));
const scalar=async(q,p=[])=>Object.values((await db.query(q,p)).rows[0])[0];
assert.equal(await scalar('select count(*) from invoice_appointment where invoice_id=$1',[legacy]),1);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
await db.exec('set role authenticated');
const candidates=await db.query(`select * from get_household_checkout($1,'2026-11-07T06:00:00Z','2026-11-08T06:00:00Z')`,[ids[0]]);
assert.equal(candidates.rows.length,5); // excludes other owner, tenant, and next day
assert.equal(candidates.rows.find(x=>x.id===ids[0]).pet_names,'Milo');
assert.equal(candidates.rows.find(x=>x.id===ids[5]).invoice_id,legacy);
await assert.rejects(db.query(`select get_household_checkout($1,'2026-11-07','2026-11-08')`,[ids[3]]),/access/);
const invoice=await scalar('select create_invoice_from_appointments($1)',[[ids[0],ids[1]]]);
assert.equal(await scalar('select total from invoice where id=$1',[invoice]),'110');
assert.equal(await scalar('select create_invoice_from_appointments($1)',[[ids[1],ids[0],ids[0]]]),invoice);
assert.equal(await scalar('select create_invoice_from_appointment($1)',[ids[1]]),invoice);
await assert.rejects(db.query('select create_invoice_from_appointments($1)',[[ids[0],ids[6]]]),/already has an invoice/);
await assert.rejects(db.query('select create_invoice_from_appointments($1)',[[ids[6],ids[2]]]),/one client/);
await assert.rejects(db.query('select create_invoice_from_appointments($1)',[[ids[6],ids[3]]]),/one client|access/);
await assert.rejects(db.query('select create_invoice_from_appointments($1)',[[ids[4]]]),/cannot be checked out/);
await assert.rejects(db.query('select create_invoice_from_appointments($1)',[[]]),/Select between/);
await assert.rejects(db.query('insert into invoice_appointment values($1,$2,true)',[invoice,ids[6]]),/permission denied/);
await db.exec('reset role');
assert.equal(await scalar('select count(*) from invoice_item where invoice_id=$1',[invoice]),2);
const lines=(await db.query('select description,unit_price from invoice_item where invoice_id=$1 order by unit_price desc',[invoice])).rows;
assert.deepEqual(lines,[{description:'Milo — Groom',unit_price:'65'},{description:'Luna — Groom',unit_price:'45'}]);
assert.equal(await scalar("select count(*) from invoice"),2); // retries did not create invoices
await assert.rejects(db.query('insert into invoice_appointment values($1,$2,true)',[invoice,ids[2]]),/same business and client/);
await db.query("update invoice set status='paid' where id=$1",[invoice]);
await db.exec('set role authenticated');
assert.equal(await scalar('select create_invoice_from_appointment($1)',[ids[1]]),invoice); // paid invoices cannot be charged anew
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
assert.equal(await scalar('select count(*) from invoice_appointment'),0);
await assert.rejects(db.query('select create_invoice_from_appointment($1)',[ids[0]]),/access/);
await db.exec('reset role');
assert.equal(await scalar("select has_function_privilege('anon','create_invoice_from_appointments(uuid[])','execute')"),false);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
await db.query("update invoice set status='void' where id=$1",[invoice]);
assert.equal(await scalar('select count(*) from invoice_appointment where invoice_id=$1 and active',[invoice]),0);
assert.equal(await scalar('select count(*) from invoice_appointment where invoice_id=$1',[invoice]),2); // history kept
await db.exec('set role authenticated');
const replacement=await scalar('select create_invoice_from_appointments($1)',[[ids[0],ids[1]]]);
assert.notEqual(replacement,invoice);
await db.exec('reset role');
await assert.rejects(db.query("update invoice set status='open' where id=$1",[invoice]),/duplicate key/);
console.log('PASS: household totals, pet-labelled items, same-owner/day candidates, legacy backfill, retry/paid protection, cross-tenant access, RLS, void history and replacement');
await db.close();
