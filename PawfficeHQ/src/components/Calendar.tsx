import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

type CalendarProps = {
  businessId: string;
};

type Client = {
  id: number;
  first_name: string;
  last_name: string;
};

type Pet = {
  id: number;
  name: string;
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
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
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
        .select("id, first_name, last_name")
        .eq("business_id", businessId)
        .order("last_name"),
      supabase
        .from("PET")
        .select("id, name")
        .eq("business_id", businessId)
        .order("name"),
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
        .select("id, client_id, start_time, end_time, status, notes")
        .eq("business_id", businessId)
        .gte("start_time", new Date().toISOString())
        .order("start_time"),
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
    const appointmentIds = loadedAppointments.map((appointment) => appointment.id);

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

    const { error } = await supabase.rpc("create_appointment", {
      p_business_id: businessId,
      p_client_id: Number(clientId),
      p_pet_id: Number(petId),
      p_service_id: serviceId,
      p_staff_id: staffId || null,
      p_start_time: start.toISOString(),
      p_end_time: end.toISOString(),
      p_notes: notes.trim() || null,
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
    return client ? `${client.first_name} ${client.last_name}` : "Unknown client";
  }

  function petName(appointmentId: string) {
    const link = appointmentPets.find(
      (item) => item.appointment_id === appointmentId,
    );
    return pets.find((pet) => pet.id === link?.pet_id)?.name ?? "Unknown pet";
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
                    {client.first_name} {client.last_name}
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
                    {pet.name}
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

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Schedule</p>
            <h3>Upcoming appointments</h3>
          </div>
        </div>

        {loading ? (
          <p>Loading appointments...</p>
        ) : appointments.length === 0 ? (
          <div className="empty-state">
            <h3>No upcoming appointments</h3>
            <p>Your scheduled appointments will appear here.</p>
          </div>
        ) : (
          <div className="appointment-list">
            {appointments.map((appointment) => {
              const start = new Date(appointment.start_time);
              const end = new Date(appointment.end_time);

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
