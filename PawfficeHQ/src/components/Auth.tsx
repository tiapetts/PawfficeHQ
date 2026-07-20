import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    if (isSigningUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
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

        <h2>{isSigningUp ? "Create your account" : "Welcome back"}</h2>

        <p>
          {isSigningUp
            ? "Start managing your pet-care business."
            : "Sign in to your business dashboard."}
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={isSigningUp ? "new-password" : "current-password"}
            minLength={6}
            required
          />

          <button type="submit" disabled={loading}>
            {loading
              ? "Please wait..."
              : isSigningUp
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        {message && <p className="auth-message">{message}</p>}

        <button
          type="button"
          className="text-button"
          onClick={() => {
            setIsSigningUp(!isSigningUp);
            setMessage("");
          }}
        >
          {isSigningUp
            ? "Already have an account? Sign in"
            : "Need an account? Sign up"}
        </button>
      </section>
    </main>
  );
}
