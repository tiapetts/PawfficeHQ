// Safe first-stage SMS onboarding processor. No Twilio API calls or purchases.
// Invoke from a trusted scheduler with Authorization: Bearer <SMS_ONBOARDING_WORKER_SECRET>.
// Set SMS_ONBOARDING_WORKER_SECRET in Supabase secrets, never in the browser.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = Deno.env.get("SMS_ONBOARDING_WORKER_SECRET");
  if (!secret || request.headers.get("Authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return new Response("Missing server configuration", { status: 503 });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: jobs, error: queueError } = await db.from("sms_onboarding_job")
    .select("business_id,attempt_count").eq("state", "queued")
    .lte("next_attempt_at", new Date().toISOString()).order("created_at").limit(10);
  if (queueError) return new Response("Queue unavailable", { status: 503 });
  const results: Array<{ business_id: string; state: string }> = [];
  for (const job of jobs ?? []) {
    // Claim only queued rows. Concurrent workers must not process the same job.
    const { data: claimed, error: claimError } = await db.from("sms_onboarding_job")
      .update({ state: "processing", locked_at: new Date().toISOString(),
        attempt_count: job.attempt_count + 1, updated_at: new Date().toISOString() })
      .eq("business_id", job.business_id).eq("state", "queued")
      .select("business_id").maybeSingle();
    if (claimError || !claimed) continue;
    const { data: application, error: appError } = await db.from("business_sms_onboarding")
      .select("status,legal_business_name,contact_name,contact_email,business_address,use_case_description,consent_description")
      .eq("business_id", job.business_id).maybeSingle();
    const complete = application && application.status === "submitted" &&
      [application.legal_business_name, application.contact_name,
       application.contact_email, application.business_address,
       application.use_case_description, application.consent_description]
        .every((value) => typeof value === "string" && value.trim().length > 0);
    // Never claim carrier approval or allocate a number in this stage.
    const state = appError || !complete ? "action_required" : "awaiting_carrier";
    const { error: updateError } = await db.from("sms_onboarding_job")
      .update({ state, locked_at: null,
        last_error: appError ? "Application lookup failed" :
          !complete ? "Incomplete SMS onboarding application" : null,
        updated_at: new Date().toISOString() })
      .eq("business_id", job.business_id).eq("state", "processing");
    if (!updateError) results.push({ business_id: job.business_id, state });
  }
  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
