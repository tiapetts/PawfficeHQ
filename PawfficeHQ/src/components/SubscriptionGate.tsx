import { useState } from "react";
import { supabase } from "../lib/supabase";
import "./SubscriptionGate.css";

export type SubscriptionAccess = {
  plan: "basic" | "pro";
  status: string;
  trial_end: string | null;
  current_period_end: string | null;
  grace_period_end: string | null;
  cancel_at_period_end: boolean;
  sms_used: number;
  sms_limit: number;
  has_access: boolean;
  is_complimentary: boolean;
  access_override_expires_at: string | null;
  access_override_reason: string | null;
};

type Props = { businessId: string; access: SubscriptionAccess; onRefresh: () => void };

export default function SubscriptionGate({ businessId, access, onRefresh }: Props) {
  const [loading, setLoading] = useState<"basic" | "pro" | "portal" | null>(null);
  const [message, setMessage] = useState("");

  async function invokeBillingFunction(name: string, body: Record<string, unknown>) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (sessionError || !accessToken) throw new Error("Your session expired. Please sign in again.");

    const { data, error } = await supabase.functions.invoke(name, {
      body,
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (error) {
      let detail = error.message;
      if ("context" in error && error.context instanceof Response) {
        try {
          const payload = await error.context.clone().json();
          detail = payload.error ?? payload.message ?? detail;
        } catch {
          // Keep the Functions client message when the response is not JSON.
        }
      }
      throw new Error(detail);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function openCheckout(plan: "basic" | "pro") {
    setLoading(plan);
    setMessage("");
    try {
      const data = await invokeBillingFunction("create-subscription-checkout", { businessId, plan, returnUrl: window.location.origin });
      if (!data?.url) throw new Error("Unable to start checkout.");
      window.location.assign(data.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start checkout.");
      setLoading(null);
    }
  }

  async function openPortal() {
    setLoading("portal");
    setMessage("");
    try {
      const data = await invokeBillingFunction("create-billing-portal", { businessId, returnUrl: window.location.origin });
      if (!data?.url) throw new Error("Unable to open billing.");
      window.location.assign(data.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to open billing.");
      setLoading(null);
    }
  }

  return (
    <main className="subscription-page">
      <section className="subscription-panel">
        <span className="subscription-kicker">Pawffice HQ membership</span>
        <h1>{access.status === "suspended" ? "Business access is suspended" : access.status === "past_due" ? "Your payment needs attention" : "Choose your plan"}</h1>
        <p>{access.status === "suspended" ? "Your records remain safe. Contact Pawffice HQ support to restore access." : "Your business data is safe. Select a plan or update billing to restore access."}</p>
        <div className="plan-grid">
          <article className="plan-card">
            <h2>Basic</h2><p className="plan-price"><strong>$39</strong> / month</p>
            <ul><li>2 staff accounts</li><li>Up to 100 clients</li><li>250 SMS segments monthly</li><li>Calendar, records, payments and refunds</li></ul>
            <button disabled={loading !== null} onClick={() => void openCheckout("basic")}>{loading === "basic" ? "Opening…" : "Choose Basic"}</button>
          </article>
          <article className="plan-card featured">
            <span className="plan-badge">Best for growing teams</span><h2>Pro</h2>
            <p className="plan-price"><strong>$79</strong> / month</p>
            <ul><li>10 staff accounts</li><li>Unlimited clients</li><li>1,000 SMS segments monthly</li><li>Campaigns, automation and advanced reporting</li></ul>
            <button disabled={loading !== null} onClick={() => void openCheckout("pro")}>{loading === "pro" ? "Opening…" : "Choose Pro"}</button>
          </article>
        </div>
        {access.status === "past_due" && <button className="billing-link" disabled={loading !== null} onClick={() => void openPortal()}>{loading === "portal" ? "Opening…" : "Update payment method"}</button>}
        <button className="refresh-link" type="button" onClick={onRefresh}>I already updated billing</button>
        {message && <p className="subscription-error" role="alert">{message}</p>}
        <button className="signout-link" type="button" onClick={() => void supabase.auth.signOut()}>Sign out</button>
      </section>
    </main>
  );
}
