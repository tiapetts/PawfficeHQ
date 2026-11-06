import {
  messagingAdmin,
  messagingNumber,
  twiml,
  validateMessagingWebhook,
} from "../_shared/messaging.ts";
import { shouldAdvanceStatus } from "../_shared/sms.ts";
Deno.serve(async (request) => {
  if (request.method !== "POST") return twiml(undefined, 405);
  const params = new URLSearchParams(await request.text());
  try {
    const number = await messagingNumber(params.get("From") ?? "");
    const base = Deno.env.get("TWILIO_MESSAGE_STATUS_WEBHOOK_URL");
    const token = number ? Deno.env.get(number.auth_token_secret) : null;
    if (!number || !token || !base) return twiml(undefined, 503);
    const url = new URL(base);
    url.search = new URL(request.url).search;
    if (
      params.get("AccountSid") !== number.account_sid ||
      !validateMessagingWebhook(request, params, token, url.toString())
    ) return twiml(undefined, 403);
    const messageId = url.searchParams.get("message_id");
    const sid = params.get("MessageSid");
    const next = params.get("MessageStatus") ?? "";
    if (!messageId || !sid) return twiml(undefined, 400);
    const admin = messagingAdmin();
    const { data: message, error } = await admin.from("client_message").select(
      "id,status,provider_message_id,conversation_id",
    ).eq("id", messageId).eq("business_id", number.business_id).eq(
      "direction",
      "outbound",
    ).maybeSingle();
    if (error) throw error;
    if (
      !message ||
      (message.provider_message_id && message.provider_message_id !== sid)
    ) return twiml(undefined, 404);
    const { data: thread, error: threadError } = await admin.from(
      "client_conversation",
    ).select("phone_number").eq("id", message.conversation_id).single();
    if (threadError) throw threadError;
    if (thread.phone_number !== params.get("To")) return twiml(undefined, 403);
    if (shouldAdvanceStatus(message.status, next)) {
      const { error: updateError } = await admin.from("client_message").update({
        status: next,
        provider_message_id: sid,
        error_message: ["failed", "undelivered"].includes(next)
          ? `Twilio delivery error ${params.get("ErrorCode") ?? "unknown"}.`
          : null,
      }).eq("id", message.id).eq("status", message.status);
      if (updateError) throw updateError;
    }
    return twiml();
  } catch {
    return twiml(undefined, 503);
  }
});
