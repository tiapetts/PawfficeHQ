import { useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import "./SupportCenter.css";

type SupportCategory = "bug" | "support" | "feature";

export default function SupportCenter() {
  const [category, setCategory] = useState<SupportCategory>("bug");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Prevent rapid duplicate submissions.
  const submittingRef = useRef(false);

  function handleScreenshots(files: FileList | null) {
    if (!files || submittingRef.current) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    const incoming = Array.from(files);

    const validFiles = incoming.filter(
      (file) =>
        allowedTypes.includes(file.type) && file.size <= 5 * 1024 * 1024,
    );

    if (validFiles.length !== incoming.length) {
      setUploadError("Only PNG, JPG, or WebP images up to 5 MB are allowed.");
    } else {
      setUploadError("");
    }

    setScreenshots((current) => {
      const available = 3 - current.length;

      if (validFiles.length > available) {
        setUploadError("You can attach a maximum of 3 screenshots.");
      }

      return [...current, ...validFiles.slice(0, available)];
    });
  }

  async function handleSubmit() {
    if (submittingRef.current) return;

    setSubmitError("");
    setSubmitSuccess("");

    const cleanSubject = subject.trim();
    const cleanDescription = description.trim();

    if (cleanSubject.length < 3) {
      setSubmitError("Please enter a subject of at least 3 characters.");
      return;
    }

    if (cleanDescription.length < 10) {
      setSubmitError("Please describe your request in at least 10 characters.");
      return;
    }

    if (screenshots.length > 3) {
      setSubmitError("You can attach a maximum of 3 screenshots.");
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const formData = new FormData();

      formData.append("category", category);
      formData.append("subject", cleanSubject);
      formData.append("message", cleanDescription);

      for (const screenshot of screenshots) {
        formData.append("screenshots", screenshot);
      }

      const { data, error } = await supabase.functions.invoke(
        "submit-authenticated-support",
        {
          body: formData,
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );

      if (error) {
        let message = "We couldn't submit your request. Please try again.";

        // Read the Edge Function's actual error response when available.
        if ("context" in error && error.context instanceof Response) {
          try {
            const responseBody = await error.context.clone().json();

            if (typeof responseBody?.error === "string") {
              message = responseBody.error;
            }
          } catch {
            // Keep the friendly fallback message.
          }
        }

        throw new Error(message);
      }

      if (!data?.success || !data?.ticket_id) {
        throw new Error(
          "We couldn't confirm your request was received. Please contact support before submitting it again.",
        );
      }

      setSubmitSuccess(
        `Your support request was submitted successfully! Ticket ID: ${data.ticket_id}`,
      );

      setCategory("bug");
      setSubject("");
      setDescription("");
      setScreenshots([]);
      setUploadError("");
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <main className="support-center">
      <section className="support-card">
        <p className="support-eyebrow">PawfficeHQ Support Center</p>

        <h2 className="support-title">🐾 How can we help?</h2>

        <p className="support-intro">
          Having trouble with PawfficeHQ? We're here to help. Tell us what's
          happening, and we'll look into it.
        </p>

        <div className="support-form">
          <div className="support-field">
            <label htmlFor="support-category">
              What do you need help with?
            </label>

            <select
              id="support-category"
              value={category}
              disabled={submitting}
              onChange={(event) =>
                setCategory(event.target.value as SupportCategory)
              }
            >
              <option value="bug">🐛 Report a Bug</option>
              <option value="support">💬 Request Support</option>
              <option value="feature">💡 Suggest a Feature</option>
            </select>
          </div>

          <div className="support-field">
            <label htmlFor="support-subject">Subject</label>

            <input
              id="support-subject"
              type="text"
              value={subject}
              maxLength={150}
              disabled={submitting}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Briefly describe your issue"
            />
          </div>

          <div className="support-field">
            <label htmlFor="support-description">Tell us more</label>

            <textarea
              id="support-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What happened? What were you trying to do?"
              rows={6}
              maxLength={5000}
              disabled={submitting}
            />
          </div>

          <div className="support-field">
            <label htmlFor="support-screenshots">
              📸 Attach Screenshots (Optional)
            </label>

            <div className="support-upload">
              <strong>Show us what happened</strong>

              <p className="support-upload-hint">
                Screenshots help us investigate problems faster.
              </p>

              <input
                id="support-screenshots"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                disabled={submitting}
                onChange={(event) => {
                  handleScreenshots(event.target.files);
                  event.target.value = "";
                }}
              />

              <p className="support-upload-hint">
                Up to 3 screenshots · PNG, JPG, WebP · 5 MB each
              </p>

              {uploadError && (
                <p role="alert" style={{ color: "#a33a3a" }}>
                  {uploadError}
                </p>
              )}

              {screenshots.length > 0 && (
                <div className="support-file-list">
                  {screenshots.map((file, index) => (
                    <div className="support-file" key={`${file.name}-${index}`}>
                      <span className="support-file-name">📷 {file.name}</span>

                      <button
                        type="button"
                        className="support-remove"
                        disabled={submitting}
                        onClick={() =>
                          setScreenshots((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <p className="support-privacy">
            🔒 Please don't include passwords, payment card numbers, or other
            sensitive information.
          </p>

          {submitError && (
            <p role="alert" style={{ color: "#a33a3a" }}>
              {submitError}
            </p>
          )}

          {submitSuccess && (
            <p
              role="status"
              style={{ color: "#267348", overflowWrap: "anywhere" }}
            >
              ✅ {submitSuccess}
            </p>
          )}

          <button
            type="button"
            className="support-submit"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Submitting Request..." : "Submit Request"}
          </button>
        </div>
      </section>
    </main>
  );
}
