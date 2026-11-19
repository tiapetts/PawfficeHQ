import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import "./SmsOnboardingAdmin.css";

type ReviewStatus =
  | "submitted"
  | "under_review"
  | "registration_pending"
  | "rejected";
type Request = {
  business_id: string;
  status: string;
  legal_business_name: string;
  contact_name: string;
  contact_email: string;
  business_address: string;
  website_url: string | null;
  use_case_description: string;
  consent_description: string;
  submitted_at: string | null;
};
const labels: Record<ReviewStatus, string> = {
  submitted: "Request received",
  under_review: "Under review",
  registration_pending: "Registration pending",
  rejected: "Needs attention",
};
export default function SmsOnboardingAdmin() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<Record<string, {outcome:string; checks:Record<string,boolean>}>>({});
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from("business_sms_onboarding")
      .select(
        "business_id,status,legal_business_name,contact_name,contact_email,business_address,website_url,use_case_description,consent_description,submitted_at",
      )
      .order("submitted_at", { ascending: false });
    if (loadError) setError(loadError.message);
    else {
      setError("");
      setRequests((data ?? []) as Request[]);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function review(businessId: string, status: ReviewStatus) {
    setSaving(businessId);
    setError("");
    setNotice("");
    const { error: reviewError } = await supabase.rpc("review_sms_onboarding", {
      p_business_id: businessId,
      p_status: status,
    });
    if (reviewError) setError(reviewError.message);
    else {
      setNotice(`Review status changed to ${labels[status]}.`);
      await load();
    }
    setSaving(null);
  }
  async function dryRun(businessId: string) {
    setSaving(businessId);
    setError("");
    setNotice("");
    const { data, error: previewError } = await supabase.rpc("preview_sms_provisioning", { p_business_id: businessId });
    if (previewError) setError(previewError.message);
    else if (data) {
      setPreview((current) => ({ ...current, [businessId]: data as {outcome:string; checks:Record<string,boolean>} }));
      setNotice("Dry run complete. No Twilio calls or purchases were made.");
    }
    setSaving(null);
  }
  return (
    <section
      className="dashboard-panel sms-admin"
      aria-labelledby="sms-admin-title"
    >
      <div className="sms-admin__heading">
        <div>
          <p className="eyebrow">Communications</p>
          <h2 id="sms-admin-title">SMS onboarding requests</h2>
          <p>
            Review registration information before beginning carrier
            registration. No number is purchased or activated here.
          </p>
        </div>
        <button
          type="button"
          className="sms-admin__refresh"
          onClick={() => void load()}
          disabled={loading}
        >
          Refresh
        </button>
      </div>
      {error && (
        <p role="alert" className="sms-admin__error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="sms-admin__notice">
          {notice}
        </p>
      )}
      {loading ? (
        <p>Loading SMS requests…</p>
      ) : requests.length === 0 ? (
        <p>No SMS onboarding requests yet.</p>
      ) : (
        <div className="sms-admin__list">
          {requests.map((item) => (
            <article key={item.business_id} className="sms-admin__request">
              <div className="sms-admin__request-heading">
                <div>
                  <h3>{item.legal_business_name}</h3>
                  <small>
                    {item.submitted_at
                      ? new Date(item.submitted_at).toLocaleString()
                      : "Submission date unavailable"}
                  </small>
                </div>
                <span className="sms-admin__badge">
                  {labels[item.status as ReviewStatus] ?? item.status}
                </span>
              </div>
              <div className="sms-admin__details">
                <div>
                  <strong>Contact</strong>
                  <p>{item.contact_name}</p>
                  <p>{item.contact_email}</p>
                </div>
                <div>
                  <strong>Business address</strong>
                  <p>{item.business_address}</p>
                  {item.website_url && <p>{item.website_url}</p>}
                </div>
                <div>
                  <strong>Messaging use</strong>
                  <p>{item.use_case_description}</p>
                </div>
                <div>
                  <strong>Client consent</strong>
                  <p>{item.consent_description}</p>
                </div>
              </div>
              <div className="sms-admin__actions">
                <span>Review status</span>
                {(
                  [
                    "under_review",
                    "registration_pending",
                    "rejected",
                  ] as ReviewStatus[]
                ).map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={
                      saving === item.business_id ||
                      item.status === "approved" ||
                      item.status === status
                    }
                    onClick={() => void review(item.business_id, status)}
                  >
                    {labels[status]}
                  </button>
                ))}
              </div>
              <div className="sms-admin__actions" style={{ marginTop: 12 }}>
                <span>Provisioning preview</span>
                <button type="button" disabled={saving === item.business_id}
                  onClick={() => void dryRun(item.business_id)}>
                  {saving === item.business_id ? "Checking…" : "Run safe dry-run"}
                </button>
              </div>
              {preview[item.business_id] && (
                <div role="status" style={{ padding: 14, marginTop: 10, border: "1px solid #b9d6dc", borderRadius: 8 }}>
                  <strong>{preview[item.business_id].outcome === "ready_for_registration" ? "Ready for registration review" : "Blocked — prerequisites missing"}</strong>
                  <p>No Twilio API call, phone-number purchase, or activation was performed.</p>
                  <ul>
                    {Object.entries(preview[item.business_id].checks).map(([key, passed]) => (
                      <li key={key}>{passed ? "✓" : "✗"} {key.replace(/_/g, " ")}</li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
