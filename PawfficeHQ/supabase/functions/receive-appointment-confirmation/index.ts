import {
  messagingAdmin,
  messagingNumber,
  twiml,
  validateMessagingWebhook,
} from "../_shared/messaging.ts";
import { isConfirmation, isOptOut, normalizeSmsPhone } from "../_shared/sms.ts";

// Keep the existing webhook URL, but store every reply in the business inbox.
Deno.serve(async (request) => {
  if (request.method !== "POST") return twiml(undefined, 405);
  const params = new URLSearchParams(await request.text());
  try {
    const number = await messagingNumber(params.get("To") ?? "");
    const token = number ? Deno.env.get(number.auth_token_secret) : null;
    const webhookUrl = Deno.env.get("TWILIO_CONFIRMATION_WEBHOOK_URL");
    if (!number || !token || !webhookUrl) return twiml(undefined, 503);
    if (
      params.get("AccountSid") !== number.account_sid ||
      !validateMessagingWebhook(request, params, token, webhookUrl)
    ) return twiml(undefined, 403);
    const from = normalizeSmsPhone(params.get("From") ?? "");
    const sid = params.get("MessageSid");
    const body = params.get("Body") ?? "";
    if (!from || !sid) return twiml(undefined, 400);
    const admin = messagingAdmin();
    const optedOut = isOptOut(body, params.get("OptOutType") ?? undefined);
    const { error: saveError } = await admin.rpc("record_client_inbound", {
      p_business_id: number.business_id,
      p_phone: from,
      p_body: body,
      p_sid: sid,
      p_media_count: Math.max(0, Number(params.get("NumMedia")) || 0),
      p_opt_out: optedOut,
    });
    if (saveError) throw saveError;
    // Twilio handles STOP/HELP replies; ordinary questions receive no canned response.
    if (optedOut || !isConfirmation(body)) return twiml();
    const { data: reminders, error: reminderError } = await admin.from(
      "appointment_sms_message",
    )
      .select("appointment_id").eq("business_id", number.business_id).eq(
        "phone_number",
        from,
      )
      .eq("direction", "outbound").eq("status", "sent")
      .gte("created_at", new Date(Date.now() - 72 * 3600000).toISOString());
    if (reminderError) throw reminderError;
    const ids = [
      ...new Set((reminders ?? []).map((row) => row.appointment_id)),
    ];
    if (!ids.length) return twiml();
    const { data: appointments, error: appointmentError } = await admin.from(
      "appointment",
    )
      .select("id,client_confirmed_at").eq("business_id", number.business_id)
      .in("id", ids)
      .gt("start_at", new Date().toISOString()).not(
        "status",
        "in",
        "(cancelled,canceled,completed,no_show,void)",
      );
    if (appointmentError) throw appointmentError;
    // Never guess which appointment a client means when several could match.
    if (appointments?.length !== 1) return twiml();
    const appointment = appointments[0];
    if (!appointment.client_confirmed_at) {
      const { error } = await admin.from("appointment").update({
        status: "confirmed",
        client_confirmed_at: new Date().toISOString(),
        client_confirmation_source: "sms",
      }).eq("id", appointment.id).eq("business_id", number.business_id);
      if (error) throw error;
    }
    return twiml(
      appointment.client_confirmed_at
        ? "Your appointment was already confirmed. Thank you!"
        : "Your appointment is confirmed. Thank you!",
    );
  } catch {
    // A non-2xx response allows provider retry rather than losing a client question.
    return twiml(undefined, 503);
  }
});
