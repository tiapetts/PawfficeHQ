import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import Clients from "./Clients";
import Pets from "./Pets";

type DashboardProps = {
  businessId: string;
  firstName: string;
};

type Business = {
  business_name: string;
};

type ActivePage = "dashboard" | "clients" | "pets";

function Dashboard({ businessId, firstName }: DashboardProps) {
  const [activePage, setActivePage] = useState<ActivePage>("dashboard");
  const [business, setBusiness] = useState<Business | null>(null);
  const [clientCount, setClientCount] = useState(0);
  const [petCount, setPetCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      setErrorMessage("");

      const [businessResult, clientsResult, petsResult] = await Promise.all([
        supabase
          .from("business")
          .select("business_name")
          .eq("id", businessId)
          .single(),

        supabase
          .from("CLIENT")
          .select("*", {
            count: "exact",
            head: true,
          })
          .eq("business_id", businessId),

        supabase
          .from("PET")
          .select("*", {
            count: "exact",
            head: true,
          })
          .eq("business_id", businessId),
      ]);

      const error =
        businessResult.error || clientsResult.error || petsResult.error;

      if (error) {
        console.error(error);
        setErrorMessage(error.message);
      }

      if (businessResult.data) {
        setBusiness(businessResult.data);
      }

      setClientCount(clientsResult.count ?? 0);
      setPetCount(petsResult.count ?? 0);
      setLoading(false);
    }

    void loadDashboard();
  }, [businessId]);

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
          <button
            className={`nav-button ${
              activePage === "dashboard" ? "active" : ""
            }`}
            onClick={() => setActivePage("dashboard")}
          >
            Dashboard
          </button>

          <button className="nav-button">Calendar</button>

          <button
            className={`nav-button ${activePage === "clients" ? "active" : ""}`}
            onClick={() => setActivePage("clients")}
          >
            Clients
          </button>

          <button
            className={`nav-button ${activePage === "pets" ? "active" : ""}`}
            onClick={() => setActivePage("pets")}
          >
            Pets
          </button>

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
        {activePage === "clients" ? (
          <Clients businessId={businessId} />
        ) : activePage === "pets" ? (
          <Pets businessId={businessId} />
        ) : (
          <>
            <header className="dashboard-header">
              <div>
                <p className="eyebrow">Dashboard</p>
                <h2>Welcome back, {firstName}!</h2>
              </div>

              <button className="primary-button">+ New appointment</button>
            </header>

            {errorMessage && (
              <p className="error-message" role="alert">
                {errorMessage}
              </p>
            )}

            <section className="summary-grid">
              <article className="summary-card">
                <span>Today’s appointments</span>
                <strong>0</strong>
              </article>

              <article className="summary-card">
                <span>Total pets</span>
                <strong>{loading ? "—" : petCount}</strong>
              </article>

              <article className="summary-card">
                <span>Total clients</span>
                <strong>{loading ? "—" : clientCount}</strong>
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
          </>
        )}
      </main>
    </div>
  );
}

export default Dashboard;
