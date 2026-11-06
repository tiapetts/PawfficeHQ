import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to authenticated,service_role,anon;
grant execute on function auth.uid() to authenticated,service_role;
create table business(id uuid primary key);
create table "STAFF"(id uuid primary key default gen_random_uuid(),business_id uuid,auth_user_id uuid,is_active boolean);
create table "CLIENT"(id bigint primary key,business_id uuid,"PhoneNumber" text,"FirstName" text,"LastName" text,archived_at timestamptz,sms_consent boolean);
create function has_subscription_access(uuid) returns boolean language sql as $$ select true $$;
create table business_subscription(business_id uuid primary key,plan text,sms_used integer,sms_period_start date);
create table appointment_sms_message(id uuid primary key default gen_random_uuid(),business_id uuid,appointment_id uuid,client_id bigint,direction text,phone_number text,message_body text,status text,provider_message_id text,error_message text,created_at timestamptz default now());
insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
insert into business values ('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
insert into "STAFF"(business_id,auth_user_id,is_active) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',true),('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002',true),('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003',true);
insert into "CLIENT" values (1,'10000000-0000-0000-0000-000000000001','(920) 555-0123','Client','One',null,true),(2,'10000000-0000-0000-0000-000000000002','(920) 555-0123','Client','Two',null,true);
`);
await db.exec(
  await readFile(
    new URL(
      "../supabase/migrations/202611060001_client_messaging.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
const a = "10000000-0000-0000-0000-000000000001",
  b = "10000000-0000-0000-0000-000000000002";
async function scalar(sql, params = []) {
  const r = await db.query(sql, params);
  return Object.values(r.rows[0])[0];
}
const ca = await scalar(
  `select record_client_inbound($1,'+19205550123','Do you offer trims?','SM1')`,
  [a],
);
const cb = await scalar(
  `select record_client_inbound($1,'+19205550123','Different business','SM2')`,
  [b],
);
assert.notEqual(ca, cb);
assert.equal(
  await scalar("select client_id from client_conversation where id=$1", [ca]),
  1,
);
await scalar(
  `select record_client_inbound($1,'+19205550123','Do you offer trims?','SM1')`,
  [a],
);
assert.equal(await scalar("select count(*) from client_message"), 2);
await assert.rejects(
  db.query(
    "insert into client_conversation(business_id,client_id,phone_number) values ($1,2,$2)",
    [a, "+19205550124"],
  ),
  /does not belong/,
);
await assert.rejects(
  db.query(
    `insert into client_message(business_id,conversation_id,direction,message_body,status) values ($1,$2,'outbound','wrong tenant','pending')`,
    [a, cb],
  ),
  /foreign key/,
);
await scalar(
  `select record_client_inbound($1,'+19205550123','STOP','SM3',0,true)`,
  [a],
);
assert.equal(
  await scalar("select sms_opted_out from client_conversation where id=$1", [
    ca,
  ]),
  true,
);
assert.equal(
  await scalar('select sms_consent from "CLIENT" where id=1'),
  false,
);
assert.equal(await scalar('select sms_consent from "CLIENT" where id=2'), true);
const unknown = await scalar(
  `select record_client_inbound($1,'+19205550199','New customer question','SM4')`,
  [a],
);
assert.equal(
  await scalar("select client_id from client_conversation where id=$1", [
    unknown,
  ]),
  null,
);
await db.exec(
  `insert into business_sms_number values ('${a}','+19205559999','AC${
    "a".repeat(32)
  }','BUSINESS_A_TWILIO_AUTH_TOKEN')`,
);
await db.exec(
  `set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'`,
);
assert.equal(await scalar("select count(*) from client_message"), 3);
assert.equal(await scalar("select count(*) from messaging_inbox($1)", [b]), 0);
assert.equal(await scalar("select messaging_unread_count($1)", [a]), 3);
await scalar("select mark_client_conversation_read($1,now())", [ca]);
assert.equal(await scalar("select messaging_unread_count($1)", [a]), 1);
await assert.rejects(
  db.query("select mark_client_conversation_read($1,now())", [cb]),
  /Not authorized/,
);
await assert.rejects(
  db.query("select start_client_conversation($1,2)", [b]),
  /Not authorized/,
);
await assert.rejects(
  db.query("select * from business_sms_number"),
  /permission denied/,
);
await assert.rejects(
  db.query(`select record_client_inbound($1,'+19205550123','spoof','SM5')`, [
    a,
  ]),
  /permission denied/,
);
await assert.rejects(
  db.query(
    `insert into client_message(business_id,conversation_id,direction,message_body,status) values ($1,$2,'outbound','bypass send','pending')`,
    [a, ca],
  ),
  /permission denied/,
);
assert.equal(
  await scalar("select phone_number from get_messaging_connection($1)", [a]),
  "+19205559999",
);
await db.exec(
  `set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003'`,
);
assert.equal(await scalar("select messaging_unread_count($1)", [a]), 3);
await db.exec("reset role");
await db.query(
  `insert into appointment_sms_message(business_id,client_id,direction,phone_number,message_body,status,provider_message_id) values ($1,1,'outbound','+19205550123','Reminder','pending','SM6')`,
  [a],
);
await db.exec(
  `update appointment_sms_message set status='sent' where provider_message_id='SM6'`,
);
assert.equal(
  await scalar(
    `select count(*) from client_message where provider_message_id='SM6'`,
  ),
  1,
);
assert.equal(
  await scalar(
    `select status from client_message where provider_message_id='SM6'`,
  ),
  "sent",
);
await db.query(
  "insert into business_subscription values ($1,'basic',249,current_date)",
  [a],
);
assert.equal(
  await scalar("select allowed from reserve_reminder_sms_segments($1,1)", [a]),
  true,
);
assert.equal(
  await scalar("select allowed from reserve_reminder_sms_segments($1,1)", [a]),
  false,
);
assert.equal(
  await scalar(
    "select sms_used from business_subscription where business_id=$1",
    [a],
  ),
  250,
);
assert.equal(
  await scalar("select allowed from reserve_reminder_sms_segments($1,1)", [b]),
  false,
);
await assert.rejects(
  db.query("select reserve_reminder_sms_segments($1,0)", [a]),
  /Invalid segment/,
);
console.log(
  "PASS: migration, tenant isolation, role permissions, duplicate webhooks, unknown sender, consent, per-user unread, reminder mirroring",
);
await db.close();
