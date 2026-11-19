// Staging-first Twilio provisioning boundary. Intentionally NO Twilio API requests.
// This function only checks identity, platform-admin authorization, and local plan state.
// Never send Twilio credentials from the browser.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  // Hard stop even if someone accidentally deploys this function to production.
  if (Deno.env.get("SMS_PROVISIONING_MODE") !== "dry_run") {
    return respond({ error: "Provisioning is disabled." }, 503);
  }
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return respond({ error: "Server configuration missing" }, 503);
  const bearer = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(bearer)) return respond({ error: "Unauthorized" }, 401);
  const jwt = bearer.replace(/^Bearer\s+/i, "");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: auth, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !auth.user) return respond({ error: "Unauthorized" }, 401);
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: bearer } },
    auth: { persistSession: false },
  });
  const { data: isAdmin, error: adminError } = await userClient.rpc("is_platform_admin");
  if (adminError || isAdmin !== true) return respond({ error: "Forbidden" }, 403);

  const input = await req.json().catch(() => null);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!input || typeof input.businessId !== "string" || !uuid.test(input.businessId)) {
    return respond({ error: "Invalid business ID" }, 400);
  }
  if (input.action !== "inspect" && input.action !== "test_twilio") {
    return respond({ error: "Unsupported action" }, 400);
  }

  // Use user-scoped RLS rather than service role for the actual business data read.
  const { data: plan, error: planError } = await userClient
    .from("sms_subaccount_plan")
    .select("business_id,state,created_at")
    .eq("business_id", input.businessId)
    .maybeSingle();
  if (planError) return respond({ error: "Could not inspect plan" }, 500);
  if (!plan) return respond({ error: "No local plan found" }, 404);

  // Administrator-only, read-only Twilio credential check. No response body or
  // credentials from Twilio are returned to the caller.
  if (input.action === "test_twilio") {
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const keySid = Deno.env.get("TWILIO_API_KEY_SID");
    const keySecret = Deno.env.get("TWILIO_API_KEY_SECRET");
    if (!accountSid || !keySid || !keySecret) {
      return respond({ error: "Twilio credentials are not configured." }, 503);
    }
    if (!/^AC[0-9a-f]{32}$/i.test(accountSid) || !/^SK[0-9a-f]{32}$/i.test(keySid)) {
      return respond({ error: "Twilio credential format is invalid." }, 503);
    }
    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=1`,
        {
          method: "GET",
          headers: { Authorization: `Basic ${btoa(`${keySid}:${keySecret}`)}` },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) {
        return respond({
          connected: false,
          error: "Twilio authentication or permission check failed.",
          twilioStatus: response.status,
        }, 502);
      }
      return respond({
        mode: "dry_run",
        connected: true,
        message: "Read-only Twilio API check succeeded.",
        subaccountCreated: false,
        numberPurchased: false,
        messageSent: false,
      });
    } catch {
      return respond({ connected: false, error: "Could not reach the Twilio API." }, 502);
    }
  }


  return respond({
    mode: "dry_run",
    plan,
    twilioConnected: false,
    subaccountCreated: false,
    numberPurchased: false,
    registrationSubmitted: false,
    nextStep: "Implement server-only Twilio credential validation and explicit gated provisioning in a later phase.",
  });
});
