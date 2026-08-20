import { admin, authenticatedBusiness, cors, json, stripe } from "../_shared/subscription.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { businessId, plan, returnUrl } = await request.json();
    if (!businessId || !["basic", "pro"].includes(plan)) return json({ error: "Invalid plan." }, 400);
    const user = await authenticatedBusiness(request, businessId);
    const { data: subscription } = await admin.from("business_subscription").select("stripe_customer_id").eq("business_id", businessId).single();
    let customerId = subscription?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { business_id: businessId } });
      customerId = customer.id;
      await admin.from("business_subscription").update({ stripe_customer_id: customerId }).eq("business_id", businessId);
    }
    const price = plan === "pro" ? Deno.env.get("STRIPE_PRO_PRICE_ID") : Deno.env.get("STRIPE_BASIC_PRICE_ID");
    if (!price) throw new Error(`The ${plan} Stripe price is not configured.`);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      success_url: `${returnUrl}?subscription=success`,
      cancel_url: `${returnUrl}?subscription=canceled`,
      subscription_data: { metadata: { business_id: businessId, plan } },
      metadata: { business_id: businessId, plan },
      allow_promotion_codes: true,
    });
    return json({ url: session.url });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to start checkout." }, 400);
  }
});

