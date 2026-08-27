import { useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase";

type SetPasswordProps = { onComplete: () => void; recovery?: boolean };

function SetPassword({ onComplete, recovery = false }: SetPasswordProps) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      setErrorMessage("Use at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setErrorMessage("The passwords do not match.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setErrorMessage(error.message);
      setSaving(false);
      return;
    }

    window.history.replaceState({}, document.title, window.location.pathname);
    onComplete();
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Pawffice HQ</h1>
        <h2>{recovery ? "Create a new password" : "Welcome to the team!"}</h2>
        <p>{recovery ? "Choose a new password for your Pawffice HQ account." : "Choose a password to finish setting up your staff account."}</p>
        {errorMessage && (
          <p className="error-message" role="alert">
            {errorMessage}
          </p>
        )}
        <form onSubmit={submit}>
          <label>
            New password
            <input
              type="password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              minLength={8}
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : recovery ? "Update password" : "Create password"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default SetPassword;
