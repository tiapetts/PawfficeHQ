# Pawffice HQ SaaS subscriptions

## Stripe test-mode setup

1. Create two recurring monthly Stripe prices: Basic ($39) and Pro ($79).
2. Set Supabase Edge Function secrets:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_BASIC_PRICE_ID`
   - `STRIPE_PRO_PRICE_ID`
   - `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET`
3. Apply `migrations/202608190001_saas_subscriptions.sql`.
4. Deploy `create-subscription-checkout`, `create-billing-portal`, and `subscription-webhook`.
5. Deploy `subscription-webhook` without JWT verification; Stripe authenticates it with its signing secret.
6. In Stripe, add the webhook URL `https://<project-ref>.supabase.co/functions/v1/subscription-webhook` and subscribe it to:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
7. Enable the Stripe Customer Portal in test mode.

New businesses receive a 14-day Pro trial. Failed renewals receive five days to update their payment method before tenant data access is blocked. Platform administrators bypass the paywall.

Basic is limited to 100 clients, 2 staff accounts, and 250 monthly SMS segments. Pro is limited to 10 staff accounts and 1,000 monthly SMS segments, with unlimited clients. Client and staff limits are enforced in Postgres. Every SMS-sending Edge Function must call `consume_sms_segments(business_id, segment_count)` immediately before sending and stop when `allowed` is false.

Before production, repeat the product, price, portal, secret, and webhook setup in Stripe live mode.
