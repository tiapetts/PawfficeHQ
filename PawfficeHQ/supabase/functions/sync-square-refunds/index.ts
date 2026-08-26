import { admin, authenticatedBusiness, cors, json } from "../_shared/subscription.ts";
import { getSquareConnection, squareBaseUrl } from "../_shared/square.ts";

const version = "2026-08-19";
const refundStatus = (status: string) => status === "COMPLETED" ? "succeeded" : status === "FAILED" || status === "REJECTED" ? "failed" : "pending";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { paymentId } = await request.json();
    if (!paymentId) throw new Error("Payment is required.");
    const paymentResult = await admin.from("payment").select("id,business_id,provider,provider_payment_id").eq("id", paymentId).maybeSingle();
    const payment = paymentResult.data;
    if (paymentResult.error || !payment || payment.provider !== "square" || !payment.provider_payment_id) throw new Error("This is not a Square payment.");
    await authenticatedBusiness(request, payment.business_id);

    const connection = await getSquareConnection(payment.business_id);
    const base = squareBaseUrl(connection.environment);
    const paymentResponse = await fetch(`${base}/v2/payments/${payment.provider_payment_id}`, { headers: { Authorization: `Bearer ${connection.accessToken}`, "Square-Version": version, "Content-Type": "application/json" } });
    const paymentBody = await paymentResponse.json();
    if (!paymentResponse.ok || paymentBody.errors) throw new Error(paymentBody.errors?.[0]?.detail ?? "Square payment could not be read.");

    const refundIds: string[] = paymentBody.payment?.refund_ids ?? [];
    let synced = 0;
    for (const refundId of refundIds) {
      const response = await fetch(`${base}/v2/refunds/${refundId}`, { headers: { Authorization: `Bearer ${connection.accessToken}`, "Square-Version": version, "Content-Type": "application/json" } });
      const body = await response.json();
      if (!response.ok || body.errors || !body.refund) throw new Error(body.errors?.[0]?.detail ?? "A Square refund could not be read.");
      const squareRefund = body.refund;
      const status = refundStatus(squareRefund.status);
      const saved = await admin.from("refund").upsert({
        business_id: payment.business_id,
        payment_id: payment.id,
        amount: Number(squareRefund.amount_money?.amount ?? 0) / 100,
        status,
        reason: squareRefund.reason || null,
        provider_refund_id: squareRefund.id,
        refunded_at: status === "succeeded" ? squareRefund.updated_at ?? squareRefund.created_at ?? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "provider_refund_id" });
      if (saved.error) throw saved.error;
      synced += 1;
    }
    return json({ success: true, synced });
  } catch (error) {
    console.error("Square refund synchronization failed", error);
    return json({ error: error instanceof Error ? error.message : "Unable to synchronize Square refunds." }, 400);
  }
});
