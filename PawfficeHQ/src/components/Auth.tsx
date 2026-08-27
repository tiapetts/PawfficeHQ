import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [showEmailHelp, setShowEmailHelp] = useState(false);
  const [message, setMessage] = useState(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const recoveryError = hash.get("error_description") ?? query.get("error_description");
    return recoveryError ? `That password-reset link is invalid or expired. Request a new link below. (${recoveryError.replaceAll("+", " ")})` : "";
  });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    if (isResettingPassword) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/`,
      });
      if (error) {
        setMessage(error.message);
      } else {
        setMessage("If an account uses that email address, a secure password-reset link is on its way. Check your spam folder too.");
      }
    } else if (isSigningUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
          },
        },
      });

      if (error) {
        setMessage(error.message);
      } else {
        setMessage(
          "Account created! Check your email to confirm your account.",
        );
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage(error.message);
      }
    }

    setLoading(false);
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Pawffice HQ</h1>

        <h2>{isResettingPassword ? "Reset your password" : isSigningUp ? "Create your account" : "Welcome back"}</h2>

        <p>
          {isResettingPassword
            ? "Enter your login email and we’ll send you a secure reset link."
            : isSigningUp
            ? "Start managing your pet-care business."
            : "Sign in to your business dashboard."}
        </p>

        <form onSubmit={handleSubmit}>
          {isSigningUp && !isResettingPassword && (
            <>
              <label htmlFor="firstName">First name</label>
              <input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                autoComplete="given-name"
                required
              />

              <label htmlFor="lastName">Last name</label>
              <input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                autoComplete="family-name"
                required
              />
            </>
          )}
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />

          {!isResettingPassword && <><label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={isSigningUp ? "new-password" : "current-password"}
              minLength={8}
              required
            /></>}

          <button type="submit" disabled={loading}>
            {loading
              ? "Please wait..."
              : isResettingPassword
                ? "Send reset link"
                : isSigningUp
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        {message && <p className="auth-message">{message}</p>}

        {!isSigningUp && !isResettingPassword && <div className="auth-help-actions"><button type="button" className="text-button" onClick={()=>{setIsResettingPassword(true);setShowEmailHelp(false);setMessage("")}}>Forgot password?</button><button type="button" className="text-button" onClick={()=>{setShowEmailHelp(current=>!current);setMessage("")}}>Forgot which email you used?</button></div>}

        {showEmailHelp&&<div className="auth-help-note" role="status"><strong>Your email address is your Pawffice login.</strong><span>Search your inboxes for “Pawffice HQ,” or contact your business owner or Pawffice HQ support. For security, we cannot reveal whether an email has an account.</span></div>}

        {isResettingPassword&&<button type="button" className="text-button" onClick={()=>{setIsResettingPassword(false);setMessage("")}}>Back to sign in</button>}

        {!isResettingPassword&&<button
          type="button"
          className="text-button"
          onClick={() => {
            setIsSigningUp(!isSigningUp);
            setShowEmailHelp(false);
            setMessage("");
          }}
        >
          {isSigningUp
            ? "Already have an account? Sign in"
            : "Need an account? Sign up"}
        </button>}
      </section>
    </main>
  );
}
