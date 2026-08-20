import { admin, json, stripe } from "../_shared/subscription.ts";

function date(value: number | null | undefined) {
  return value ? new Date(value * 1000).toISOString() : null;
}

Deno.serve(async (request) => {
  try {
    const signature = request.headers.get("stripe-signature");
    if (!signature) return json({ error: "Missing signature." }, 400);
    const event = await stripe.webhooks.constructEventAsync(
      await request.text(), signature, Deno.env.get("STRIPE_SUBSCRIPTION_WEBHOOK_SECRET") ?? "",
    );

    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const businessId = subscription.metadata.business_id;
      if (businessId) {
        const priceId = subscription.items.data[0]?.price.id;
        const plan = priceId === Deno.env.get("STRIPE_PRO_PRICE_ID") ? "pro" : "basic";
        await admin.from("business_subscription").update({
          plan,
          status: subscription.status,
          stripe_customer_id: String(subscription.customer),
          stripe_subscription_id: subscription.id,
          trial_end: date(subscription.trial_end),
          current_period_end: date(subscription.items.data[0]?.current_period_end),
          grace_period_end: subscription.status === "past_due" ? new Date(Date.now() + 5 * 86400000).toISOString() : null,
          cancel_at_period_end: subscription.cancel_at_period_end,
          updated_at: new Date().toISOString(),
        }).eq("business_id", businessId);
      }
    }

    if (event.type === "invoice.paid") {
      const invoice = event.data.object;
      await admin.from("business_subscription").update({ status: "active", grace_period_end: null, updated_at: new Date().toISOString() }).eq("stripe_customer_id", String(invoice.customer));
    }
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      await admin.from("business_subscription").update({ status: "past_due", grace_period_end: new Date(Date.now() + 5 * 86400000).toISOString(), updated_at: new Date().toISOString() }).eq("stripe_customer_id", String(invoice.customer));
    }
    return json({ received: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Invalid webhook." }, 400);
  }
});

