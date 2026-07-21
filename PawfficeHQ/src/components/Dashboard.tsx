import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type DashboardProps = {
  businessId: string;
  firstName: string;
};

type Business = {
  business_name: string;
};

export default function Dashboard({ businessId, firstName }: DashboardProps) {
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadBusiness() {
      const { data, error } = await supabase
        .from("business")
        .select("business_name")
        .eq("id", businessId)
        .single();

      if (error) {
        console.error(error);
        setErrorMessage(error.message);
      } else {
        setBusiness(data);
      }

      setLoading(false);
    }

    loadBusiness();
  }, [businessId]);

  if (loading) {
    return <p className="loading-message">Loading your dashboard...</p>;
  }

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div>
          <h1>Pawffice HQ</h1>
          <p className="business-label">
            {business?.business_name ?? "Your business"}
          </p>
        </div>

        <nav>
          <button className="nav-button active">Dashboard</button>
          <button className="nav-button">Calendar</button>
          <button className="nav-button">Clients</button>
          <button className="nav-button">Pets</button>
          <button className="nav-button">Services</button>
          <button className="nav-button">Staff</button>
          <button className="nav-button">Settings</button>
        </nav>

        <button
          className="sign-out-button"
          onClick={() => supabase.auth.signOut()}
        >
          Sign out
        </button>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h2>Welcome back, {firstName}!</h2>
          </div>

          <button className="primary-button">+ New appointment</button>
        </header>

        {errorMessage && <p className="error-message">{errorMessage}</p>}

        <section className="summary-grid">
          <article className="summary-card">
            <span>Today’s appointments</span>
            <strong>0</strong>
          </article>

          <article className="summary-card">
            <span>Pets checked in</span>
            <strong>0</strong>
          </article>

          <article className="summary-card">
            <span>Total clients</span>
            <strong>0</strong>
          </article>

          <article className="summary-card">
            <span>Vaccination alerts</span>
            <strong>0</strong>
          </article>
        </section>

        <section className="dashboard-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Schedule</p>
              <h3>Today’s appointments</h3>
            </div>
          </div>

          <div className="empty-state">
            <h3>No appointments today</h3>
            <p>Your scheduled appointments will appear here.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
