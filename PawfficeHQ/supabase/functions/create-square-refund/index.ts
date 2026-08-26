import { admin, authenticatedBusiness, cors, json } from "../_shared/subscription.ts";
import { getSquareConnection, squareBaseUrl } from "../_shared/square.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { paymentId, amount, reason } = await request.json();
    const refundAmount = Number(amount);
    if (!paymentId || !Number.isFinite(refundAmount) || refundAmount <= 0) throw new Error("A valid refund amount is required.");
    const paymentResult = await admin.from("payment").select("id,business_id,invoice_id,amount,currency,provider,provider_payment_id").eq("id", paymentId).maybeSingle();
    const payment = paymentResult.data;
    if (paymentResult.error || !payment || payment.provider !== "square" || !payment.provider_payment_id) throw new Error("This is not a refundable Square payment.");
    const user = await authenticatedBusiness(request, payment.business_id);
    const refunds = await admin.from("refund").select("amount,status").eq("payment_id", payment.id);
    if (refunds.error) throw refunds.error;
    const alreadyRefunded = (refunds.data ?? []).filter((refund) => ["succeeded", "pending"].includes(refund.status)).reduce((sum, refund) => sum + Number(refund.amount), 0);
    if (refundAmount > Number(payment.amount) - alreadyRefunded + 0.001) throw new Error("The refund exceeds the remaining refundable amount.");
    const connection = await getSquareConnection(payment.business_id);
    const idempotencyKey = crypto.randomUUID();
    const response = await fetch(`${squareBaseUrl(connection.environment)}/v2/refunds`, {
      method: "POST",
      headers: { Authorization: `Bearer ${connection.accessToken}`, "Square-Version": "2026-08-19", "Content-Type": "application/json" },
      body: JSON.stringify({ idempotency_key: idempotencyKey, payment_id: payment.provider_payment_id, amount_money: { amount: Math.round(refundAmount * 100), currency: String(payment.currency ?? "usd").toUpperCase() }, reason: String(reason || "Pawffice HQ refund").slice(0, 192) }),
    });
    const body = await response.json();
    if (!response.ok || body.errors) throw new Error(body.errors?.[0]?.detail ?? "Square refund failed.");
    const squareRefund = body.refund;
    const status = squareRefund.status === "COMPLETED" ? "succeeded" : squareRefund.status === "FAILED" || squareRefund.status === "REJECTED" ? "failed" : "pending";
    const staffResult = await admin.from("STAFF").select("id").eq("business_id", payment.business_id).eq("auth_user_id", user.id).maybeSingle();
    const saved = await admin.from("refund").upsert({ business_id: payment.business_id, payment_id: payment.id, amount: refundAmount, status, reason: reason || squareRefund.reason || null, provider_refund_id: squareRefund.id, processed_by: staffResult.data?.id ?? null, refunded_at: status === "succeeded" ? squareRefund.updated_at ?? new Date().toISOString() : null }, { onConflict: "provider_refund_id" });
    if (saved.error) {
      console.error("Square completed refund but Pawffice could not save it", squareRefund.id, saved.error);
      return json({ error: "Square completed this refund, but Pawffice could not save it. Do not retry the refund; use Sync Square on the payment." }, 409);
    }
    return json({ success: true, status });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to issue Square refund." }, 400);
  }
});
