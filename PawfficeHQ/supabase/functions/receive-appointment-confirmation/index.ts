import {
  messagingAdmin,
  messagingNumber,
  twiml,
  validateMessagingWebhook,
} from "../_shared/messaging.ts";
import { isConfirmation, isOptOut, normalizeSmsPhone } from "../_shared/sms.ts";

// Keep the existing Twilio webhook URL and record all inbound replies in the inbox.
// Custom schedules allow reminders up to 30 days ahead of an appointment.
const REMINDER_LOOKBACK_DAYS = 31;
const REMINDER_KINDS = [
  "scheduled_reminder",
  "initial_reminder",
  "one_hour_reminder",
  "manual_reminder",
];

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
    ) {
      return twiml(undefined, 403);
    }

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

    // Twilio handles STOP/HELP. All other messages remain visible in the inbox.
    // Explicitly recognize YES while retaining existing confirmation keywords.
    const confirmedReply =
      /^yes[.!]?$/i.test(body.trim()) || isConfirmation(body);
    if (optedOut || !confirmedReply) return twiml();

    const now = new Date();
    const earliestReminder = new Date(
      now.getTime() - REMINDER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: reminders, error: reminderError } = await admin
      .from("appointment_sms_message")
      .select("appointment_id")
      .eq("business_id", number.business_id)
      .eq("phone_number", from)
      .eq("direction", "outbound")
      .eq("status", "sent")
      .in("message_kind", REMINDER_KINDS)
      .gte("created_at", earliestReminder);
    if (reminderError) throw reminderError;

    const ids = [
      ...new Set(
        (reminders ?? [])
          .map((row) => row.appointment_id)
          .filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          ),
      ),
    ];
    if (!ids.length) return twiml();

    const { data: appointments, error: appointmentError } = await admin
      .from("appointment")
      .select("id,client_confirmed_at")
      .eq("business_id", number.business_id)
      .in("id", ids)
      .gt("start_at", now.toISOString())
      .not("status", "in", "(cancelled,canceled,completed,no_show,void)");
    if (appointmentError) throw appointmentError;

    // Never guess which appointment the reply refers to.
    if (appointments?.length !== 1) return twiml();

    const appointment = appointments[0];
    if (appointment.client_confirmed_at) {
      return twiml("Your appointment was already confirmed. Thank you!");
    }

    const { data: updated, error: updateError } = await admin
      .from("appointment")
      .update({
        status: "confirmed",
        client_confirmed_at: new Date().toISOString(),
        client_confirmation_source: "sms",
      })
      .eq("id", appointment.id)
      .eq("business_id", number.business_id)
      .is("client_confirmed_at", null)
      .select("id");
    if (updateError) throw updateError;

    return twiml(
      updated?.length
        ? "Your appointment is confirmed. Thank you!"
        : "Your appointment was already confirmed. Thank you!",
    );
  } catch (error) {
    console.error("Appointment confirmation webhook failed:", error);
    // Non-2xx response permits Twilio to retry transient failures.
    return twiml(undefined, 503);
  }
});
