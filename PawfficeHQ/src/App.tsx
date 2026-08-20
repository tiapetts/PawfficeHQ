import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import Auth from "./components/Auth";
import BusinessSetup from "./components/BusinessSetup";
import Dashboard from "./components/Dashboard";
import PlatformAdmin from "./components/PlatformAdmin";
import SetPassword from "./components/SetPassword";
import SubscriptionGate, { type SubscriptionAccess } from "./components/SubscriptionGate";
import "./App.css";

type StaffProfile = {
  id: string;
  business_id: string;
  first_name: string;
  last_name: string;
};

function App() {
  const [needsPassword, setNeedsPassword] = useState(
    () =>
      new URLSearchParams(window.location.hash.slice(1)).get("type") ===
      "invite",
  );
  const [session, setSession] = useState<Session | null>(null);
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [adminView, setAdminView] = useState<"platform" | "business">(
    "platform",
  );
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [subscriptionAccess, setSubscriptionAccess] = useState<SubscriptionAccess | null>(null);

  async function loadStaffProfile(userId: string) {
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

  async function loadUserAccess(userId: string) {
    setLoading(true);
    setProfileError("");

    const { data: platformAdmin, error } =
      await supabase.rpc("is_platform_admin");

    if (error) {
      console.error("Platform access error:", error);
      setIsPlatformAdmin(false);
      setStaff(null);
      setProfileError(error.message);
      setProfileLoaded(true);
      setLoading(false);
      return;
    }

    if (platformAdmin === true) {
      setIsPlatformAdmin(true);
      await loadStaffProfile(userId);
      return;
    }

    setIsPlatformAdmin(false);
    await loadStaffProfile(userId);
  }

  async function loadSubscriptionAccess(businessId: string) {
    const { data, error } = await supabase.rpc("get_subscription_access", { p_business_id: businessId });
    if (error) {
      setProfileError(`Subscription check failed: ${error.message}`);
      return;
    }
    setSubscriptionAccess((data?.[0] as SubscriptionAccess | undefined) ?? null);
  }

  useEffect(() => {
    if (staff?.business_id && !isPlatformAdmin) void loadSubscriptionAccess(staff.business_id);
  }, [staff?.business_id, isPlatformAdmin]);

  useEffect(() => {
    let mounted = true;

    async function initializeApp() {
      setLoading(true);

      const {
        data: { session: refreshedSession },
        error,
      } = await supabase.auth.refreshSession();

      if (!mounted) return;

      if (error || !refreshedSession) {
        console.error("Session refresh error:", error);

        await supabase.auth.signOut({ scope: "local" });

        setSession(null);
        setStaff(null);
        setIsPlatformAdmin(false);
        setAdminView("platform");
        setProfileLoaded(false);
        setLoading(false);
        return;
      }

      setSession(refreshedSession);
      await loadUserAccess(refreshedSession.user.id);
    }

    void initializeApp();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;

      setSession(newSession);

      if (!newSession) {
        setStaff(null);
        setIsPlatformAdmin(false);
        setAdminView("platform");
        setProfileLoaded(false);
        setProfileError("");
        setLoading(false);
        return;
      }

      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        void loadUserAccess(newSession.user.id);
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

  if (needsPassword) {
    return <SetPassword onComplete={() => setNeedsPassword(false)} />;
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

  if (isPlatformAdmin && adminView === "platform") {
    return (
      <PlatformAdmin
        onOpenMyBusiness={staff ? () => setAdminView("business") : undefined}
      />
    );
  }

  if (isPlatformAdmin && adminView === "business" && staff) {
    return (
      <div>
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 100,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 24px",
            background: "#f4c95d",
            color: "#20332e",
          }}
        >
          <strong>Your business dashboard</strong>
          <button
            type="button"
            onClick={() => setAdminView("platform")}
            style={{
              border: "1px solid #20332e",
              borderRadius: 7,
              padding: "8px 14px",
              background: "white",
              color: "#20332e",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Back to Platform Admin
          </button>
        </div>
        <Dashboard
          businessId={staff.business_id}
          firstName={staff.first_name}
        />
      </div>
    );
  }

  if (profileLoaded && !staff) {
    return (
      <BusinessSetup
        user={session.user}
        onComplete={() => loadUserAccess(session.user.id)}
      />
    );
  }

  if (!staff) {
    return <p className="loading-message">Loading your profile...</p>;
  }

  if (!isPlatformAdmin && !subscriptionAccess) {
    return <p className="loading-message">Checking your Pawffice HQ membership...</p>;
  }

  if (!isPlatformAdmin && subscriptionAccess && !subscriptionAccess.has_access) {
    return <SubscriptionGate businessId={staff.business_id} access={subscriptionAccess} onRefresh={() => void loadSubscriptionAccess(staff.business_id)} />;
  }

  return (
    <Dashboard
      businessId={staff.business_id}
      firstName={staff.first_name}
      subscriptionAccess={subscriptionAccess}
      onSubscriptionRefresh={() => void loadSubscriptionAccess(staff.business_id)}
    />
  );
}

export default App;
