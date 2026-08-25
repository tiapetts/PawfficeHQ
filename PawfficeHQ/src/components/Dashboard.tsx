import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import Clients from "./Clients";
import Pets from "./Pets";
import Services from "./Services";
import Calendar from "./Calendar";
import AppointmentHistory from "./AppointmentHistory";
import Invoices from "./Invoices";
import Staff from "./Staff";
import Settings from "./Settings";
import Billing from "./Billing";
import Vaccinations, { vaccinationState } from "./Vaccinations";
import RevenueOverview from "./RevenueOverview";
import ReportCards from "./ReportCards";
import ModuleWorkspace from "./ModuleWorkspace";
import PetSitting from "./PetSitting";
import PetSittingCalendarView from "./PetSittingCalendarView";
import PetSittingReports from "./PetSittingReports";
import BoardingDaycare from "./BoardingDaycare";
import BoardingCalendar from "./BoardingCalendar";
import BoardingServices from "./BoardingServices";
import type { SubscriptionAccess } from "./SubscriptionGate";
import { applyBusinessTheme } from "./Settings";
import "./Responsive.css";
import "./ModuleNavigation.css";

type DashboardProps = {
  businessId: string;
  firstName: string;
  readOnly?: boolean;
  subscriptionAccess?: SubscriptionAccess | null;
  onSubscriptionRefresh?: () => void;
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
  species?: string;
};

type VaccineRequirement = { id: string; name: string; species: string; alert_days_before: number; is_active: boolean };
type VaccinationRecord = { id: string; pet_id: number; requirement_id: string | null; vaccine_name: string; expires_on: string };

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
  | "history"
  | "invoices"
  | "staff"
  | "billing"
  | "vaccinations"
  | "report_cards"
  | "grooming_module"
  | "pet_sitting_module"
  | "pet_sitting_calendar"
  | "pet_sitting_reports"
  | "boarding_daycare_module"
  | "boarding_calendar"
  | "boarding_services"
  | "veterinary_module"
  | "settings";

function Dashboard({
  businessId,
  firstName,
  readOnly = false,
  subscriptionAccess = null,
  onSubscriptionRefresh,
}: DashboardProps) {
  const [activePage, setActivePage] = useState<ActivePage>("dashboard");
  const [requestedInvoiceId, setRequestedInvoiceId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [business, setBusiness] = useState<Business | null>(null);
  const [businessLogo, setBusinessLogo] = useState<string | null>(null);
  const [clientCount, setClientCount] = useState(0);
  const [petCount, setPetCount] = useState(0);
  const [vaccinationAlertCount, setVaccinationAlertCount] = useState(0);
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
  const [enabledModules, setEnabledModules] = useState<Array<"grooming"|"pet_sitting"|"boarding_daycare"|"veterinary">>([]);
  const [expandedModules, setExpandedModules] = useState<Record<"grooming"|"pet_sitting"|"boarding_daycare"|"veterinary",boolean>>({grooming:true,pet_sitting:true,boarding_daycare:true,veterinary:true});
  const [boardingDraftDate, setBoardingDraftDate] = useState<string | null>(null);

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
        requirementsResult,
        vaccinationsResult,
        modulesResult,
      ] = await Promise.all([
        supabase
          .from("business")
          .select("business_name")
          .eq("id", businessId)
          .single(),
        supabase
          .from("CLIENT")
          .select("*", { count: "exact", head: true })
          .eq("business_id", businessId)
          .is("archived_at", null),
        supabase
          .from("PET")
          .select("*", { count: "exact", head: true })
          .eq("business_id", businessId)
          .is("archived_at", null),
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
          .select("id, PetName, species")
          .eq("business_id", businessId)
          .is("archived_at", null),
        supabase
          .from("service")
          .select("id, name")
          .eq("business_id", businessId),
        supabase.rpc("get_business_settings", { p_business_id: businessId }),
        supabase.from("vaccine_requirement").select("id, name, species, alert_days_before, is_active").eq("business_id", businessId).eq("is_active", true),
        supabase.from("pet_vaccination").select("id, pet_id, requirement_id, vaccine_name, expires_on").eq("business_id", businessId),
        supabase.from("business_module").select("module_key").eq("business_id",businessId).eq("is_enabled",true),
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
        requirementsResult.error,
        vaccinationsResult.error,
        modulesResult.error,
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
          loadedSettings.primary_color ?? "#00b4d8",
          loadedSettings.accent_color ?? "#0077b6",
        );
      }
      setClientCount(clientsCountResult.count ?? 0);
      setPetCount(petsCountResult.count ?? 0);
      setTodayAppointments(loadedAppointments);
      setClients(clientsResult.data ?? []);
      setPets(petsResult.data ?? []);
      const dashboardPets = (petsResult.data as Pet[] | null) ?? [];
      const dashboardRequirements = (requirementsResult.data as VaccineRequirement[] | null) ?? [];
      const dashboardVaccinations = (vaccinationsResult.data as VaccinationRecord[] | null) ?? [];
      const alertCount = dashboardPets.reduce((count, pet) => count + dashboardRequirements.filter((requirement) => {
        if (requirement.species !== "All" && requirement.species !== pet.species) return false;
        const record = dashboardVaccinations
          .filter((item) => item.pet_id === pet.id && (item.requirement_id === requirement.id || item.vaccine_name.toLowerCase() === requirement.name.toLowerCase()))
          .sort((a, b) => b.expires_on.localeCompare(a.expires_on))[0];
        return vaccinationState(record, requirement) !== "current";
      }).length, 0);
      setVaccinationAlertCount(alertCount);
      setEnabledModules(((modulesResult.data as Array<{module_key:"grooming"|"pet_sitting"|"boarding_daycare"|"veterinary"}>|null)??[]).map(row=>row.module_key));
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

  function subscriptionLabel() {
    if (!subscriptionAccess) return null;
    if (subscriptionAccess.status === "trialing") {
      const remaining = subscriptionAccess.trial_end
        ? Math.max(0, Math.ceil((new Date(subscriptionAccess.trial_end).getTime() - Date.now()) / 86_400_000))
        : 0;
      return `Pro trial · ${remaining} day${remaining === 1 ? "" : "s"} left`;
    }
    if (["past_due", "unpaid", "incomplete", "incomplete_expired"].includes(subscriptionAccess.status)) {
      return "Payment required";
    }
    return `${subscriptionAccess.plan === "pro" ? "Pro" : "Basic"} · Active`;
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
          {subscriptionAccess && (
            <button
              className={`subscription-status-badge ${subscriptionAccess.status === "trialing" ? "trial" : ""}`}
              type="button"
              onClick={() => openPage("billing")}
            >
              {subscriptionLabel()}
            </button>
          )}
        </div>

        <nav>
          <button
            className={`nav-button ${activePage === "dashboard" ? "active" : ""}`}
            onClick={() => openPage("dashboard")}
          >
            Home
          </button>
          <button
            className={`nav-button ${activePage === "calendar" ? "active" : ""}`}
            onClick={() => openPage("calendar")}
          >
            Calendar
          </button>
          <button
            className={`nav-button ${activePage === "invoices" ? "active" : ""}`}
            onClick={() => openPage("invoices")}
          >
            Invoices
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
          <div className="core-nav-divider" />
          {enabledModules.includes("grooming")&&<div className="module-nav-group"><button type="button" className="module-nav-heading" aria-expanded={expandedModules.grooming} onClick={()=>setExpandedModules(current=>({...current,grooming:!current.grooming}))}><span>Grooming</span><span>⌄</span></button>{expandedModules.grooming&&<div className="module-nav-items"><button className={`nav-button ${activePage==="history"?"active":""}`} onClick={()=>openPage("history")}>Appointment history</button><button className={`nav-button ${activePage==="services"?"active":""}`} onClick={()=>openPage("services")}>Grooming services</button><button className={`nav-button ${activePage==="report_cards"?"active":""}`} onClick={()=>openPage("report_cards")}>Grooming report cards</button></div>}</div>}
          {enabledModules.includes("pet_sitting")&&<div className="module-nav-group"><button type="button" className="module-nav-heading" aria-expanded={expandedModules.pet_sitting} onClick={()=>setExpandedModules(current=>({...current,pet_sitting:!current.pet_sitting}))}><span>Pet sitting</span><span>⌄</span></button>{expandedModules.pet_sitting&&<div className="module-nav-items"><button className={`nav-button ${activePage==="pet_sitting_module"?"active":""}`} onClick={()=>openPage("pet_sitting_module")}>Bookings & care plans</button><button className={`nav-button ${activePage==="pet_sitting_calendar"?"active":""}`} onClick={()=>openPage("pet_sitting_calendar")}>Visit calendar</button><button className={`nav-button ${activePage==="pet_sitting_reports"?"active":""}`} onClick={()=>openPage("pet_sitting_reports")}>Visit reports</button></div>}</div>}
          {enabledModules.includes("boarding_daycare")&&<div className="module-nav-group"><button type="button" className="module-nav-heading" aria-expanded={expandedModules.boarding_daycare} onClick={()=>setExpandedModules(current=>({...current,boarding_daycare:!current.boarding_daycare}))}><span>Boarding & daycare</span><span>⌄</span></button>{expandedModules.boarding_daycare&&<div className="module-nav-items"><button className={`nav-button ${activePage==="boarding_daycare_module"?"active":""}`} onClick={()=>openPage("boarding_daycare_module")}>Reservations & occupancy</button><button className={`nav-button ${activePage==="boarding_calendar"?"active":""}`} onClick={()=>openPage("boarding_calendar")}>Stay calendar</button><button className={`nav-button ${activePage==="boarding_services"?"active":""}`} onClick={()=>openPage("boarding_services")}>Boarding services</button><button className={`nav-button ${activePage==="report_cards"?"active":""}`} onClick={()=>openPage("report_cards")}>Care reports</button></div>}</div>}
          {enabledModules.includes("veterinary")&&<div className="module-nav-group"><button type="button" className="module-nav-heading" aria-expanded={expandedModules.veterinary} onClick={()=>setExpandedModules(current=>({...current,veterinary:!current.veterinary}))}><span>Veterinary</span><span>⌄</span></button>{expandedModules.veterinary&&<div className="module-nav-items"><button className={`nav-button ${activePage==="veterinary_module"?"active":""}`} onClick={()=>openPage("veterinary_module")}>Encounters & records</button><button className={`nav-button ${activePage==="vaccinations"?"active":""}`} onClick={()=>openPage("vaccinations")}>Vaccinations</button></div>}</div>}
          <div className="core-nav-divider" />
          <button
            className={`nav-button ${activePage === "staff" ? "active" : ""}`}
            onClick={() => openPage("staff")}
          >
            Staff
          </button>
          {subscriptionAccess && (
            <button
              className={`nav-button ${activePage === "billing" ? "active" : ""}`}
              onClick={() => openPage("billing")}
            >
              Billing
            </button>
          )}
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
          <Calendar businessId={businessId} readOnly={readOnly} onOpenInvoice={(invoiceId) => { setRequestedInvoiceId(invoiceId); setActivePage("invoices"); }} />
        ) : activePage === "history" ? (
          <AppointmentHistory businessId={businessId} onOpenInvoice={(invoiceId) => { setRequestedInvoiceId(invoiceId); setActivePage("invoices"); }} />
        ) : activePage === "invoices" ? (
          <Invoices
            businessId={businessId}
            readOnly={readOnly}
            initialInvoiceId={requestedInvoiceId}
            onInitialInvoiceUsed={() => setRequestedInvoiceId(null)}
          />
        ) : activePage === "clients" ? (
          <Clients businessId={businessId} />
        ) : activePage === "pets" ? (
          <Pets businessId={businessId} />
        ) : activePage === "vaccinations" ? (
          <Vaccinations businessId={businessId} readOnly={readOnly} />
        ) : activePage === "report_cards" ? (
          <ReportCards businessId={businessId} readOnly={readOnly} />
        ) : activePage === "pet_sitting_module" ? (
          <PetSitting businessId={businessId} readOnly={readOnly} />
        ) : activePage === "pet_sitting_calendar" ? (
          <><header className="dashboard-header"><div><p className="eyebrow">Pet sitting</p><h2>Visit calendar</h2></div></header><PetSittingCalendarView businessId={businessId} focused /></>
        ) : activePage === "pet_sitting_reports" ? (
          <PetSittingReports businessId={businessId} />
        ) : activePage === "boarding_daycare_module" ? (
          <BoardingDaycare businessId={businessId} readOnly={readOnly} initialDate={boardingDraftDate} onInitialDateUsed={() => setBoardingDraftDate(null)} onOpenInvoice={(invoiceId) => { setRequestedInvoiceId(invoiceId); setActivePage("invoices"); }} />
        ) : activePage === "boarding_calendar" ? (
          <BoardingCalendar businessId={businessId} onNewReservation={(date) => {setBoardingDraftDate(date);openPage("boarding_daycare_module")}} />
        ) : activePage === "boarding_services" ? (
          <BoardingServices businessId={businessId} readOnly={readOnly} />
        ) : activePage.endsWith("_module") ? (
          <ModuleWorkspace moduleKey={activePage.replace("_module","") as "grooming"|"pet_sitting"|"boarding_daycare"|"veterinary"} />
        ) : activePage === "services" ? (
          <Services businessId={businessId} />
        ) : activePage === "staff" ? (
          <Staff businessId={businessId} readOnly={readOnly} />
        ) : activePage === "billing" && subscriptionAccess ? (
          <Billing
            businessId={businessId}
            access={subscriptionAccess}
            onRefresh={onSubscriptionRefresh}
          />
        ) : activePage === "settings" ? (
          <Settings
            businessId={businessId}
            readOnly={readOnly}
            onSaved={(businessName, logoUrl) => {
              setBusiness({ business_name: businessName });
              setBusinessLogo(logoUrl);
            }}
            onModulesChanged={(modules) => {
              setEnabledModules(modules);
              setActivePage((current) => {
                if (current.endsWith("_module") && !modules.includes(current.replace("_module","") as "grooming"|"pet_sitting"|"boarding_daycare"|"veterinary")) return "settings";
                if (current === "pet_sitting_calendar" && !modules.includes("pet_sitting")) return "settings";
                if (current === "pet_sitting_reports" && !modules.includes("pet_sitting")) return "settings";
                if (current === "boarding_calendar" && !modules.includes("boarding_daycare")) return "settings";
                if (!modules.includes("grooming") && ["history","services"].includes(current)) return "settings";
                if (!modules.includes("veterinary") && current === "vaccinations") return "settings";
                return current;
              });
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
                <strong>{loading ? "—" : vaccinationAlertCount}</strong>
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

            <RevenueOverview businessId={businessId} />
          </>
        )}
      </main>
    </div>
  );
}

export default Dashboard;
