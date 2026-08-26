import { admin, authenticatedBusiness, cors, json } from "../_shared/subscription.ts";

const version = "2026-08-19";
const safeReturn = (value: string) => {
  const url = new URL(value);
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1" && !url.hostname.endsWith("pawfficehq.com")) {
    throw new Error("Invalid return URL.");
  }
  return url;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { invoiceId, returnUrl } = await request.json();
    if (!invoiceId || !returnUrl) throw new Error("Invoice and return URL are required.");

    const invoiceResult = await admin.from("invoice")
      .select("id,business_id,invoice_number,status,currency,total,client_id")
      .eq("id", invoiceId).maybeSingle();
    const invoice = invoiceResult.data;
    if (invoiceResult.error || !invoice) throw new Error("Invoice was not found.");
    const user = await authenticatedBusiness(request, invoice.business_id);
    if (!["open", "partially_paid", "overdue"].includes(invoice.status)) {
      throw new Error("This invoice is not available for payment.");
    }

    const [paymentsResult, refundsResult, connectionResult, clientResult] = await Promise.all([
      admin.from("payment").select("id,amount,status").eq("invoice_id", invoiceId),
      admin.from("refund").select("payment_id,amount,status").eq("business_id", invoice.business_id),
      admin.from("square_connection").select("access_token,location_id,environment,status").eq("business_id", invoice.business_id).maybeSingle(),
      admin.from("CLIENT").select("EmailAddress,PhoneNumber").eq("id", invoice.client_id).maybeSingle(),
    ]);
    if (paymentsResult.error || refundsResult.error) throw new Error("Invoice balance could not be calculated.");
    const connection = connectionResult.data;
    if (!connection || connection.status !== "connected" || !connection.location_id) {
      throw new Error("Connect Square in Settings before taking a Square payment.");
    }

    const successfulPayments = (paymentsResult.data ?? []).filter((payment) => ["succeeded", "completed", "paid"].includes(payment.status));
    const paymentIds = new Set(successfulPayments.map((payment) => payment.id));
    const paid = successfulPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const refunded = (refundsResult.data ?? []).filter((refund) => refund.status === "succeeded" && paymentIds.has(refund.payment_id)).reduce((sum, refund) => sum + Number(refund.amount), 0);
    const balance = Math.round((Number(invoice.total) - paid + refunded) * 100) / 100;
    if (balance <= 0) throw new Error("This invoice has already been paid.");

    const checkoutId = crypto.randomUUID();
    const destination = safeReturn(returnUrl);
    destination.searchParams.set("square_payment", checkoutId);
    const base = connection.environment === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";
    const response = await fetch(`${base}/v2/online-checkout/payment-links`, {
      method: "POST",
      headers: { Authorization: `Bearer ${connection.access_token}`, "Square-Version": version, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: checkoutId,
        description: `Pawffice HQ invoice ${invoice.invoice_number}`,
        quick_pay: { name: `Invoice ${invoice.invoice_number}`, price_money: { amount: Math.round(balance * 100), currency: String(invoice.currency || "USD").toUpperCase() }, location_id: connection.location_id },
        checkout_options: { redirect_url: destination.toString(), allow_tipping: true },
        pre_populated_data: { buyer_email: clientResult.data?.EmailAddress || undefined, buyer_phone_number: clientResult.data?.PhoneNumber || undefined },
        payment_note: `Pawffice HQ invoice ${invoice.id}`,
      }),
    });
    const square = await response.json();
    if (!response.ok || square.errors) throw new Error(square.errors?.[0]?.detail ?? "Square checkout could not be created.");
    const link = square.payment_link;
    const saved = await admin.from("square_checkout").insert({ id: checkoutId, business_id: invoice.business_id, invoice_id: invoice.id, square_order_id: link.order_id, square_payment_link_id: link.id, amount: balance, currency: String(invoice.currency || "USD").toUpperCase(), created_by: user.id });
    if (saved.error) throw saved.error;
    return json({ url: link.url });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to start Square checkout." }, 400);
  }
});

