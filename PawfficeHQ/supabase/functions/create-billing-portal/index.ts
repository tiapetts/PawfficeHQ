import { admin, authenticatedBusiness, cors, json, stripe } from "../_shared/subscription.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { businessId, returnUrl } = await request.json();
    await authenticatedBusiness(request, businessId);
    const { data } = await admin.from("business_subscription").select("stripe_customer_id").eq("business_id", businessId).single();
    if (!data?.stripe_customer_id) return json({ error: "No billing account exists yet." }, 400);
    const session = await stripe.billingPortal.sessions.create({ customer: data.stripe_customer_id, return_url: returnUrl });
    return json({ url: session.url });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to open billing." }, 400);
  }
});

