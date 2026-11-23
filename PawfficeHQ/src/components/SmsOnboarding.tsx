import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import "./SmsOnboarding.css";

type Status =
  | "not_started"
  | "submitted"
  | "under_review"
  | "registration_pending"
  | "approved"
  | "rejected";
type RequestFields = {
  legal_business_name: string;
  contact_name: string;
  contact_email: string;
  business_address: string;
  website_url: string;
  use_case_description: string;
  consent_description: string;
};
const blank: RequestFields = {
  legal_business_name: "",
  contact_name: "",
  contact_email: "",
  business_address: "",
  website_url: "",
  use_case_description: "Appointment reminders and two-way client messages",
  consent_description: "",
};
const labels: Record<Status, string> = {
  not_started: "Not activated",
  submitted: "Request received",
  under_review: "Under review",
  registration_pending: "Registration pending",
  approved: "Approved for setup",
  rejected: "Needs attention",
};

export default function SmsOnboarding({
  businessId,
  readOnly = false,
}: {
  businessId: string;
  readOnly?: boolean;
}) {
  const [status, setStatus] = useState<Status>("not_started");
  const [assignedNumber, setAssignedNumber] = useState<string | null>(null);
  const [jobState, setJobState] = useState<string | null>(null);
  const [fields, setFields] = useState<RequestFields>(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;

    const timeoutId = window.setTimeout(() => {
      if (!active) return;

      setLoading(true);
      setError("");
      setSuccess("");
      setFields(blank);
      setStatus("not_started");
      setAssignedNumber(null);
      setJobState(null);

      async function load() {
        const [request, number, job] = await Promise.all([
          supabase
            .from("business_sms_onboarding")
            .select("status")
            .eq("business_id", businessId)
            .maybeSingle(),
          Promise.resolve({ data: null as { phone_number: string } | null, error: null }),
          supabase.from("sms_onboarding_job").select("state").eq("business_id", businessId).maybeSingle(),
        ]);

        if (!active) return;

        if (request.error) {
          setError(request.error.message);
        } else {
          setStatus(
            (request.data?.status as Status | undefined) ?? "not_started",
          );
        }

        if (number.error) setError((prev) => prev || number.error.message);
        setAssignedNumber(number.data?.phone_number ?? null);
        if (!job.error) setJobState(job.data?.state ?? null);
        setLoading(false);
      }

      void load();
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [businessId]);

  async function submit() {
    if (readOnly || saving || status !== "not_started") return;
    setSaving(true);
    setError("");
    setSuccess("");
    const { error: insertError } = await supabase
      .from("business_sms_onboarding")
      .insert({
        business_id: businessId,
        status: "submitted",
        ...fields,
        submitted_at: new Date().toISOString(),
      });
    if (insertError)
      setError(
        insertError.code === "23505"
          ? "A request already exists for this business. Refresh the page."
          : insertError.message,
      );
    else {
      setStatus("submitted");
      setSuccess(
        "Request submitted. Setup is queued automatically; messaging will activate after required carrier approval.",
      );
    }
    setSaving(false);
  }

  return (
    <section className="sms-setup" aria-labelledby="sms-onboarding-title">
      <div className="sms-setup__header">
        <div className="sms-setup__icon" aria-hidden="true">
          ✉
        </div>
        <div className="sms-setup__heading">
          <p className="sms-setup__eyebrow">COMMUNICATIONS</p>
          <h3 id="sms-onboarding-title">Business Text Messaging</h3>
          <p>
            Give your business a dedicated texting number for client
            conversations and appointment reminders.
          </p>
        </div>
        <span
          className={`sms-setup__status sms-setup__status--${assignedNumber ? "approved" : status}`}
        >
          <span className="sms-setup__dot" aria-hidden="true" />
          {loading
            ? "Checking setup"
            : assignedNumber
              ? "Number assigned"
              : labels[status]}
        </span>
      </div>
      {loading ? (
        <p className="sms-setup__notice">Checking messaging setup…</p>
      ) : (
        <div className="sms-setup__body">
          {assignedNumber && (
            <p className="sms-setup__notice">
              <strong>Business number:</strong> {assignedNumber}
            </p>
          )}
          {error && (
            <p className="sms-setup__error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="sms-setup__success" role="status">
              {success}
            </p>
          )}
          {status === "not_started" && !assignedNumber ? (
            <div className="sms-setup__form">
              <div className="sms-setup__intro">
                <h4>Request your business number</h4>
                <p>
                  Tell us about your business and how clients consent to texts.
                  Submitting a request does not purchase a number or activate
                  messaging.
                </p>
              </div>
              <div className="sms-setup__grid">
                {(
                  [
                    ["legal_business_name", "Legal business name"],
                    ["contact_name", "Contact name"],
                    ["contact_email", "Contact email"],
                    [
                      "business_address",
                      "Business street address, city, state, ZIP",
                    ],
                    ["website_url", "Business website (optional)"],
                    ["use_case_description", "How will you use texting?"],
                    [
                      "consent_description",
                      "How do clients agree to receive texts?",
                    ],
                  ] as [keyof RequestFields, string][]
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className={`sms-setup__field ${["business_address", "use_case_description", "consent_description"].includes(key) ? "sms-setup__field--wide" : ""}`}
                  >
                    <span>{label}</span>
                    {key === "use_case_description" ||
                    key === "consent_description" ? (
                      <textarea
                        value={fields[key]}
                        required
                        disabled={readOnly || saving}
                        onChange={(event) =>
                          setFields((prev) => ({
                            ...prev,
                            [key]: event.target.value,
                          }))
                        }
                        rows={3}
                      />
                    ) : (
                      <input
                        type={
                          key === "contact_email"
                            ? "email"
                            : key === "website_url"
                              ? "url"
                              : "text"
                        }
                        value={fields[key]}
                        required={key !== "website_url"}
                        disabled={readOnly || saving}
                        onChange={(event) =>
                          setFields((prev) => ({
                            ...prev,
                            [key]: event.target.value,
                          }))
                        }
                      />
                    )}
                  </label>
                ))}
              </div>
              <div className="sms-setup__footer">
                <p>
                  SMS activation is subject to business verification and carrier
                  approval.
                </p>
                <button
                  className="primary-button sms-setup__submit"
                  type="button"
                  onClick={() => void submit()}
                  disabled={readOnly || saving}
                >
                  {saving ? "Submitting…" : "Request SMS setup"}
                </button>
              </div>
            </div>
          ) : !assignedNumber ? (
            <div className="sms-setup__notice">
              <strong>{jobState === "action_required" || jobState === "failed" ? "Setup needs attention." : "Setup in progress."}</strong> {jobState === "awaiting_carrier" ? "Waiting for carrier approval." : jobState === "action_required" || jobState === "failed" ? "Please contact support for assistance." : "We are preparing your business texting service. Number assignment and messaging activation require carrier approval."}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
