import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (message: string, status: number) => new Response(JSON.stringify({ error: message }), { status, headers: { ...headers, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return reply("Method not allowed", 405);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const bearer = request.headers.get("Authorization");
  if (!url || !key || !anon || !bearer?.startsWith("Bearer ")) return reply("Unauthorized", 401);
  const userClient = createClient(url, anon, { global: { headers: { Authorization: bearer } }, auth: { persistSession: false } });
  const { data: { user }, error: authError } = await userClient.auth.getUser(bearer.slice(7));
  if (authError || !user) return reply("Unauthorized", 401);
  const db = createClient(url, key, { auth: { persistSession: false } });
  try {
    const form = await request.formData();
    const businessId = String(form.get("business_id") ?? "");
    const title = String(form.get("title") ?? "").trim();
    const templateId = String(form.get("template_id") ?? "") || null;
    const renewal = String(form.get("requires_renewal") ?? "true") !== "false";
    const validityDays = Number(form.get("validity_days") ?? 365);
    if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 3650) return reply("Validity must be between 1 and 3650 days", 400);
    const file = form.get("file");
    if (!/^[0-9a-f-]{36}$/i.test(businessId) || title.length < 1 || title.length > 160 || !(file instanceof File)) return reply("Invalid upload fields", 400);
    if (file.size < 8 || file.size > 10 * 1024 * 1024 || file.type !== "application/pdf") return reply("PDF required (maximum 10 MB)", 400);
    const { data: staff, error: staffError } = await db.from("STAFF").select("id,role").eq("auth_user_id", user.id).eq("business_id", businessId).eq("is_active", true).maybeSingle();
    if (staffError || !staff) return reply("Not authorized for this business", 403);
    // Restrict publishing to business managers/owners, not all staff.
    if (!["owner", "admin", "manager"].includes(String(staff.role ?? "").toLowerCase())) return reply("Manager access required", 403);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return reply("Invalid PDF header", 400);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(b => b.toString(16).padStart(2, "0")).join("");
    const path = `${businessId}/templates/${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await db.storage.from("service-agreements").upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (uploadError) return reply("Unable to store PDF", 503);
    const { data: versionId, error: publishError } = await db.rpc("publish_service_agreement", { p_business_id: businessId, p_title: title, p_path: path, p_sha256: digest, p_template_id: templateId, p_requires_renewal: renewal });
    if (publishError) {
      await db.storage.from("service-agreements").remove([path]);
      return reply("Unable to publish agreement", 500);
    }
    const { data: publishedVersion, error: versionError } = await db.from("service_agreement_version").select("template_id").eq("id",versionId).eq("business_id",businessId).single();
    if (versionError || !publishedVersion) return reply("Agreement published, but validity settings could not be loaded", 500);
    const { error: validityError } = await db.from("service_agreement_template").update({validity_days:validityDays}).eq("id",publishedVersion.template_id).eq("business_id",businessId);
    if (validityError) return reply("Agreement published, but validity settings could not be saved", 500);
    return new Response(JSON.stringify({ version_id: versionId }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
  } catch {
    return reply("Unable to process upload", 500);
  }
});
