import { admin, authenticatedBusiness, cors, json } from "../_shared/subscription.ts";
import { getSquareConnection, squareBaseUrl } from "../_shared/square.ts";

const version = "2026-08-19";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { checkoutId } = await request.json();
    if (!checkoutId) throw new Error("Checkout is required.");
    const checkoutResult = await admin.from("square_checkout").select("*").eq("id", checkoutId).maybeSingle();
    const checkout = checkoutResult.data;
    if (checkoutResult.error || !checkout) throw new Error("Square checkout was not found.");
    await authenticatedBusiness(request, checkout.business_id);
    if (checkout.status === "completed") return json({ completed: true, invoiceId: checkout.invoice_id });

    const connection = await getSquareConnection(checkout.business_id);
    const base = squareBaseUrl(connection.environment);
    const orderResponse = await fetch(`${base}/v2/orders/${checkout.square_order_id}`, { headers: { Authorization: `Bearer ${connection.accessToken}`, "Square-Version": version, "Content-Type": "application/json" } });
    const orderBody = await orderResponse.json();
    if (!orderResponse.ok || orderBody.errors) throw new Error(orderBody.errors?.[0]?.detail ?? "Square payment could not be verified.");
    const paymentId = orderBody.order?.tenders?.find((tender: Record<string, unknown>) => tender.type === "CARD")?.payment_id ?? orderBody.order?.tenders?.[0]?.payment_id;
    // Square's hosted Sandbox test panel can leave the order OPEN after it
    // creates a completed tender. The Payment object is the source of truth.
    if (!paymentId) return json({ completed: false, pending: true });

    const paymentResponse = await fetch(`${base}/v2/payments/${paymentId}`, { headers: { Authorization: `Bearer ${connection.accessToken}`, "Square-Version": version, "Content-Type": "application/json" } });
    const paymentBody = await paymentResponse.json();
    const squarePayment = paymentBody.payment;
    if (!paymentResponse.ok || paymentBody.errors || squarePayment?.status !== "COMPLETED") return json({ completed: false, pending: true });
    const tip = Number(squarePayment.tip_money?.amount ?? 0) / 100;
    const total = Number(squarePayment.total_money?.amount ?? 0) / 100;
    const invoiceAmount = Math.min(Number(checkout.amount), Math.max(0, total - tip));

    const existing = await admin.from("payment").select("id").eq("provider", "square").eq("provider_payment_id", paymentId).maybeSingle();
    if (!existing.data) {
      const inserted = await admin.from("payment").insert({ business_id: checkout.business_id, invoice_id: checkout.invoice_id, amount: invoiceAmount, tip_amount: tip, currency: String(squarePayment.total_money?.currency ?? checkout.currency).toLowerCase(), method: "card", status: "succeeded", provider: "square", provider_payment_id: paymentId, reference_note: `Square order ${checkout.square_order_id}`, paid_at: squarePayment.created_at ?? new Date().toISOString() });
      if (inserted.error) throw inserted.error;
    }
    await admin.from("invoice").update({ status: "paid", paid_at: squarePayment.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", checkout.invoice_id);
    await admin.from("square_checkout").update({ status: "completed", square_payment_id: paymentId, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", checkout.id);
    return json({ completed: true, invoiceId: checkout.invoice_id });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to verify Square checkout." }, 400);
  }
});
