import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  messagingAdmin,
  messagingCors,
  messagingJson,
} from "../_shared/messaging.ts";
import { normalizeSmsPhone, smsSegments } from "../_shared/sms.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: messagingCors });
  }
  if (request.method !== "POST") {
    return messagingJson({ error: "Method not allowed" }, 405);
  }
  const admin = messagingAdmin();
  const bearer = request.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(bearer)) {
    return messagingJson({ error: "Sign in to send messages." }, 401);
  }
  const { data: auth, error: authError } = await admin.auth.getUser(
    bearer.replace(/^Bearer\s+/i, ""),
  );
  if (authError || !auth.user) {
    return messagingJson({ error: "Sign in to send messages." }, 401);
  }
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: bearer } },
      auth: { persistSession: false },
    },
  );
  const input = await request.json().catch(() => null);
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    !input || !uuid.test(input.businessId) ||
    !uuid.test(input.conversationId) || !uuid.test(input.requestId) ||
    typeof input.message !== "string" || !input.message.trim() ||
    input.message.trim().length > 1600
  ) {
    return messagingJson({
      error: "Choose a conversation and enter a message of 1–1,600 characters.",
    }, 400);
  }
  const { data: authorized, error: accessError } = await userClient.rpc(
    "can_use_client_messages",
    { p_business_id: input.businessId },
  );
  if (accessError || !authorized) {
    return messagingJson({
      error: "You do not have messaging access to this business.",
    }, 403);
  }
  const body = input.message.trim();
  async function existingAttempt() {
    const { data, error } = await admin.from("client_message").select(
      "id,conversation_id,message_body,status,error_message",
    ).eq("business_id", input.businessId).eq("request_id", input.requestId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    if (
      data.conversation_id !== input.conversationId ||
      data.message_body !== body
    ) {
      return messagingJson({
        error: "This send request was already used for a different message.",
      }, 409);
    }
    return messagingJson({
      message: data,
      error: ["failed", "undelivered"].includes(data.status)
        ? data.error_message ?? "The message was not delivered."
        : undefined,
    });
  }
  try {
    const prior = await existingAttempt();
    if (prior) return prior;
    const { data: thread, error: threadError } = await admin.from(
      "client_conversation",
    ).select("id,client_id,phone_number,sms_opted_out").eq(
      "business_id",
      input.businessId,
    ).eq("id", input.conversationId).maybeSingle();
    if (threadError) throw threadError;
    if (!thread) {
      return messagingJson({ error: "Conversation not found." }, 404);
    }
    if (thread.sms_opted_out) {
      return messagingJson(
        { error: "This number has opted out of texts." },
        400,
      );
    }
    const { data: client, error: clientError } = await admin.from("CLIENT")
      .select("PhoneNumber,sms_consent,archived_at").eq(
        "business_id",
        input.businessId,
      ).eq("id", thread.client_id ?? -1).maybeSingle();
    if (clientError) throw clientError;
    if (
      !client || client.archived_at || !client.sms_consent ||
      normalizeSmsPhone(client.PhoneNumber ?? "") !== thread.phone_number
    ) {
      return messagingJson({
        error:
          "Check the client's current mobile number and recorded SMS consent in Clients before sending.",
      }, 400);
    }
    const { data: number, error: numberError } = await admin.from(
      "business_sms_number",
    ).select("phone_number,account_sid,auth_token_secret").eq(
      "business_id",
      input.businessId,
    ).maybeSingle();
    if (numberError) throw numberError;
    const token = number ? Deno.env.get(number.auth_token_secret) : null;
    const statusBase = Deno.env.get("TWILIO_MESSAGE_STATUS_WEBHOOK_URL");
    if (!number || !token || !statusBase) {
      return messagingJson({
        error:
          "Your business's Twilio connection needs to be configured before sending.",
      }, 503);
    }
    const { data: log, error: logError } = await admin.from("client_message")
      .insert({
        business_id: input.businessId,
        conversation_id: thread.id,
        direction: "outbound",
        message_body: body,
        status: "pending",
        request_id: input.requestId,
        sender_user_id: auth.user.id,
      }).select("id,status").single();
    if (logError) {
      if (logError.code === "23505") {
        return (await existingAttempt()) ??
          messagingJson({ error: "Send request is still processing." }, 409);
      }
      throw logError;
    }
    const { data: quota, error: quotaError } = await userClient.rpc(
      "consume_sms_segments",
      { p_business_id: input.businessId, p_segments: smsSegments(body) },
    );
    if (quotaError || !quota?.[0]?.allowed) {
      const error = quotaError
        ? "Unable to check SMS allowance. Try again later."
        : "Monthly SMS allowance reached. Check Billing.";
      await admin.from("client_message").update({
        status: "failed",
        error_message: error,
      }).eq("id", log.id);
      return messagingJson({
        error,
        message: { id: log.id, status: "failed" },
      });
    }
    const callbackUrl = new URL(statusBase);
    callbackUrl.searchParams.set("message_id", log.id);
    let response: Response;
    let payload: { sid?: string; message?: string; code?: number };
    try {
      response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${number.account_sid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${number.account_sid}:${token}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: thread.phone_number,
            From: number.phone_number,
            Body: body,
            StatusCallback: callbackUrl.toString(),
          }),
          signal: AbortSignal.timeout(20_000),
        },
      );
      payload = await response.json();
    } catch {
      await admin.from("client_message").update({
        status: "unknown",
        error_message:
          "Twilio has not confirmed the send. Check its message log before sending again.",
      }).eq("id", log.id).eq("status", "pending");
      return messagingJson({ message: { id: log.id, status: "unknown" } });
    }
    if (!response.ok) {
      const reason = payload.code === 21610
        ? "This number has opted out of texts."
        : "Twilio rejected the message. Check the Twilio message log.";
      await admin.from("client_message").update({
        status: "failed",
        error_message: reason,
      }).eq("id", log.id).eq("status", "pending");
      if (payload.code === 21610) {
        await admin.from("client_conversation").update({ sms_opted_out: true })
          .eq("id", thread.id);
      }
      return messagingJson({
        error: reason,
        message: { id: log.id, status: "failed" },
      });
    }
    if (!payload.sid) {
      await admin.from("client_message").update({ status: "unknown" }).eq(
        "id",
        log.id,
      ).eq("status", "pending");
      return messagingJson({ message: { id: log.id, status: "unknown" } });
    }
    const { error: saveError } = await admin.from("client_message").update({
      status: "queued",
      provider_message_id: payload.sid,
    }).eq("id", log.id).eq("status", "pending");
    if (saveError) {
      return messagingJson({ message: { id: log.id, status: "unknown" } });
    }
    return (await existingAttempt())!;
  } catch (error) {
    console.error(
      "Client message request failed",
      error instanceof Error ? error.message : "Database error",
    );
    return messagingJson({
      error:
        "Unable to complete this send request. Check its status before sending again.",
    }, 500);
  }
});
