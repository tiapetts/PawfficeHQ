import { useState } from "react";
import { supabase } from "../lib/supabase";
import type { SubscriptionAccess } from "./SubscriptionGate";
import "./Billing.css";

type Props = {
  businessId: string;
  access: SubscriptionAccess;
  onRefresh?: () => void;
};

type Action = "basic" | "pro" | "portal" | null;

function formatDate(value: string | null) {
  if (!value) return "Not available";
  return new Date(value).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

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

export default function Billing({ businessId, access, onRefresh }: Props) {
  const [action, setAction] = useState<Action>(null);
  const [message, setMessage] = useState("");
  const isTrial = access.status === "trialing";
  const daysLeft = access.trial_end
    ? Math.max(0, Math.ceil((new Date(access.trial_end).getTime() - Date.now()) / 86_400_000))
    : 0;

  async function startCheckout(plan: "basic" | "pro") {
    setAction(plan);
    setMessage("");
    try {
      const data = await invokeBillingFunction("create-subscription-checkout", {
        businessId,
        plan,
        returnUrl: window.location.origin,
      });
      if (!data?.url) throw new Error("Unable to start checkout.");
      window.location.assign(data.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start checkout.");
      setAction(null);
    }
  }

  async function openPortal() {
    setAction("portal");
    setMessage("");
    try {
      const data = await invokeBillingFunction("create-billing-portal", {
        businessId,
        returnUrl: window.location.origin,
      });
      if (!data?.url) throw new Error("Unable to open billing.");
      window.location.assign(data.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to open billing.");
      setAction(null);
    }
  }

  return (
    <section className="billing-page">
      <header>
        <p className="eyebrow">Membership</p>
        <h2>Billing & subscription</h2>
        <p>Review your Pawffice HQ plan and manage how you pay.</p>
      </header>

      <article className="billing-summary-card">
        <div>
          <span className={`billing-state ${isTrial ? "trial" : ""}`}>
            {isTrial ? "14-day trial" : "Active subscription"}
          </span>
          <h3>{access.plan === "pro" ? "Pro" : "Basic"}</h3>
          <p>
            {isTrial
              ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left · Trial ends ${formatDate(access.trial_end)}`
              : `Renews ${formatDate(access.current_period_end)}`}
          </p>
        </div>
        {!isTrial && (
          <button className="primary-button" disabled={action !== null} onClick={() => void openPortal()}>
            {action === "portal" ? "Opening…" : "Manage billing"}
          </button>
        )}
      </article>

      <div className="billing-details-grid">
        <article className="billing-detail-card">
          <span>SMS usage this month</span>
          <strong>{access.sms_used.toLocaleString()} / {access.sms_limit.toLocaleString()}</strong>
        </article>
        <article className="billing-detail-card">
          <span>Membership status</span>
          <strong>{isTrial ? "Trialing" : "Active"}</strong>
        </article>
      </div>

      {isTrial && (
        <section className="trial-plan-actions">
          <h3>Ready to keep Pawffice HQ?</h3>
          <p>Choose a monthly plan now. Your trial remains available until checkout is complete.</p>
          <div>
            <button disabled={action !== null} onClick={() => void startCheckout("basic")}>
              {action === "basic" ? "Opening…" : "Choose Basic · $39/month"}
            </button>
            <button disabled={action !== null} onClick={() => void startCheckout("pro")}>
              {action === "pro" ? "Opening…" : "Choose Pro · $79/month"}
            </button>
          </div>
        </section>
      )}

      {onRefresh && (
        <button className="billing-refresh" type="button" onClick={onRefresh}>
          Refresh subscription status
        </button>
      )}
      {message && <p className="billing-error" role="alert">{message}</p>}
    </section>
  );
}
