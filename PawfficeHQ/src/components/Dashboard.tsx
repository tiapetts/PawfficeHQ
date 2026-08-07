import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import Clients from "./Clients";
import Pets from "./Pets";
import Services from "./Services";
import Calendar from "./Calendar";
import Staff from "./Staff";
import Settings from "./Settings";
import { applyBusinessTheme } from "./Settings";
import "./Responsive.css";

type DashboardProps = {
  businessId: string;
  firstName: string;
  readOnly?: boolean;
};

type Business = {
  business_name: string;
};

type TodayAppointment = {
  id: string;
  client_id: number;
  start_at: string;
  end_at: string;
  status: string;
};

type Client = {
  id: number;
  FirstName: string;
  LastName: string;
};

type Pet = {
  id: number;
  PetName: string;
};

type AppointmentPet = {
  appointment_id: string;
  pet_id: number;
};

type Service = {
  id: string;
  name: string;
};

type AppointmentService = {
  appointment_id: string;
  service_id: string;
};

type ActivePage =
  | "dashboard"
  | "clients"
  | "pets"
  | "services"
  | "calendar"
  | "staff"
  | "settings";

function Dashboard({
  businessId,
  firstName,
  readOnly = false,
}: DashboardProps) {
  const [activePage, setActivePage] = useState<ActivePage>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [business, setBusiness] = useState<Business | null>(null);
  const [businessLogo, setBusinessLogo] = useState<string | null>(null);
  const [clientCount, setClientCount] = useState(0);
  const [petCount, setPetCount] = useState(0);
  const [todayAppointments, setTodayAppointments] = useState<
    TodayAppointment[]
  >([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [appointmentPets, setAppointmentPets] = useState<AppointmentPet[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [appointmentServices, setAppointmentServices] = useState<
    AppointmentService[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      setErrorMessage("");

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const startOfTomorrow = new Date(startOfToday);
      startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

      const [
        businessResult,
        clientsCountResult,
        petsCountResult,
        appointmentsResult,
        clientsResult,
        petsResult,
        servicesResult,
        settingsResult,
      ] = await Promise.all([
        supabase
          .from("business")
          .select("business_name")
          .eq("id", businessId)
          .single(),
        supabase
          .from("CLIENT")
          .select("*", { count: "exact", head: true })
          .eq("business_id", businessId),
        supabase
          .from("PET")
          .select("*", { count: "exact", head: true })
          .eq("business_id", businessId),
        supabase
          .from("appointment")
          .select("id, client_id, start_at, end_at, status")
          .eq("business_id", businessId)
          .gte("start_at", startOfToday.toISOString())
          .lt("start_at", startOfTomorrow.toISOString())
          .not("status", "in", '("cancelled","void")')
          .order("start_at"),
        supabase
          .from("CLIENT")
          .select("id, FirstName, LastName")
          .eq("business_id", businessId),
        supabase
          .from("PET")
          .select("id, PetName")
          .eq("business_id", businessId),
        supabase
          .from("service")
          .select("id, name")
          .eq("business_id", businessId),
        supabase.rpc("get_business_settings", { p_business_id: businessId }),
      ]);

      const firstError = [
        businessResult.error,
        clientsCountResult.error,
        petsCountResult.error,
        appointmentsResult.error,
        clientsResult.error,
        petsResult.error,
        servicesResult.error,
        settingsResult.error,
      ].find(Boolean);

      if (firstError) {
        console.error(firstError);
        setErrorMessage(firstError.message);
      }

      const loadedAppointments = appointmentsResult.data ?? [];
      const appointmentIds = loadedAppointments.map(
        (appointment) => appointment.id,
      );

      let loadedAppointmentPets: AppointmentPet[] = [];
      let loadedAppointmentServices: AppointmentService[] = [];

      if (appointmentIds.length > 0) {
        const [appointmentPetsResult, appointmentServicesResult] =
          await Promise.all([
            supabase
              .from("appointment_pet")
              .select("appointment_id, pet_id")
              .in("appointment_id", appointmentIds),
            supabase
              .from("appointment_service")
              .select("appointment_id, service_id")
              .in("appointment_id", appointmentIds),
          ]);

        const linkError =
          appointmentPetsResult.error || appointmentServicesResult.error;

        if (linkError) {
          console.error(linkError);
          setErrorMessage(linkError.message);
        } else {
          loadedAppointmentPets = appointmentPetsResult.data ?? [];
          loadedAppointmentServices = appointmentServicesResult.data ?? [];
        }
      }

      if (businessResult.data) setBusiness(businessResult.data);
      if (settingsResult.data) {
        const loadedSettings = settingsResult.data as {
          logo_url?: string | null;
          primary_color?: string;
          accent_color?: string;
        };
        setBusinessLogo(loadedSettings.logo_url ?? null);
        applyBusinessTheme(
          loadedSettings.primary_color ?? "#183f37",
          loadedSettings.accent_color ?? "#32685c",
        );
      }
      setClientCount(clientsCountResult.count ?? 0);
      setPetCount(petsCountResult.count ?? 0);
      setTodayAppointments(loadedAppointments);
      setClients(clientsResult.data ?? []);
      setPets(petsResult.data ?? []);
      setServices(servicesResult.data ?? []);
      setAppointmentPets(loadedAppointmentPets);
      setAppointmentServices(loadedAppointmentServices);
      setLoading(false);
    }

    void loadDashboard();
  }, [businessId, activePage]);

  function getClientName(clientId: number) {
    const client = clients.find((item) => item.id === clientId);
    return client ? `${client.FirstName} ${client.LastName}` : "Unknown client";
  }

  function getPetName(appointmentId: string) {
    const link = appointmentPets.find(
      (item) => item.appointment_id === appointmentId,
    );
    return (
      pets.find((pet) => pet.id === link?.pet_id)?.PetName ?? "Unknown pet"
    );
  }

  function getServiceName(appointmentId: string) {
    const link = appointmentServices.find(
      (item) => item.appointment_id === appointmentId,
    );
    return (
      services.find((service) => service.id === link?.service_id)?.name ??
      "Unknown service"
    );
  }

  function openPage(page: ActivePage) {
    setActivePage(page);
    setMobileMenuOpen(false);
  }

  return (
    <div className="dashboard">
      <button
        className="mobile-menu-button"
        type="button"
        aria-expanded={mobileMenuOpen}
        aria-label="Open navigation"
        onClick={() => setMobileMenuOpen((current) => !current)}
      >
        <span>☰</span> Pawffice HQ
      </button>
      <aside className={`sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <div>
          {businessLogo && (
            <img
              className="business-logo"
              src={businessLogo}
              alt="Business logo"
            />
          )}
          <h1>Pawffice HQ</h1>
          <p className="business-label">
            {business?.business_name ?? "Your business"}
          </p>
        </div>

        <nav>
          <button
            className={`nav-button ${activePage === "dashboard" ? "active" : ""}`}
            onClick={() => openPage("dashboard")}
          >
            Dashboard
          </button>
          <button
            className={`nav-button ${activePage === "calendar" ? "active" : ""}`}
            onClick={() => openPage("calendar")}
          >
            Calendar
          </button>
          <button
            className={`nav-button ${activePage === "clients" ? "active" : ""}`}
            onClick={() => openPage("clients")}
          >
            Clients
          </button>
          <button
            className={`nav-button ${activePage === "pets" ? "active" : ""}`}
            onClick={() => openPage("pets")}
          >
            Pets
          </button>
          <button
            className={`nav-button ${activePage === "services" ? "active" : ""}`}
            onClick={() => openPage("services")}
          >
            Services
          </button>
          <button
            className={`nav-button ${activePage === "staff" ? "active" : ""}`}
            onClick={() => openPage("staff")}
          >
            Staff
          </button>
          <button
            className={`nav-button ${activePage === "settings" ? "active" : ""}`}
            onClick={() => openPage("settings")}
          >
            Settings
          </button>
        </nav>

        <button
          className="sign-out-button"
          onClick={() => supabase.auth.signOut()}
        >
          Sign out
        </button>
      </aside>

      <main className="dashboard-main">
        {activePage === "calendar" ? (
          <Calendar businessId={businessId} readOnly={readOnly} />
        ) : activePage === "clients" ? (
          <Clients businessId={businessId} />
        ) : activePage === "pets" ? (
          <Pets businessId={businessId} />
        ) : activePage === "services" ? (
          <Services businessId={businessId} />
        ) : activePage === "staff" ? (
          <Staff businessId={businessId} readOnly={readOnly} />
        ) : activePage === "settings" ? (
          <Settings
            businessId={businessId}
            readOnly={readOnly}
            onSaved={(businessName, logoUrl) => {
              setBusiness({ business_name: businessName });
              setBusinessLogo(logoUrl);
            }}
          />
        ) : (
          <>
            <header className="dashboard-header">
              <div>
                <p className="eyebrow">Dashboard</p>
                <h2>Welcome back, {firstName}!</h2>
              </div>
              {!readOnly && (
                <button
                  className="primary-button"
                  onClick={() => setActivePage("calendar")}
                >
                  + New appointment
                </button>
              )}
            </header>

            {errorMessage && (
              <p className="error-message" role="alert">
                {errorMessage}
              </p>
            )}

            <section className="summary-grid">
              <article className="summary-card">
                <span>Today’s appointments</span>
                <strong>{loading ? "—" : todayAppointments.length}</strong>
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

              {loading ? (
                <p>Loading appointments...</p>
              ) : todayAppointments.length === 0 ? (
                <div className="empty-state">
                  <h3>No appointments today</h3>
                  <p>Your scheduled appointments will appear here.</p>
                </div>
              ) : (
                <div className="appointment-list">
                  {todayAppointments.map((appointment) => {
                    const start = new Date(appointment.start_at);
                    const end = new Date(appointment.end_at);

                    return (
                      <article
                        className="appointment-card"
                        key={appointment.id}
                      >
                        <div>
                          <p className="eyebrow">
                            {appointment.status.replaceAll("_", " ")}
                          </p>
                          <h3>
                            {getPetName(appointment.id)} —{" "}
                            {getServiceName(appointment.id)}
                          </h3>
                          <p>{getClientName(appointment.client_id)}</p>
                        </div>
                        <div>
                          <strong>
                            {start.toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                            {" – "}
                            {end.toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </strong>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default Dashboard;
