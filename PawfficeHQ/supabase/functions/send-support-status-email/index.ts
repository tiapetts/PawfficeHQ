import { createClient } from "npm:@supabase/supabase-js@2.49.4";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
Deno.serve(async (req) => {
 if (req.method === "OPTIONS") return new Response(null, { headers: cors });
 if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);
 try {
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return respond({ error: "Authentication required" }, 401);
  const userClient = createClient(url, anon);
  const { data: userResult, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userResult.user) return respond({ error: "Invalid session" }, 401);
  const admin = createClient(url, service);
  const { data: platformAdmin, error: adminError } = await admin.from("platform_admin").select("user_id").eq("user_id", userResult.user.id).maybeSingle();
  if (adminError || !platformAdmin) return respond({ error: "Platform admin access required" }, 403);
  const payload = await req.json();
  const { request_id, expected_status, status } = payload;
  const subject = String(payload.subject || "").trim(), message = String(payload.message || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(String(request_id)) || !["new","in_progress","resolved"].includes(expected_status) || !["in_progress","resolved"].includes(status) || expected_status === status || subject.length < 3 || subject.length > 200 || message.length < 5 || message.length > 10000) return respond({ error: "Invalid request" }, 400);
  const { data: ticket, error: ticketError } = await admin.from("support_request").select("id, requester_email, status").eq("id", request_id).single();
  if (ticketError || !ticket) return respond({ error: "Support request not found" }, 404);
  if (ticket.status !== expected_status) return respond({ error: "Request status changed. Refresh and retry." }, 409);
  const key = Deno.env.get("RESEND_API_KEY"), from = Deno.env.get("RESEND_FROM_EMAIL");
  if (!key || !from) return respond({ error: "Email provider is not configured" }, 503);
  const { data: log, error: logError } = await admin.from("support_status_email_log").insert({
    request_id, actor_id: userResult.user.id, from_status: expected_status, to_status: status, recipient: ticket.requester_email, subject, message_body: message, status: "pending"
  }).select("id").single();
  if (logError || !log) return respond({ error: "Could not create notification record" }, 500);
  let providerId: string | null = null;
  try {
   const result = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": log.id }, body: JSON.stringify({ from: `PawfficeHQ <${from}>`, to: [ticket.requester_email], subject, text: message }) });
   const body = await result.json().catch(() => ({}));
   if (!result.ok || !body.id) throw new Error("Email provider rejected the message");
   providerId = body.id;
  } catch (error) {
   await admin.from("support_status_email_log").update({ status: "unknown", error_message: String(error).slice(0,500) }).eq("id", log.id);
   return respond({ error: "Email was not confirmed. Check the notification log before retrying to avoid duplicates." }, 502);
  }
  await admin.from("support_status_email_log").update({ status: "sent", provider_message_id: providerId, sent_at: new Date().toISOString() }).eq("id", log.id);
  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await admin.from("support_request").update({ status, updated_at: now, resolved_at: status === "resolved" ? now : null }).eq("id", request_id).eq("status", expected_status).select("id").maybeSingle();
  if (updateError || !updated) return respond({ error: "Email accepted, but status update failed. Refresh before retrying.", email_sent: true }, 409);
  return respond({ success: true, provider_message_id: providerId });
 } catch (error) {
  console.error("Support notification error", error);
  return respond({ error: "Unable to process support notification" }, 500);
 }
});
