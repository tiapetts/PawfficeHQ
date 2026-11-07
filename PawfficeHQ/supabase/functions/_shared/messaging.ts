import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import twilio from "npm:twilio@5";
export const messagingAdmin = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
export const messagingCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const messagingJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...messagingCors, "Content-Type": "application/json" },
  });
export const twiml = (message?: string, status = 200) => {
  const response = new twilio.twiml.MessagingResponse();
  if (message) response.message(message);
  return new Response(response.toString(), {
    status,
    headers: { "Content-Type": "text/xml" },
  });
};
export async function messagingNumber(phone: string) {
  const { data, error } = await messagingAdmin().from("business_sms_number")
    .select("business_id,phone_number,account_sid,auth_token_secret").eq(
      "phone_number",
      phone,
    ).maybeSingle();
  if (error) throw new Error("Unable to load SMS routing.");
  return data as {
    business_id: string;
    phone_number: string;
    account_sid: string;
    auth_token_secret: string;
  } | null;
}
export function validateMessagingWebhook(
  request: Request,
  params: URLSearchParams,
  token: string,
  url: string,
): boolean {
  const values: Record<string, string> = {};
  params.forEach((value, key) => {
    values[key] = value;
  });
  return twilio.validateRequest(
    token,
    request.headers.get("x-twilio-signature") ?? "",
    url,
    values,
  );
}
