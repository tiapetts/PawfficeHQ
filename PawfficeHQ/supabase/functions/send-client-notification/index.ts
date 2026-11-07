import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const valueFrom = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) if (typeof row[key] === "string" && String(row[key]).trim()) return String(row[key]).trim();
  return "";
};
const phoneNumber = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits[0] === "1" ? `+${digits}` : value;
};
const html = (value: string) => value.replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]!);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("You must be signed in");
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) throw new Error("Your session is invalid");

    const input = await request.json();
    const appointmentId = String(input.appointmentId ?? "");
    const channel = String(input.channel ?? "");
    const message = String(input.message ?? "").trim();
    if (!appointmentId || !["email", "sms", "both"].includes(channel)) throw new Error("Choose a delivery method");
    if (message.length < 2 || message.length > 1000) throw new Error("Message must be between 2 and 1,000 characters");

    const { data: appointment } = await admin.from("appointment").select("id,business_id,client_id").eq("id", appointmentId).single();
    if (!appointment) throw new Error("Appointment not found");
    const { data: actor } = await admin.from("STAFF").select("is_active").eq("auth_user_id", userData.user.id).eq("business_id", appointment.business_id).single();
    if (!actor?.is_active) throw new Error("You do not have access to this appointment");

    const [{ data: client }, { data: business }, { data: settings }] = await Promise.all([
      admin.from("CLIENT").select("*").eq("id", appointment.client_id).eq("business_id", appointment.business_id).single(),
      admin.from("business").select("business_name").eq("id", appointment.business_id).single(),
      admin.from("business_settings").select("email,phone").eq("business_id", appointment.business_id).maybeSingle(),
    ]);
    if (!client) throw new Error("Client not found");
    const clientRow = client as Record<string, unknown>;
    const email = valueFrom(clientRow, ["email", "Email", "email_address", "EmailAddress"]);
    const phone = valueFrom(clientRow, ["phone", "Phone", "phone_number", "PhoneNumber"]);
    const businessName = business?.business_name ?? "Your pet-care provider";
    const subject = `${businessName}: your pet is ready for pickup`;
    const results: Array<{ channel: string; success: boolean; message: string }> = [];

    if ((channel === "sms" || channel === "both") && clientRow.sms_consent !== true && input.confirmSmsConsent !== true)
      throw new Error("Confirm the client consented to text messages before sending SMS");
    if ((channel === "sms" || channel === "both") && input.confirmSmsConsent === true && clientRow.sms_consent !== true)
      await admin.from("CLIENT").update({ sms_consent: true, sms_consent_at: new Date().toISOString() }).eq("id", appointment.client_id);

    const log = async (kind: "email" | "sms", recipient: string, success: boolean, providerId: string | null, error: string | null) => {
      await admin.from("client_message").insert({ business_id: appointment.business_id, appointment_id: appointment.id,
        client_id: appointment.client_id, channel: kind, recipient: recipient || "missing", subject: kind === "email" ? subject : null,
        message_body: message, status: success ? "sent" : "failed", provider_message_id: providerId, error_message: error,
        sent_by: userData.user.id, sent_at: success ? new Date().toISOString() : null });
    };

    if (channel === "email" || channel === "both") {
      try {
        if (!email) throw new Error("This client does not have an email address");
        const key = Deno.env.get("RESEND_API_KEY"), from = Deno.env.get("RESEND_FROM_EMAIL");
        if (!key || !from) throw new Error("Email provider is not configured");
        const response = await fetch("https://api.resend.com/emails", { method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: `${businessName} <${from}>`, to: [email], subject, text: message,
            html: `<h2>${html(businessName)}</h2><p>${html(message).replaceAll("\n", "<br>")}</p>${settings?.phone ? `<p>Questions? Call ${html(settings.phone)}</p>` : ""}`,
            reply_to: settings?.email || undefined }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message ?? "Email delivery failed");
        await log("email", email, true, payload.id ?? null, null);
        results.push({ channel: "email", success: true, message: `Email sent to ${email}` });
      } catch (error) {
        const text = error instanceof Error ? error.message : "Email failed";
        await log("email", email, false, null, text); results.push({ channel: "email", success: false, message: text });
      }
    }

    if (channel === "sms" || channel === "both") {
  try {
    if (!phone) {
      throw new Error("This client does not have a phone number");
    }

    const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const token = Deno.env.get("TWILIO_AUTH_TOKEN");
    const messagingServiceSid = Deno.env.get(
      "TWILIO_MESSAGING_SERVICE_SID",
    );

    if (!sid || !token || !messagingServiceSid) {
      throw new Error("SMS provider is not configured");
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: phoneNumber(phone),
          MessagingServiceSid: messagingServiceSid,
          Body: message,
        }),
      },
    );

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message ?? "SMS delivery failed");
    }

    await log(
      "sms",
      phoneNumber(phone),
      true,
      payload.sid ?? null,
      null,
    );

    results.push({
      channel: "sms",
      success: true,
      message: `Text sent to ${phone}`,
    });
  } catch (error) {
    const text = error instanceof Error ? error.message : "SMS failed";

    await log("sms", phone, false, null, text);

    results.push({
      channel: "sms",
      success: false,
      message: text,
    });
  }
}

    if (results.some((item) => item.success)) await admin.from("appointment").update({ status: "ready_for_pickup" }).eq("id", appointment.id);
    return Response.json({ success: results.every((item) => item.success), results }, { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Notification failed" }, { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
});

