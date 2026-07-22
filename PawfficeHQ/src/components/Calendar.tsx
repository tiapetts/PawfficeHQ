import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

type CalendarProps = {
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

type ClientPet = {
  client_id: number;
  pet_id: number;
};

type Service = {
  id: string;
  name: string;
  duration_minutes: number;
  base_price: number;
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

function Calendar({ businessId }: CalendarProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [clientPets, setClientPets] = useState<ClientPet[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentPets, setAppointmentPets] = useState<AppointmentPet[]>([]);
  const [appointmentServices, setAppointmentServices] = useState<
    AppointmentService[]
  >([]);

  const [showForm, setShowForm] = useState(false);
  const [clientId, setClientId] = useState("");
  const [petId, setPetId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [notes, setNotes] = useState("");
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadCalendar() {
    setLoading(true);
    setMessage("");

    const [
      clientsResult,
      petsResult,
      clientPetsResult,
      servicesResult,
      staffResult,
      appointmentsResult,
    ] = await Promise.all([
      supabase
        .from("CLIENT")
        .select("id, FirstName, LastName")
        .eq("business_id", businessId)
        .order("LastName"),
      supabase
        .from("PET")
        .select("id, PetName")
        .eq("business_id", businessId)
        .order("PetName"),
      supabase.from("client_pet").select("client_id, pet_id"),
      supabase
        .from("service")
        .select("id, name, duration_minutes, base_price")
        .eq("business_id", businessId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("STAFF")
        .select("id, first_name, last_name")
        .eq("business_id", businessId)
        .order("last_name"),
      supabase
        .from("appointment")
        .select("id, client_id, start_at, end_at, status")
        .eq("business_id", businessId)
        .order("start_at"),
    ]);

    const firstError = [
      clientsResult.error,
      petsResult.error,
      clientPetsResult.error,
      servicesResult.error,
      staffResult.error,
      appointmentsResult.error,
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

    let loadedAppointmentPets: AppointmentPet[] = [];
    let loadedAppointmentServices: AppointmentService[] = [];

    if (appointmentIds.length > 0) {
      const [petsLinkResult, servicesLinkResult] = await Promise.all([
        supabase
          .from("appointment_pet")
          .select("appointment_id, pet_id")
          .in("appointment_id", appointmentIds),
        supabase
          .from("appointment_service")
          .select("appointment_id, service_id, staff_id")
          .in("appointment_id", appointmentIds),
      ]);

      const linkError = petsLinkResult.error || servicesLinkResult.error;

      if (linkError) {
        console.error(linkError);
        setMessage(linkError.message);
      } else {
        loadedAppointmentPets = petsLinkResult.data ?? [];
        loadedAppointmentServices = servicesLinkResult.data ?? [];
      }
    }

    setClients(clientsResult.data ?? []);
    setPets(petsResult.data ?? []);
    setClientPets(clientPetsResult.data ?? []);
    setServices(servicesResult.data ?? []);
    setStaff(staffResult.data ?? []);
    setAppointments(loadedAppointments);
    setAppointmentPets(loadedAppointmentPets);
    setAppointmentServices(loadedAppointmentServices);
    setLoading(false);
  }

  useEffect(() => {
    void loadCalendar();
  }, [businessId]);

  const availablePets = useMemo(() => {
    if (!clientId) return [];

    const petIds = clientPets
      .filter((link) => String(link.client_id) === clientId)
      .map((link) => link.pet_id);

    return pets.filter((pet) => petIds.includes(pet.id));
  }, [clientId, clientPets, pets]);

  const selectedService = services.find((service) => service.id === serviceId);

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + index);
        return day;
      }),
    [weekStart],
  );

  const timeSlots = useMemo(
    () => Array.from({ length: 21 }, (_, index) => 8 * 60 + index * 30),
    [],
  );

  const upcomingAppointments = useMemo(
    () =>
      appointments.filter(
        (appointment) =>
          new Date(appointment.end_at) >= new Date() &&
          appointment.status !== "cancelled" &&
          appointment.status !== "void",
      ),
    [appointments],
  );

  function getMonday(date: Date) {
    const monday = new Date(date);
    const day = monday.getDay();
    const distance = day === 0 ? -6 : 1 - day;
    monday.setDate(monday.getDate() + distance);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  function formatInputDateTime(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  function selectTimeSlot(day: Date, minutesAfterMidnight: number) {
    const selected = new Date(day);
    selected.setHours(
      Math.floor(minutesAfterMidnight / 60),
      minutesAfterMidnight % 60,
      0,
      0,
    );
    setStartTime(formatInputDateTime(selected));
    setMessage("");
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function appointmentInSlot(day: Date, minutesAfterMidnight: number) {
    const slotStart = new Date(day);
    slotStart.setHours(
      Math.floor(minutesAfterMidnight / 60),
      minutesAfterMidnight % 60,
      0,
      0,
    );
    const slotEnd = new Date(slotStart.getTime() + 30 * 60_000);

    const appointment = appointments.find((item) => {
      if (item.status === "cancelled" || item.status === "void") {
        return false;
      }

      const start = new Date(item.start_at);
      const end = new Date(item.end_at);
      return start < slotEnd && end > slotStart;
    });

    if (!appointment) return null;

    const appointmentStart = new Date(appointment.start_at);
    return {
      appointment,
      isFirstSlot: appointmentStart >= slotStart && appointmentStart < slotEnd,
    };
  }

  function formatSlotTime(minutesAfterMidnight: number) {
    const time = new Date();
    time.setHours(
      Math.floor(minutesAfterMidnight / 60),
      minutesAfterMidnight % 60,
      0,
      0,
    );
    return time.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function resetForm() {
    setClientId("");
    setPetId("");
    setServiceId("");
    setStaffId("");
    setStartTime("");
    setNotes("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!clientId || !petId || !serviceId || !startTime || !selectedService) {
      setMessage("Please complete the client, pet, service, and start time.");
      return;
    }

    setSaving(true);

    const start = new Date(startTime);
    const end = new Date(
      start.getTime() + selectedService.duration_minutes * 60_000,
    );

    const { data: conflicts, error: conflictError } = await supabase
      .from("appointment")
      .select("id")
      .eq("business_id", businessId)
      .lt("start_at", end.toISOString())
      .gt("end_at", start.toISOString())
      .not("status", "in", "(cancelled,void)")
      .limit(1);

    if (conflictError) {
      console.error(conflictError);
      setMessage(conflictError.message);
      setSaving(false);
      return;
    }

    if (conflicts && conflicts.length > 0) {
      setMessage(
        "That time overlaps an existing appointment. Please choose another time.",
      );
      setSaving(false);
      return;
    }

    const { error } = await supabase.rpc("create_appointment", {
      p_client_id: Number(clientId),
      p_pet_id: Number(petId),
      p_service_id: serviceId,
      p_staff_id: staffId,
      p_start_at: start.toISOString(),
      p_client_notes: notes.trim() || null,
      p_internal_notes: null,
    });

    setSaving(false);

    if (error) {
      console.error(error);
      setMessage(error.message);
      return;
    }

    resetForm();
    setShowForm(false);
    await loadCalendar();
  }

  function clientName(id: number) {
    const client = clients.find((item) => item.id === id);
    return client ? `${client.FirstName} ${client.LastName}` : "Unknown client";
  }

  function petName(appointmentId: string) {
    const link = appointmentPets.find(
      (item) => item.appointment_id === appointmentId,
    );
    return (
      pets.find((pet) => pet.id === link?.pet_id)?.PetName ?? "Unknown pet"
    );
  }

  function serviceName(appointmentId: string) {
    const link = appointmentServices.find(
      (item) => item.appointment_id === appointmentId,
    );
    return (
      services.find((service) => service.id === link?.service_id)?.name ??
      "Unknown service"
    );
  }

  function staffName(appointmentId: string) {
    const link = appointmentServices.find(
      (item) => item.appointment_id === appointmentId,
    );
    const employee = staff.find((item) => item.id === link?.staff_id);
    return employee
      ? `${employee.first_name} ${employee.last_name}`
      : "Unassigned";
  }

  return (
    <div>
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Schedule</p>
          <h2>Calendar</h2>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={() => setShowForm((current) => !current)}
        >
          {showForm ? "Cancel" : "+ New appointment"}
        </button>
      </header>

      {message && (
        <p className="error-message" role="alert">
          {message}
        </p>
      )}

      {showForm && (
        <section className="dashboard-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Booking</p>
              <h3>New appointment</h3>
            </div>
          </div>

          <form className="appointment-form" onSubmit={handleSubmit}>
            <label>
              Client
              <select
                value={clientId}
                onChange={(event) => {
                  setClientId(event.target.value);
                  setPetId("");
                }}
                required
              >
                <option value="">Choose a client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.FirstName} {client.LastName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Pet
              <select
                value={petId}
                onChange={(event) => setPetId(event.target.value)}
                disabled={!clientId}
                required
              >
                <option value="">Choose a pet</option>
                {availablePets.map((pet) => (
                  <option key={pet.id} value={pet.id}>
                    {pet.PetName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Service
              <select
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value)}
                required
              >
                <option value="">Choose a service</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} — {service.duration_minutes} minutes
                  </option>
                ))}
              </select>
            </label>

            <label>
              Staff member
              <select
                value={staffId}
                onChange={(event) => setStaffId(event.target.value)}
              >
                <option value="">Unassigned</option>
                {staff.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.first_name} {employee.last_name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Start time
              <input
                type="datetime-local"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                required
              />
            </label>

            <label className="full-width">
              Notes
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
              />
            </label>

            <div className="form-actions full-width">
              <button
                className="primary-button"
                type="submit"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save appointment"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="dashboard-panel" style={{ overflow: "hidden" }}>
        <div
          className="panel-heading"
          style={{ display: "flex", justifyContent: "space-between", gap: 16 }}
        >
          <div>
            <p className="eyebrow">Weekly schedule</p>
            <h3>
              {weekDays[0].toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
              })}
              {" – "}
              {weekDays[6].toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </h3>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                setWeekStart((current) => {
                  const previous = new Date(current);
                  previous.setDate(previous.getDate() - 7);
                  return previous;
                })
              }
            >
              Previous
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setWeekStart(getMonday(new Date()))}
            >
              Today
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                setWeekStart((current) => {
                  const next = new Date(current);
                  next.setDate(next.getDate() + 7);
                  return next;
                })
              }
            >
              Next
            </button>
          </div>
        </div>

        <p style={{ marginTop: 0, color: "#58716b" }}>
          Click any open time to create an appointment.
        </p>

        <div style={{ overflowX: "auto", paddingBottom: 8 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "84px repeat(7, minmax(135px, 1fr))",
              minWidth: 1030,
              borderTop: "1px solid #d7e0dd",
              borderLeft: "1px solid #d7e0dd",
            }}
          >
            <div
              style={{
                padding: 12,
                borderRight: "1px solid #d7e0dd",
                borderBottom: "1px solid #d7e0dd",
              }}
            />
            {weekDays.map((day) => {
              const isToday = day.toDateString() === new Date().toDateString();
              return (
                <div
                  key={day.toISOString()}
                  style={{
                    padding: 12,
                    textAlign: "center",
                    borderRight: "1px solid #d7e0dd",
                    borderBottom: "1px solid #d7e0dd",
                    background: isToday ? "#e1eeea" : "#f7faf9",
                  }}
                >
                  <strong>
                    {day.toLocaleDateString(undefined, { weekday: "short" })}
                  </strong>
                  <div>
                    {day.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                </div>
              );
            })}

            {timeSlots.flatMap((slot) => [
              <div
                key={`time-${slot}`}
                style={{
                  padding: "10px 8px",
                  color: "#58716b",
                  fontSize: 13,
                  textAlign: "right",
                  borderRight: "1px solid #d7e0dd",
                  borderBottom: "1px solid #d7e0dd",
                  background: "#f7faf9",
                }}
              >
                {formatSlotTime(slot)}
              </div>,
              ...weekDays.map((day) => {
                const occupiedSlot = appointmentInSlot(day, slot);
                return (
                  <button
                    key={`${day.toISOString()}-${slot}`}
                    type="button"
                    onClick={() => {
                      if (!occupiedSlot) selectTimeSlot(day, slot);
                    }}
                    disabled={Boolean(occupiedSlot)}
                    style={{
                      minHeight: 62,
                      padding: 5,
                      border: 0,
                      borderRight: "1px solid #d7e0dd",
                      borderBottom: "1px solid #d7e0dd",
                      background: occupiedSlot ? "#dcece7" : "#ffffff",
                      cursor: occupiedSlot ? "not-allowed" : "pointer",
                      textAlign: "left",
                      color: "#183b34",
                      opacity: 1,
                    }}
                    title={
                      occupiedSlot
                        ? "This time is already booked"
                        : "Create an appointment at this time"
                    }
                  >
                    {occupiedSlot && (
                      <span
                        style={{
                          display: "block",
                          height: "100%",
                          minHeight: 44,
                          padding: "6px 7px",
                          borderRadius: occupiedSlot.isFirstSlot
                            ? "6px 6px 0 0"
                            : 0,
                          background: "#315f55",
                          color: "white",
                          fontSize: 12,
                          lineHeight: 1.25,
                        }}
                      >
                        {occupiedSlot.isFirstSlot ? (
                          <>
                            <strong>
                              {petName(occupiedSlot.appointment.id)}
                            </strong>
                            <br />
                            {serviceName(occupiedSlot.appointment.id)}
                          </>
                        ) : (
                          <span style={{ opacity: 0.8 }}>Continues</span>
                        )}
                      </span>
                    )}
                  </button>
                );
              }),
            ])}
          </div>
        </div>
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Schedule</p>
            <h3>Upcoming appointments</h3>
          </div>
        </div>

        {loading ? (
          <p>Loading appointments...</p>
        ) : upcomingAppointments.length === 0 ? (
          <div className="empty-state">
            <h3>No upcoming appointments</h3>
            <p>Your scheduled appointments will appear here.</p>
          </div>
        ) : (
          <div className="appointment-list">
            {upcomingAppointments.map((appointment) => {
              const start = new Date(appointment.start_at);
              const end = new Date(appointment.end_at);

              return (
                <article className="appointment-card" key={appointment.id}>
                  <div>
                    <p className="eyebrow">
                      {start.toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                    <h3>
                      {petName(appointment.id)} — {serviceName(appointment.id)}
                    </h3>
                    <p>{clientName(appointment.client_id)}</p>
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
                    <p>{staffName(appointment.id)}</p>
                    <span className="status-badge">{appointment.status}</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default Calendar;
