// Run with Deno. All HTTP calls are replaced with fixtures; no SMS is sent.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const businessA = "10000000-0000-0000-0000-000000000001";
const businessB = "10000000-0000-0000-0000-000000000002";
const threadId = "20000000-0000-0000-0000-000000000001";
const accountSid = `AC${"a".repeat(32)}`;
const inboundUrl =
  "https://example.invalid/functions/v1/receive-appointment-confirmation";
Deno.env.set("SUPABASE_URL", "https://example.invalid");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "fixture-service-key");
Deno.env.set("SUPABASE_ANON_KEY", "fixture-anon-key");
Deno.env.set("TWILIO_TEST_TOKEN", "fixture-token");
Deno.env.set("TWILIO_CONFIRMATION_WEBHOOK_URL", inboundUrl);
Deno.env.set(
  "TWILIO_MESSAGE_STATUS_WEBHOOK_URL",
  "https://example.invalid/functions/v1/client-message-status",
);

type Row = Record<string, unknown>;
let authorized = true;
let consent = true;
let quota = true;
let providerCalls = 0;
let inboundWrites: Row[] = [];
let log: Row | null = null;
let reminderFixtures: Row[] = [];
let appointmentFixtures: Row[] = [];
let appointmentUpdates: Array<{ business: string | null; body: Row }> = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (resource: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(
    resource instanceof Request ? resource.url : String(resource),
  );
  const method = init?.method ?? "GET";
  const headers = new Headers(init?.headers);
  const json = (value: unknown) =>
    new Response(JSON.stringify(value), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  if (url.hostname === "api.twilio.com") {
    providerCalls++;
    return json({ sid: `SM${"1".repeat(32)}`, status: "queued" });
  }
  if (url.pathname === "/auth/v1/user") {
    return json({ id: "30000000-0000-0000-0000-000000000001" });
  }
  if (url.pathname.endsWith("/rpc/can_use_client_messages")) {
    return json(authorized);
  }
  if (url.pathname.endsWith("/rpc/consume_sms_segments")) {
    return json([{ allowed: quota }]);
  }
  if (url.pathname.endsWith("/rpc/record_client_inbound")) {
    inboundWrites.push(JSON.parse(String(init?.body)));
    return json(threadId);
  }
  let rows: Row[] = [];
  if (url.pathname.endsWith("/business_sms_number")) {
    const phone = url.searchParams.get("phone_number")?.replace("eq.", "") ??
      "+19205550001";
    rows = [{
      business_id: phone === "+19205550002" ? businessB : businessA,
      phone_number: phone,
      account_sid: accountSid,
      auth_token_secret: "TWILIO_TEST_TOKEN",
    }];
  } else if (url.pathname.endsWith("/client_conversation")) {
    rows = [{
      id: threadId,
      client_id: 1,
      phone_number: "+19205550123",
      sms_opted_out: false,
    }];
  } else if (url.pathname.endsWith("/CLIENT")) {
    rows = [{
      PhoneNumber: "(920) 555-0123",
      sms_consent: consent,
      archived_at: null,
    }];
  } else if (url.pathname.endsWith("/client_message")) {
    if (method === "POST") {
      log = {
        ...JSON.parse(String(init?.body)),
        id: "40000000-0000-0000-0000-000000000001",
      };
    }
    if (method === "PATCH" && log) {
      Object.assign(log, JSON.parse(String(init?.body)));
    }
    rows = log ? [log] : [];
  } else if (url.pathname.endsWith("/appointment_sms_message")) {
    assert.equal(url.searchParams.get("business_id"), `eq.${businessB}`);
    rows = reminderFixtures;
  } else if (url.pathname.endsWith("/appointment")) {
    if (method === "PATCH") {
      appointmentUpdates.push({
        business: url.searchParams.get("business_id"),
        body: JSON.parse(String(init?.body)),
      });
    }
    rows = appointmentFixtures;
  } else {
    throw new Error(`Unexpected HTTP call in test: ${url.pathname}`);
  }
  return json(
    headers.get("accept")?.includes("vnd.pgrst.object") ? rows[0] : rows,
  );
}) as typeof fetch;

const handlers: Array<(request: Request) => Promise<Response>> = [];
const originalServe = Deno.serve;
Deno.serve = ((handler: (request: Request) => Promise<Response>) => {
  handlers.push(handler);
  return {};
}) as typeof Deno.serve;
await import("../functions/send-client-message/index.ts");
await import("../functions/receive-appointment-confirmation/index.ts");
await import("../functions/client-message-status/index.ts");
Deno.serve = originalServe;
const [send, receive, callback] = handlers;

function reset() {
  authorized = true;
  consent = true;
  quota = true;
  providerCalls = 0;
  inboundWrites = [];
  log = null;
  reminderFixtures = [];
  appointmentFixtures = [];
  appointmentUpdates = [];
}
function sendRequest() {
  return new Request("https://example.invalid/send", {
    method: "POST",
    headers: {
      Authorization: "Bearer fixture-user-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      businessId: businessA,
      conversationId: threadId,
      requestId: "50000000-0000-0000-0000-000000000001",
      message: "Yes, nail trims are available.",
    }),
  });
}
function signedRequest(url: string, values: Record<string, string>) {
  const params = new URLSearchParams(values);
  const pairs = Object.keys(values).sort().map((key) => `${key}${values[key]}`)
    .join("");
  const signature = createHmac("sha1", "fixture-token").update(url + pairs)
    .digest("base64");
  return new Request(url, {
    method: "POST",
    headers: {
      "X-Twilio-Signature": signature,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
}
Deno.test("staff reply is idempotent, consent-checked, tenant-authorized and quota-checked", async () => {
  reset();
  const first = await (await send(sendRequest())).json();
  assert.equal(first.message.status, "queued");
  assert.equal(providerCalls, 1);
  const second = await (await send(sendRequest())).json();
  assert.equal(second.message.id, first.message.id);
  assert.equal(providerCalls, 1);
  reset();
  authorized = false;
  assert.equal((await send(sendRequest())).status, 403);
  assert.equal(providerCalls, 0);
  reset();
  consent = false;
  assert.equal((await send(sendRequest())).status, 400);
  assert.equal(providerCalls, 0);
  reset();
  quota = false;
  const exhausted = await (await send(sendRequest())).json();
  assert.equal(exhausted.message.status, "failed");
  assert.equal(providerCalls, 0);
});
Deno.test("general client questions route by business number and require a real Twilio signature", async () => {
  reset();
  const values = {
    AccountSid: accountSid,
    To: "+19205550002",
    From: "+19205550123",
    MessageSid: "SMquestion",
    Body: "Do you offer nail trims?",
    NumMedia: "0",
  };
  const result = await receive(signedRequest(inboundUrl, values));
  assert.equal(result.status, 200);
  assert(!((await result.text()).includes("Reply C")));
  assert.equal(inboundWrites[0].p_business_id, businessB);
  assert.equal(inboundWrites[0].p_body, values.Body);
  assert.equal(providerCalls, 0);
  const forged = new Request(inboundUrl, {
    method: "POST",
    body: new URLSearchParams(values),
  });
  assert.equal((await receive(forged)).status, 403);
  assert.equal(inboundWrites.length, 1);
  const stop = await receive(
    signedRequest(inboundUrl, {
      ...values,
      MessageSid: "SMstop",
      Body: "STOP",
    }),
  );
  assert.equal(stop.status, 200);
  assert.equal(inboundWrites[1].p_opt_out, true);
});
Deno.test("signed delivery callback advances the matching thread and rejects a forged callback", async () => {
  reset();
  await send(sendRequest());
  const url =
    `https://example.invalid/functions/v1/client-message-status?message_id=${
      log!.id
    }`;
  const values = {
    AccountSid: accountSid,
    From: "+19205550001",
    To: "+19205550123",
    MessageSid: `SM${"1".repeat(32)}`,
    MessageStatus: "delivered",
  };
  assert.equal((await callback(signedRequest(url, values))).status, 200);
  assert.equal(log!.status, "delivered");
  assert.equal(
    (await callback(signedRequest(url, { ...values, MessageStatus: "sent" })))
      .status,
    200,
  );
  assert.equal(log!.status, "delivered");
  assert.equal(
    (await callback(
      new Request(url, { method: "POST", body: new URLSearchParams(values) }),
    )).status,
    403,
  );
});
// Keep accidental network access impossible for every test above.
Deno.test("fixtures never send real texts", () => {
  assert.notEqual(globalThis.fetch, originalFetch);
});

Deno.test("confirmation updates only one unambiguous upcoming appointment in the receiving business", async () => {
  reset();
  reminderFixtures = [{ appointment_id: "appointment-one" }];
  appointmentFixtures = [{ id: "appointment-one", client_confirmed_at: null }];
  const values = {
    AccountSid: accountSid,
    To: "+19205550002",
    From: "+19205550123",
    MessageSid: "SMconfirm",
    Body: "C",
  };
  const response = await receive(signedRequest(inboundUrl, values));
  assert.equal(response.status, 200);
  assert.equal(appointmentUpdates.length, 1);
  assert.equal(appointmentUpdates[0].business, `eq.${businessB}`);
  assert.equal(appointmentUpdates[0].body.status, "confirmed");
  reset();
  reminderFixtures = [{ appointment_id: "appointment-one" }, {
    appointment_id: "appointment-two",
  }];
  appointmentFixtures = [{ id: "appointment-one", client_confirmed_at: null }, {
    id: "appointment-two",
    client_confirmed_at: null,
  }];
  assert.equal((await receive(signedRequest(inboundUrl, values))).status, 200);
  assert.equal(appointmentUpdates.length, 0);
  assert.equal(inboundWrites.length, 1);
});
