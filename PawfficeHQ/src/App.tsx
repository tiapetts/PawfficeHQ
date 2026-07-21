import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import Auth from "./components/Auth";
import BusinessSetup from "./components/BusinessSetup";
import Dashboard from "./components/Dashboard";
import "./App.css";

type StaffProfile = {
  id: string;
  business_id: string;
  first_name: string;
  last_name: string;
};

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileError, setProfileError] = useState("");

  async function loadStaffProfile(userId: string) {
    setLoading(true);
    setProfileError("");

    const { data, error } = await supabase
      .from("STAFF")
      .select("id, business_id, first_name, last_name")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Staff profile error:", error);
      setStaff(null);
      setProfileError(error.message);
      setProfileLoaded(true);
      setLoading(false);
      return;
    }

    setStaff(data);
    setProfileLoaded(true);
    setLoading(false);
  }

  useEffect(() => {
    let mounted = true;

    async function initializeApp() {
      setLoading(true);

      const {
        data: { session: refreshedSession },
        error,
      } = await supabase.auth.refreshSession();

      if (!mounted) {
        return;
      }

      if (error || !refreshedSession) {
        console.error("Session refresh error:", error);

        await supabase.auth.signOut({
          scope: "local",
        });

        setSession(null);
        setStaff(null);
        setProfileLoaded(false);
        setLoading(false);
        return;
      }

      setSession(refreshedSession);
      await loadStaffProfile(refreshedSession.user.id);
    }

    void initializeApp();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) {
        return;
      }

      setSession(newSession);

      if (!newSession) {
        setStaff(null);
        setProfileLoaded(false);
        setProfileError("");
        setLoading(false);
        return;
      }

      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        void loadStaffProfile(newSession.user.id);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <p className="loading-message">Loading Pawffice HQ...</p>;
  }

  if (!session) {
    return <Auth />;
  }

  if (profileError) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>Pawffice HQ</h1>
          <h2>We couldn’t load your profile</h2>
          <p>{profileError}</p>

          <button type="button" onClick={() => window.location.reload()}>
            Try again
          </button>

          <button
            type="button"
            className="text-button"
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        </section>
      </main>
    );
  }

  if (profileLoaded && !staff) {
    return (
      <BusinessSetup
        user={session.user}
        onComplete={() => loadStaffProfile(session.user.id)}
      />
    );
  }

  if (!staff) {
    return <p className="loading-message">Loading your profile...</p>;
  }

  return (
    <Dashboard businessId={staff.business_id} firstName={staff.first_name} />
  );
}

export default App;
