import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import "./AppointmentHistory.css";

type AppointmentHistoryProps = {
  businessId: string;
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

type Service = {
  id: string;
  name: string;
};

type Staff = {
  id: string;
  first_name: string;
  last_name: string;
};

type Appointment = {
  id: string;
  client_id: number;
  start_at: string;
  end_at: string;
  status: string;
  client_notes: string | null;
  internal_notes: string | null;
};

type AppointmentPet = {
  appointment_id: string;
  pet_id: number;
};

type AppointmentService = {
  appointment_id: string;
  service_id: string;
  staff_id: string | null;
};

type HistoryFilter =
  | "all"
  | "upcoming"
  | "requested"
  | "completed"
  | "cancelled"
  | "no_show";

const statusLabels: Record<string, string> = {
  requested: "Requested",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  in_progress: "In progress",
  ready_for_pickup: "Ready for pickup",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
  void: "Void",
};

function startOfLocalDay(value: string) {
  return new Date(`${value}T00:00:00`);
}

function endOfLocalDay(value: string) {
  return new Date(`${value}T23:59:59.999`);
}

export default function AppointmentHistory({
  businessId,
}: AppointmentHistoryProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [appointmentPets, setAppointmentPets] = useState<AppointmentPet[]>([]);
  const [appointmentServices, setAppointmentServices] = useState<
    AppointmentService[]
  >([]);
  const [activeFilter, setActiveFilter] = useState<HistoryFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<
    string | null
  >(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadHistory() {
      setLoading(true);
      setMessage("");

      const [
        appointmentsResult,
        clientsResult,
        petsResult,
        servicesResult,
        staffResult,
      ] = await Promise.all([
        supabase
          .from("appointment")
          .select(
            "id, client_id, start_at, end_at, status, client_notes, internal_notes",
          )
          .eq("business_id", businessId)
          .order("start_at", { ascending: false }),
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
        supabase
          .from("STAFF")
          .select("id, first_name, last_name")
          .eq("business_id", businessId),
      ]);

      const firstError = [
        appointmentsResult.error,
        clientsResult.error,
        petsResult.error,
        servicesResult.error,
        staffResult.error,
      ].find(Boolean);

      if (firstError) {
        console.error(firstError);
        setMessage(firstError.message);
        setLoading(false);
        return;
      }

      const loadedAppointments = appointmentsResult.data ?? [];
      const appointmentIds = loadedAppointments.map(
        (appointment) => appointment.id,
      );

      let loadedPetLinks: AppointmentPet[] = [];
      let loadedServiceLinks: AppointmentService[] = [];

      if (appointmentIds.length > 0) {
        const [petLinksResult, serviceLinksResult] = await Promise.all([
          supabase
            .from("appointment_pet")
            .select("appointment_id, pet_id")
            .in("appointment_id", appointmentIds),
          supabase
            .from("appointment_service")
            .select("appointment_id, service_id, staff_id")
            .in("appointment_id", appointmentIds),
        ]);

        const linkError = petLinksResult.error || serviceLinksResult.error;

        if (linkError) {
          console.error(linkError);
          setMessage(linkError.message);
          setLoading(false);
          return;
        }

        loadedPetLinks = petLinksResult.data ?? [];
        loadedServiceLinks = serviceLinksResult.data ?? [];
      }

      setAppointments(loadedAppointments);
      setClients(clientsResult.data ?? []);
      setPets(petsResult.data ?? []);
      setServices(servicesResult.data ?? []);
      setStaff(staffResult.data ?? []);
      setAppointmentPets(loadedPetLinks);
      setAppointmentServices(loadedServiceLinks);
      setLoading(false);
    }

    void loadHistory();
  }, [businessId]);

  function getClientName(clientId: number) {
    const client = clients.find((item) => item.id === clientId);
    return client ? `${client.FirstName} ${client.LastName}` : "Unknown client";
  }

  function getPetNames(appointmentId: string) {
    const petIds = appointmentPets
      .filter((link) => link.appointment_id === appointmentId)
      .map((link) => link.pet_id);

    const names = pets
      .filter((pet) => petIds.includes(pet.id))
      .map((pet) => pet.PetName);

    return names.length > 0 ? names.join(", ") : "Unknown pet";
  }

  function getServiceNames(appointmentId: string) {
    const serviceIds = appointmentServices
      .filter((link) => link.appointment_id === appointmentId)
      .map((link) => link.service_id);

    const names = services
      .filter((service) => serviceIds.includes(service.id))
      .map((service) => service.name);

    return names.length > 0 ? names.join(", ") : "No service listed";
  }

  function getStaffNames(appointmentId: string) {
    const staffIds = appointmentServices
      .filter((link) => link.appointment_id === appointmentId)
      .map((link) => link.staff_id)
      .filter((staffId): staffId is string => Boolean(staffId));

    const names = staff
      .filter((staffMember) => staffIds.includes(staffMember.id))
      .map(
        (staffMember) => `${staffMember.first_name} ${staffMember.last_name}`,
      );

    return names.length > 0 ? names.join(", ") : "Unassigned";
  }

  const filteredAppointments = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const now = new Date();

    return appointments.filter((appointment) => {
      const appointmentStart = new Date(appointment.start_at);
      const appointmentEnd = new Date(appointment.end_at);

      if (
        activeFilter === "upcoming" &&
        (appointmentEnd < now ||
          ["completed", "cancelled", "no_show", "void"].includes(
            appointment.status,
          ))
      ) {
        return false;
      }

      if (
        !["all", "upcoming"].includes(activeFilter) &&
        appointment.status !== activeFilter
      ) {
        return false;
      }

      if (dateFrom && appointmentStart < startOfLocalDay(dateFrom)) {
        return false;
      }

      if (dateTo && appointmentStart > endOfLocalDay(dateTo)) {
        return false;
      }

      if (normalizedSearch) {
        const searchableText = [
          getClientName(appointment.client_id),
          getPetNames(appointment.id),
          getServiceNames(appointment.id),
          getStaffNames(appointment.id),
          statusLabels[appointment.status] ?? appointment.status,
          appointment.client_notes ?? "",
          appointment.internal_notes ?? "",
        ]
          .join(" ")
          .toLowerCase();

        if (!searchableText.includes(normalizedSearch)) {
          return false;
        }
      }

      return true;
    });
  }, [
    activeFilter,
    appointmentPets,
    appointmentServices,
    appointments,
    clients,
    dateFrom,
    dateTo,
    pets,
    searchTerm,
    services,
    staff,
  ]);

  const summary = useMemo(
    () => ({
      total: appointments.length,
      requested: appointments.filter(
        (appointment) => appointment.status === "requested",
      ).length,
      completed: appointments.filter(
        (appointment) => appointment.status === "completed",
      ).length,
      cancelled: appointments.filter((appointment) =>
        ["cancelled", "no_show"].includes(appointment.status),
      ).length,
    }),
    [appointments],
  );

  function clearFilters() {
    setActiveFilter("all");
    setSearchTerm("");
    setDateFrom("");
    setDateTo("");
  }

  async function updateAppointmentStatus(
    appointmentId: string,
    newStatus: "confirmed" | "cancelled" | "no_show",
  ) {
    if (
      newStatus === "no_show" &&
      !window.confirm("Mark this appointment as a no-show?")
    ) {
      return;
    }

    if (
      newStatus === "cancelled" &&
      !window.confirm("Cancel this appointment?")
    ) {
      return;
    }

    setUpdatingId(appointmentId);
    setMessage("");

    const { data, error } = await supabase
      .from("appointment")
      .update({ status: newStatus })
      .eq("id", appointmentId)
      .eq("business_id", businessId)
      .select("id, status")
      .maybeSingle();

    if (error) {
      console.error(error);
      setMessage(error.message);
      setUpdatingId(null);
      return;
    }

    if (!data) {
      setMessage(
        "The appointment could not be updated. Refresh the page and try again.",
      );
      setUpdatingId(null);
      return;
    }

    setAppointments((currentAppointments) =>
      currentAppointments.map((appointment) =>
        appointment.id === appointmentId
          ? { ...appointment, status: newStatus }
          : appointment,
      ),
    );

    setSelectedAppointmentId(null);
    setUpdatingId(null);
  }

  return (
    <>
      <header className="dashboard-header history-page-header">
        <div>
          <p className="eyebrow">Records</p>
          <h2>Appointment history</h2>
          <p className="history-subtitle">
            Search and review every appointment without removing past records.
          </p>
        </div>
      </header>

      {message && (
        <p className="error-message" role="alert">
          {message}
        </p>
      )}

      <section className="history-summary-grid" aria-label="History summary">
        <article className="history-summary-card">
          <span>All appointments</span>
          <strong>{loading ? "—" : summary.total}</strong>
        </article>
        <article className="history-summary-card">
          <span>Awaiting approval</span>
          <strong>{loading ? "—" : summary.requested}</strong>
        </article>
        <article className="history-summary-card">
          <span>Completed</span>
          <strong>{loading ? "—" : summary.completed}</strong>
        </article>
        <article className="history-summary-card">
          <span>Cancelled / no-show</span>
          <strong>{loading ? "—" : summary.cancelled}</strong>
        </article>
      </section>

      <section className="dashboard-panel history-panel">
        <div className="history-toolbar">
          <label className="history-search">
            <span>Search appointments</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Client, pet, service, or staff"
            />
          </label>

          <label>
            <span>From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>

          <label>
            <span>To</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>

          <button
            type="button"
            className="history-clear-button"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        </div>

        <div className="history-filter-tabs" aria-label="Appointment filters">
          {(
            [
              ["all", "All"],
              ["upcoming", "Upcoming"],
              ["requested", "Requested"],
              ["completed", "Completed"],
              ["cancelled", "Cancelled"],
              ["no_show", "No-show"],
            ] as Array<[HistoryFilter, string]>
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={activeFilter === value ? "active" : ""}
              onClick={() => setActiveFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="history-loading">Loading appointment history...</p>
        ) : filteredAppointments.length === 0 ? (
          <div className="empty-state history-empty-state">
            <h3>No matching appointments</h3>
            <p>Try changing the status, dates, or search term.</p>
          </div>
        ) : (
          <div className="history-results">
            <p className="history-result-count">
              {filteredAppointments.length}{" "}
              {filteredAppointments.length === 1
                ? "appointment"
                : "appointments"}
            </p>

            {filteredAppointments.map((appointment) => {
              const start = new Date(appointment.start_at);
              const end = new Date(appointment.end_at);

              return (
                <article
                  className={`history-record ${
                    selectedAppointmentId === appointment.id
                      ? "history-record-selected"
                      : ""
                  }`}
                  key={appointment.id}
                  onClick={() =>
                    setSelectedAppointmentId((currentId) =>
                      currentId === appointment.id ? null : appointment.id,
                    )
                  }
                >
                  <div className="history-record-date">
                    <strong>
                      {start.toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                      })}
                    </strong>
                    <span>{start.getFullYear()}</span>
                  </div>

                  <div className="history-record-main">
                    <div className="history-record-heading">
                      <div>
                        <h3>
                          {getPetNames(appointment.id)} —{" "}
                          {getServiceNames(appointment.id)}
                        </h3>
                        <p>{getClientName(appointment.client_id)}</p>
                      </div>

                      <span
                        className={`history-status history-status-${appointment.status}`}
                      >
                        {statusLabels[appointment.status] ?? appointment.status}
                      </span>
                    </div>

                    <div className="history-record-details">
                      <div>
                        <span>Time</span>
                        <strong>
                          {start.toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}{" "}
                          –{" "}
                          {end.toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </strong>
                      </div>

                      <div>
                        <span>Staff</span>
                        <strong>{getStaffNames(appointment.id)}</strong>
                      </div>

                      <div>
                        <span>Appointment ID</span>
                        <strong>{appointment.id.slice(0, 8)}</strong>
                      </div>
                    </div>

                    {(appointment.client_notes ||
                      appointment.internal_notes) && (
                      <details className="history-notes">
                        <summary>View appointment notes</summary>
                        {appointment.client_notes && (
                          <div>
                            <strong>Client notes</strong>
                            <p>{appointment.client_notes}</p>
                          </div>
                        )}
                        {appointment.internal_notes && (
                          <div>
                            <strong>Internal notes</strong>
                            <p>{appointment.internal_notes}</p>
                          </div>
                        )}
                      </details>
                    )}

                    {selectedAppointmentId === appointment.id && (
                      <div
                        className="history-record-actions"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {appointment.status === "requested" && (
                          <button
                            type="button"
                            className="history-approve-button"
                            disabled={updatingId === appointment.id}
                            onClick={() =>
                              void updateAppointmentStatus(
                                appointment.id,
                                "confirmed",
                              )
                            }
                          >
                            {updatingId === appointment.id
                              ? "Updating..."
                              : "Approve appointment"}
                          </button>
                        )}

                        {["confirmed", "checked_in"].includes(
                          appointment.status,
                        ) && (
                          <button
                            type="button"
                            className="history-danger-button"
                            disabled={updatingId === appointment.id}
                            onClick={() =>
                              void updateAppointmentStatus(
                                appointment.id,
                                "no_show",
                              )
                            }
                          >
                            Mark no-show
                          </button>
                        )}

                        {["requested", "confirmed"].includes(
                          appointment.status,
                        ) && (
                          <button
                            type="button"
                            className="history-secondary-button"
                            disabled={updatingId === appointment.id}
                            onClick={() =>
                              void updateAppointmentStatus(
                                appointment.id,
                                "cancelled",
                              )
                            }
                          >
                            Cancel appointment
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
