import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import "./Auth.css";

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
    const recoveryError =
      hash.get("error_description") ?? query.get("error_description");
    return recoveryError
      ? `That password-reset link is invalid or expired. Request a new link below. (${recoveryError.replaceAll("+", " ")})`
      : "";
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
        setMessage(
          "If an account uses that email address, a secure password-reset link is on its way. Check your spam folder too.",
        );
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

  function chooseSignUp() {
    setIsSigningUp(true);
    setIsResettingPassword(false);
    setShowEmailHelp(false);
    setMessage("");
    document
      .getElementById("pawffice-auth-form")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <main className="auth-page auth-marketing-page">
      <div className="auth-shell">
        <div className="auth-hero">
          <section className="auth-story" aria-labelledby="pawffice-heading">
            <div className="auth-brand">
              <img src="/pwa-icon.png" alt="PawfficeHQ logo" />
              <strong>PawfficeHQ</strong>
            </div>
            <p className="auth-kicker">
              One home for your entire pet-care business
            </p>
            <h1 id="pawffice-heading">
              Run the business.
              <br />
              <em>Love the animals.</em>
            </h1>
            <p className="auth-lead">
              Scheduling, client records, care plans, payments, reminders, and
              clinical tools—connected in one powerful workspace built for
              people who care for pets.
            </p>
            <div
              className="auth-audience"
              aria-label="Supported pet-care businesses"
            >
              <span>✂️ Grooming</span>
              <span>🏠 Pet sitting</span>
              <span>🏨 Boarding & daycare</span>
              <span>🩺 Veterinary</span>
            </div>
            <div className="auth-proof">
              <div>
                <strong>14 days</strong>
                <span>Free to explore</span>
              </div>
              <div>
                <strong>One system</strong>
                <span>From booking to payment</span>
              </div>
              <div>
                <strong>Real support</strong>
                <span>Built with user feedback</span>
              </div>
            </div>
          </section>

          <section className="auth-card" id="pawffice-auth-form">
            <div className="auth-card-heading">
              <span>
                {isResettingPassword
                  ? "Account recovery"
                  : isSigningUp
                    ? "Start your free trial"
                    : "Welcome back"}
              </span>
              <h2>
                {isResettingPassword
                  ? "Reset your password"
                  : isSigningUp
                    ? "Create your Pawffice"
                    : "Sign in to PawfficeHQ"}
              </h2>
              <p>
                {isResettingPassword
                  ? "Enter your login email and we’ll send a secure reset link."
                  : isSigningUp
                    ? "No credit card required to create your account."
                    : "Your business dashboard is ready when you are."}
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              {isSigningUp && !isResettingPassword && (
                <div className="auth-name-fields">
                  <label htmlFor="firstName">
                    First name
                    <input
                      id="firstName"
                      type="text"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      autoComplete="given-name"
                      required
                    />
                  </label>
                  <label htmlFor="lastName">
                    Last name
                    <input
                      id="lastName"
                      type="text"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      autoComplete="family-name"
                      required
                    />
                  </label>
                </div>
              )}
              <label htmlFor="email">
                Email address
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  placeholder="you@yourbusiness.com"
                  required
                />
              </label>
              {!isResettingPassword && (
                <label htmlFor="password">
                  Password
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={
                      isSigningUp ? "new-password" : "current-password"
                    }
                    minLength={8}
                    placeholder="At least 8 characters"
                    required
                  />
                </label>
              )}
              <button className="auth-submit" type="submit" disabled={loading}>
                {loading
                  ? "Please wait..."
                  : isResettingPassword
                    ? "Send reset link"
                    : isSigningUp
                      ? "Start my free trial"
                      : "Sign in"}
              </button>
            </form>

            {isSigningUp && !isResettingPassword && (
              <p className="auth-fine-print">
                By creating an account, you agree to the{" "}
                <a href="/terms.html">Terms of Service</a> and acknowledge the{" "}
                <a href="/privacy.html">Privacy Policy</a>. Your 14-day trial
                begins when your account is created.
              </p>
            )}
            {message && (
              <p className="auth-message" role="status">
                {message}
              </p>
            )}
            {!isSigningUp && !isResettingPassword && (
              <div className="auth-help-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setIsResettingPassword(true);
                    setShowEmailHelp(false);
                    setMessage("");
                  }}
                >
                  Forgot password?
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setShowEmailHelp((current) => !current);
                    setMessage("");
                  }}
                >
                  Forgot which email?
                </button>
              </div>
            )}
            {showEmailHelp && (
              <div className="auth-help-note" role="status">
                <strong>Your email address is your Pawffice login.</strong>
                <span>
                  Search your inboxes for “Pawffice HQ,” or contact your
                  business owner or Pawffice HQ support. For security, we cannot
                  reveal whether an email has an account.
                </span>
              </div>
            )}
            {isResettingPassword && (
              <button
                type="button"
                className="text-button auth-switch"
                onClick={() => {
                  setIsResettingPassword(false);
                  setMessage("");
                }}
              >
                ← Back to sign in
              </button>
            )}
            {!isResettingPassword && (
              <button
                type="button"
                className="text-button auth-switch"
                onClick={() => {
                  setIsSigningUp(!isSigningUp);
                  setShowEmailHelp(false);
                  setMessage("");
                }}
              >
                {isSigningUp
                  ? "Already have an account? Sign in"
                  : "New to PawfficeHQ? Start free"}
              </button>
            )}
          </section>
        </div>

        <section className="auth-features" aria-labelledby="features-heading">
          <div className="auth-section-heading">
            <p className="auth-kicker">Everything works together</p>
            <h2 id="features-heading">Less juggling. More caring.</h2>
            <p>
              Choose the modules your business needs and keep every client, pet,
              appointment, message, and payment connected.
            </p>
          </div>
          <div className="auth-feature-grid">
            <article>
              <span>01</span>
              <h3>Book & communicate</h3>
              <p>
                Flexible calendars, appointment reminders, text confirmations,
                and client notifications keep everyone on the same page.
              </p>
            </article>
            <article>
              <span>02</span>
              <h3>Know every pet</h3>
              <p>
                Searchable client and pet profiles, photos, vaccination
                tracking, care instructions, and complete record histories.
              </p>
            </article>
            <article>
              <span>03</span>
              <h3>Deliver better care</h3>
              <p>
                Grooming report cards, pet-sitting visits, boarding care logs,
                and veterinary encounters with treatment plans.
              </p>
            </article>
            <article>
              <span>04</span>
              <h3>Get paid</h3>
              <p>
                Invoices, estimates, refunds, staff earnings, and support for
                Square, Stripe, cash, checks, and gift cards.
              </p>
            </article>
          </div>
        </section>

        <section className="auth-pricing" aria-labelledby="pricing-heading">
          <div className="auth-section-heading">
            <p className="auth-kicker">Straightforward pricing</p>
            <h2 id="pricing-heading">Start free. Grow when you’re ready.</h2>
            <p>
              Try PawfficeHQ for 14 days. Choose your plan when you’re ready to
              keep going.
            </p>
          </div>
          <div className="auth-price-grid">
            <article>
              <div>
                <span>Basic</span>
                <p>
                  <strong>$39</strong> / month
                </p>
                <small>For independent providers and small teams</small>
              </div>
              <ul>
                <li>2 staff accounts</li>
                <li>Up to 100 clients</li>
                <li>250 SMS segments monthly</li>
                <li>Calendar, records, invoices, payments, and refunds</li>
              </ul>
              <button type="button" onClick={chooseSignUp}>
                Start free
              </button>
            </article>
            <article className="featured">
              <div>
                <b>Best for growing teams</b>
                <span>Pro</span>
                <p>
                  <strong>$79</strong> / month
                </p>
                <small>More room, communication, and insight</small>
              </div>
              <ul>
                <li>10 staff accounts</li>
                <li>Unlimited clients</li>
                <li>1,000 SMS segments monthly</li>
                <li>Campaigns, automation, and advanced reporting</li>
              </ul>
              <button type="button" onClick={chooseSignUp}>
                Start free
              </button>
            </article>
          </div>
          <p className="auth-pricing-note">
            Specialty modules may require separate activation or approval.
          </p>
        </section>

        <footer className="auth-footer">
          <strong>
            <img src="/pwa-icon.png" alt="" />
            PawfficeHQ
          </strong>
          <span className="auth-footer-tagline">
            Built for the people behind exceptional pet care.
          </span>
          <nav aria-label="Legal and support links">
            <a href="/privacy.html">Privacy</a>
            <a href="/terms.html">Terms</a>
            <a href="/contact.html">Contact</a>
            <a href="/support.html">Support</a>
          </nav>
        </footer>
      </div>
    </main>
  );
}
