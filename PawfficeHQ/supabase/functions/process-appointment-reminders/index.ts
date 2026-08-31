import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const normalizePhone = (value: string) => { const digits = value.replace(/\D/g, ""); return digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : value; };
const smsSegments = (value: string) => Math.max(1, Math.ceil(value.length / 160));

type Settings = {
  business_id: string; client_sms_reminders_enabled: boolean; initial_reminder_hours: 24 | 48;
  one_hour_reminder_enabled: boolean; reminder_message_template: string;
};
type Appointment = { id: string; business_id: string; client_id: number; start_at: string; status: string };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronSecret = Deno.env.get("REMINDER_CRON_SECRET") ?? "";
  const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
  const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN")!;
  const twilioFrom = Deno.env.get("TWILIO_PHONE_NUMBER")!;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const input = await request.json().catch(() => ({}));
  const appointmentId = typeof input.appointmentId === "string" ? input.appointmentId : null;
  const manual = Boolean(appointmentId);

  if (manual) {
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(token);
    if (!userData.user) return json({ error: "Sign in to send a reminder." }, 401);
    const { data: appointment } = await admin.from("appointment").select("business_id").eq("id", appointmentId).maybeSingle();
    if (!appointment) return json({ error: "Appointment not found." }, 404);
    const { data: staff } = await admin.from("STAFF").select("id").eq("business_id", appointment.business_id).eq("auth_user_id", userData.user.id).eq("is_active", true).maybeSingle();
    if (!staff) return json({ error: "Not authorized." }, 403);
  } else if (!cronSecret || request.headers.get("x-reminder-secret") !== cronSecret) {
    return json({ error: "Not authorized." }, 401);
  }

  const now = new Date();
  let query = admin.from("appointment").select("id, business_id, client_id, start_at, status")
    .gt("start_at", now.toISOString()).not("status", "in", "(cancelled,canceled,completed,no_show,void)");
  query = manual ? query.eq("id", appointmentId!) : query.lte("start_at", new Date(now.getTime() + 49 * 3600000).toISOString());
  const { data: appointments, error: appointmentError } = await query;
  if (appointmentError) return json({ error: appointmentError.message }, 500);

  const { data: allSettings, error: settingsError } = await admin.from("business_notification_settings")
    .select("business_id, client_sms_reminders_enabled, initial_reminder_hours, one_hour_reminder_enabled, reminder_message_template");
  if (settingsError) return json({ error: settingsError.message }, 500);
  const settingsByBusiness = new Map((allSettings as Settings[] ?? []).map((row) => [row.business_id, row]));
  const results: Array<Record<string, unknown>> = [];

  for (const appointment of (appointments as Appointment[] ?? [])) {
    const settings = settingsByBusiness.get(appointment.business_id);
    if (!manual && !settings?.client_sms_reminders_enabled) continue;
    const hoursAway = (new Date(appointment.start_at).getTime() - now.getTime()) / 3600000;
    const kinds = manual ? ["manual_reminder"] : [
      ...(settings && hoursAway <= settings.initial_reminder_hours && hoursAway > 1 ? ["initial_reminder"] : []),
      ...(settings?.one_hour_reminder_enabled && hoursAway <= 1 ? ["one_hour_reminder"] : []),
    ];
    for (const kind of kinds) {
      const { data: client } = await admin.from("CLIENT").select("id, FirstName, PhoneNumber, sms_consent").eq("id", appointment.client_id).eq("business_id", appointment.business_id).maybeSingle();
      if (!client?.sms_consent || !client.PhoneNumber) { results.push({ appointmentId: appointment.id, kind, status: "skipped", reason: "Client SMS consent or phone number is missing." }); continue; }
      const { data: business } = await admin.from("business").select("business_name").eq("id", appointment.business_id).maybeSingle();
      const { data: links } = await admin.from("appointment_pet").select("pet_id").eq("appointment_id", appointment.id);
      const petIds = (links ?? []).map((link) => link.pet_id);
      const { data: pets } = petIds.length ? await admin.from("PET").select("PetName").in("id", petIds) : { data: [] };
      const { data: profile } = await admin.from("business_settings").select("time_zone").eq("business_id", appointment.business_id).maybeSingle();
      const start = new Date(appointment.start_at);
      const timeZone = profile?.time_zone ?? "America/Chicago";
      const petNames = (pets ?? []).map((pet) => pet.PetName).join(" and ") || "Your pet";
      const tokens: Record<string, string> = {
        "{client_first_name}": client.FirstName, "{business_name}": business?.business_name ?? "your pet care provider",
        "{pet_names}": petNames, "{appointment_date}": start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone }),
        "{appointment_time}": start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone }),
      };
      const base = kind === "one_hour_reminder"
        ? `Reminder from {business_name}: {pet_names}'s appointment is in one hour at {appointment_time}. Reply C to confirm.`
        : settings?.reminder_message_template ?? `Hi {client_first_name}, {pet_names} has an appointment with {business_name} on {appointment_date} at {appointment_time}. Reply C to confirm.`;
      const body = Object.entries(tokens).reduce((message, [key, value]) => message.replaceAll(key, value), base);
      const phone = normalizePhone(client.PhoneNumber);
      const { data: log, error: logError } = await admin.from("appointment_sms_message").insert({ business_id: appointment.business_id, appointment_id: appointment.id, client_id: client.id, direction: "outbound", message_kind: kind, phone_number: phone, message_body: body }).select("id").maybeSingle();
      if (logError) { if (logError.code !== "23505") results.push({ appointmentId: appointment.id, kind, status: "failed", reason: logError.message }); continue; }
      const segments = smsSegments(body);
      const { data: subscription } = await admin.from("business_subscription").select("plan, sms_used, sms_period_start").eq("business_id", appointment.business_id).maybeSingle();
      const limit = subscription?.plan === "pro" ? 1000 : 250;
      const periodExpired = subscription?.sms_period_start && new Date(subscription.sms_period_start) < new Date(now.getFullYear(), now.getMonth(), 1);
      const used = periodExpired ? 0 : Number(subscription?.sms_used ?? 0);
      if (!subscription || used + segments > limit) { await admin.from("appointment_sms_message").update({ status: "failed", error_message: "Monthly SMS limit reached." }).eq("id", log!.id); continue; }
      const form = new URLSearchParams({ To: phone, From: twilioFrom, Body: body });
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, { method: "POST", headers: { Authorization: `Basic ${btoa(`${twilioSid}:${twilioToken}`)}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form });
      const payload = await response.json();
      if (!response.ok) { await admin.from("appointment_sms_message").update({ status: "failed", error_message: payload.message ?? "Twilio rejected the message." }).eq("id", log!.id); results.push({ appointmentId: appointment.id, kind, status: "failed" }); continue; }
      await Promise.all([
        admin.from("appointment_sms_message").update({ status: "sent", provider_message_id: payload.sid, sent_at: new Date().toISOString() }).eq("id", log!.id),
        admin.from("business_subscription").update({ sms_used: used + segments, ...(periodExpired ? { sms_period_start: now.toISOString().slice(0, 10) } : {}) }).eq("business_id", appointment.business_id),
      ]);
      results.push({ appointmentId: appointment.id, kind, status: "sent" });
    }
  }
  return json({ success: true, results });
});
