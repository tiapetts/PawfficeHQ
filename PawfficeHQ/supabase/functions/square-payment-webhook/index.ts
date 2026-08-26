import { admin, json } from "../_shared/subscription.ts";

const bytesEqual = (left: Uint8Array, right: Uint8Array) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
};

async function validSquareSignature(rawBody: string, signature: string | null) {
  const signatureKey = Deno.env.get("SQUARE_WEBHOOK_SIGNATURE_KEY");
  const notificationUrl = Deno.env.get("SQUARE_WEBHOOK_URL");
  if (!signatureKey || !notificationUrl || !signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signatureKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const calculated = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(notificationUrl + rawBody)));
  let provided: Uint8Array;
  try {
    provided = Uint8Array.from(atob(signature), (character) => character.charCodeAt(0));
  } catch {
    return false;
  }
  return bytesEqual(calculated, provided);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const rawBody = await request.text();
  if (!await validSquareSignature(rawBody, request.headers.get("x-square-hmacsha256-signature"))) {
    return json({ error: "Invalid Square signature." }, 403);
  }

  try {
    const event = JSON.parse(rawBody);
    if (!event.event_id) throw new Error("Square event ID is missing.");
    const seen = await admin.from("square_webhook_event").select("event_id").eq("event_id", event.event_id).maybeSingle();
    if (seen.data) return json({ received: true, duplicate: true });

    if (event.type === "oauth.authorization.revoked") {
      await admin.from("square_connection").update({ status: "revoked", access_token: null, refresh_token: null, access_token_encrypted: null, refresh_token_encrypted: null, last_token_error: "Square access was revoked by the seller.", updated_at: new Date().toISOString() }).eq("merchant_id", event.merchant_id);
      await admin.from("square_webhook_event").insert({ event_id: event.event_id, event_type: event.type, merchant_id: event.merchant_id ?? null });
      return json({ received: true, revoked: true });
    }

    if (["refund.created", "refund.updated"].includes(event.type)) {
      const squareRefund = event.data?.object?.refund;
      if (squareRefund?.id) {
        const status = squareRefund.status === "COMPLETED" ? "succeeded" : squareRefund.status === "FAILED" || squareRefund.status === "REJECTED" ? "failed" : "pending";
        const paymentResult = await admin.from("payment").select("id,business_id").eq("provider", "square").eq("provider_payment_id", squareRefund.payment_id).maybeSingle();
        if (paymentResult.data) {
          const saved = await admin.from("refund").upsert({
            business_id: paymentResult.data.business_id,
            payment_id: paymentResult.data.id,
            amount: Number(squareRefund.amount_money?.amount ?? 0) / 100,
            status,
            reason: squareRefund.reason || null,
            provider_refund_id: squareRefund.id,
            refunded_at: status === "succeeded" ? squareRefund.updated_at ?? squareRefund.created_at ?? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          }, { onConflict: "provider_refund_id" });
          if (saved.error) throw saved.error;
        }
      }
      await admin.from("square_webhook_event").insert({ event_id: event.event_id, event_type: event.type, merchant_id: event.merchant_id ?? null });
      return json({ received: true, refund: true });
    }

    if (!["payment.created", "payment.updated"].includes(event.type)) {
      await admin.from("square_webhook_event").insert({ event_id: event.event_id, event_type: event.type ?? "unknown", merchant_id: event.merchant_id ?? null });
      return json({ received: true, ignored: true });
    }

    const squarePayment = event.data?.object?.payment;
    if (!squarePayment?.id || squarePayment.status !== "COMPLETED" || !squarePayment.order_id) {
      await admin.from("square_webhook_event").insert({ event_id: event.event_id, event_type: event.type, merchant_id: event.merchant_id ?? null });
      return json({ received: true, pending: true });
    }

    const checkoutResult = await admin.from("square_checkout").select("*").eq("square_order_id", squarePayment.order_id).maybeSingle();
    const checkout = checkoutResult.data;
    if (!checkout) {
      await admin.from("square_webhook_event").insert({ event_id: event.event_id, event_type: event.type, merchant_id: event.merchant_id ?? null });
      return json({ received: true, unrelated: true });
    }
    const connection = await admin.from("square_connection").select("merchant_id").eq("business_id", checkout.business_id).maybeSingle();
    if (!connection.data || connection.data.merchant_id !== event.merchant_id) throw new Error("Square merchant does not match this checkout.");

    const tip = Number(squarePayment.tip_money?.amount ?? 0) / 100;
    const total = Number(squarePayment.total_money?.amount ?? 0) / 100;
    const invoiceAmount = Math.min(Number(checkout.amount), Math.max(0, total - tip));
    const existing = await admin.from("payment").select("id").eq("provider", "square").eq("provider_payment_id", squarePayment.id).maybeSingle();
    if (!existing.data) {
      const inserted = await admin.from("payment").insert({
        business_id: checkout.business_id,
        invoice_id: checkout.invoice_id,
        amount: invoiceAmount,
        tip_amount: tip,
        currency: String(squarePayment.total_money?.currency ?? checkout.currency).toLowerCase(),
        method: "card",
        status: "succeeded",
        provider: "square",
        provider_payment_id: squarePayment.id,
        reference_note: `Square order ${checkout.square_order_id}`,
        paid_at: squarePayment.created_at ?? new Date().toISOString(),
      });
      if (inserted.error && inserted.error.code !== "23505") throw inserted.error;
    }

    await Promise.all([
      admin.from("invoice").update({ status: "paid", paid_at: squarePayment.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", checkout.invoice_id),
      admin.from("square_checkout").update({ status: "completed", square_payment_id: squarePayment.id, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", checkout.id),
    ]);
    const logged = await admin.from("square_webhook_event").insert({ event_id: event.event_id, event_type: event.type, merchant_id: event.merchant_id ?? null });
    if (logged.error && logged.error.code !== "23505") throw logged.error;
    return json({ received: true, completed: true });
  } catch (error) {
    console.error("Square webhook error", error);
    return json({ error: error instanceof Error ? error.message : "Square webhook failed." }, 500);
  }
});
