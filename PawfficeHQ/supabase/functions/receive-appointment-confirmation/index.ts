import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const xml = (value: string, status = 200) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${value}</Message></Response>`, { status, headers: { "Content-Type": "text/xml" } });
const normalizePhone = (value: string) => { const digits = value.replace(/\D/g, ""); return digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : value; };
const base64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

async function validTwilioSignature(request: Request, params: URLSearchParams, token: string) {
  const supplied = request.headers.get("x-twilio-signature") ?? "";
  const configuredUrl = Deno.env.get("TWILIO_CONFIRMATION_WEBHOOK_URL") ?? request.url;
  const pairs = [...new Set(params.keys())].sort().map((key) => `${key}${params.get(key) ?? ""}`).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(token), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const signature = base64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(configuredUrl + pairs)));
  return supplied === signature;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return xml("Method not allowed.", 405);
  const raw = await request.text();
  const params = new URLSearchParams(raw);
  const token = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
  if (!token || !(await validTwilioSignature(request, params, token))) return xml("Unable to verify this message.", 403);
  const from = normalizePhone(params.get("From") ?? "");
  const body = (params.get("Body") ?? "").trim().toLowerCase();
  const sid = params.get("MessageSid") ?? null;
  if (!/^(c|confirm|confirmed|yes|y)$/.test(body)) return xml("Reply C to confirm your appointment.");

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: messages } = await admin.from("appointment_sms_message").select("business_id, appointment_id, client_id")
    .eq("phone_number", from).eq("direction", "outbound").eq("status", "sent").gte("created_at", new Date(Date.now() - 72 * 3600000).toISOString()).order("created_at", { ascending: false }).limit(10);
  if (!messages?.length) return xml("We could not match that reply to an upcoming appointment. Please contact the business directly.");
  for (const message of messages) {
    const { data: appointment } = await admin.from("appointment").select("id, start_at, status, client_confirmed_at").eq("id", message.appointment_id).gt("start_at", new Date().toISOString()).maybeSingle();
    if (!appointment || ["cancelled", "canceled", "completed", "no_show", "void"].includes(appointment.status)) continue;
    if (!appointment.client_confirmed_at) await admin.from("appointment").update({ status: "confirmed", client_confirmed_at: new Date().toISOString(), client_confirmation_source: "sms" }).eq("id", appointment.id);
    const inbound = await admin.from("appointment_sms_message").insert({ business_id: message.business_id, appointment_id: appointment.id, client_id: message.client_id, direction: "inbound", message_kind: "confirmation_reply", phone_number: from, message_body: params.get("Body") ?? "", status: "received", provider_message_id: sid });
    if (inbound.error && inbound.error.code !== "23505") console.error("Confirmation reply log failed", inbound.error);
    return xml(appointment.client_confirmed_at ? "Your appointment was already confirmed. Thank you!" : "Your appointment is confirmed. Thank you!");
  }
  return xml("We could not match that reply to an upcoming appointment. Please contact the business directly.");
});
