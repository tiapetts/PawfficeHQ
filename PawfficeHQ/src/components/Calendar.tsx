import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import FullCalendar, { type DateClickInfo } from "@fullcalendar/react";
import themePlugin from "@fullcalendar/react/themes/classic";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import interactionPlugin from "@fullcalendar/react/interaction";

import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";

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
  is_active: boolean;
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
  staff_id: string;
  price_at_booking: number;
};

const emptyForm = {
  clientId: "",
  petId: "",
  serviceId: "",
  staffId: "",
  date: "",
  time: "",
  clientNotes: "",
  internalNotes: "",
};

type AppointmentForm = typeof emptyForm;

export default function Calendar({ businessId }: CalendarProps) {
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

  const [form, setForm] = useState<AppointmentForm>(emptyForm);
  const [showForm, setShowForm] = useState(false);
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
      appointmentPetsResult,
      appointmentServicesResult,
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
        .select("id, name, duration_minutes, base_price, is_active")
        .eq("business_id", businessId)
        .order("name"),

      supabase
        .from("STAFF")
        .select("id, first_name, last_name")
        .eq("business_id", businessId)
        .eq("is_active", true)
        .order("last_name"),

      supabase
        .from("appointment")
        .select("id, client_id, start_at, end_at, status")
        .eq("business_id", businessId)
        .order("start_at"),

      supabase.from("appointment_pet").select("appointment_id, pet_id"),

      supabase.from("appointment_service").select(`
          appointment_id,
          service_id,
          staff_id,
          price_at_booking
        `),
    ]);

    const error =
      clientsResult.error ||
      petsResult.error ||
      clientPetsResult.error ||
      servicesResult.error ||
      staffResult.error ||
      appointmentsResult.error ||
      appointmentPetsResult.error ||
      appointmentServicesResult.error;

    if (error) {
      console.error(error);
      setMessage(error.message);
    } else {
      setClients(clientsResult.data ?? []);
      setPets(petsResult.data ?? []);
      setClientPets(clientPetsResult.data ?? []);
      setServices(servicesResult.data ?? []);
      setStaff(staffResult.data ?? []);
      setAppointments(appointmentsResult.data ?? []);
      setAppointmentPets(appointmentPetsResult.data ?? []);
      setAppointmentServices(appointmentServicesResult.data ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadCalendar();
  }, [businessId]);

  const availablePets = useMemo(() => {
    if (!form.clientId) {
      return [];
    }

    const petIds = clientPets
      .filter(
        (relationship) => relationship.client_id === Number(form.clientId),
      )
      .map((relationship) => relationship.pet_id);

    return pets.filter((pet) => petIds.includes(pet.id));
  }, [clientPets, form.clientId, pets]);

  function updateField(field: keyof AppointmentForm, value: string) {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
      ...(field === "clientId" ? { petId: "" } : {}),
    }));
  }

  function getClientName(clientId: number) {
    const client = clients.find((item) => item.id === clientId);

    return client ? `${client.FirstName} ${client.LastName}` : "Unknown client";
  }

  function getPetName(appointmentId: string) {
    const link = appointmentPets.find(
      (item) => item.appointment_id === appointmentId,
    );

    const pet = pets.find((item) => item.id === link?.pet_id);
    return pet?.PetName ?? "Unknown pet";
  }

  function getServiceName(appointmentId: string) {
    const link = appointmentServices.find(
      (item) => item.appointment_id === appointmentId,
    );

    const service = services.find((item) => item.id === link?.service_id);

    return service?.name ?? "Unknown service";
  }

  function getStaffName(appointmentId: string) {
    const link = appointmentServices.find(
      (item) => item.appointment_id === appointmentId,
    );

    const staffMember = staff.find((item) => item.id === link?.staff_id);

    return staffMember
      ? `${staffMember.first_name} ${staffMember.last_name}`
      : "Unassigned";
  }

  function formatStatus(status: string) {
    return status
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  const calendarEvents = useMemo(() => {
    return appointments
      .filter(
        (appointment) =>
          appointment.status !== "cancelled" && appointment.status !== "void",
      )
      .map((appointment) => ({
        id: appointment.id,
        title: `${getPetName(appointment.id)} — ${getServiceName(
          appointment.id,
        )}`,
        start: appointment.start_at,
        end: appointment.end_at,
        backgroundColor: "#315f55",
        borderColor: "#264b43",
        textColor: "#ffffff",
      }));
  }, [appointments, appointmentPets, appointmentServices, pets, services]);

  const upcomingAppointments = useMemo(() => {
    const now = new Date();

    return appointments
      .filter(
        (appointment) =>
          new Date(appointment.end_at) >= now &&
          appointment.status !== "cancelled" &&
          appointment.status !== "void",
      )
      .sort(
        (first, second) =>
          new Date(first.start_at).getTime() -
          new Date(second.start_at).getTime(),
      );
  }, [appointments]);

  function handleCalendarClick(info: DateClickInfo) {
    const clickedDate = info.date;

    const year = clickedDate.getFullYear();
    const month = String(clickedDate.getMonth() + 1).padStart(2, "0");
    const day = String(clickedDate.getDate()).padStart(2, "0");
    const hour = String(clickedDate.getHours()).padStart(2, "0");
    const minute = String(clickedDate.getMinutes()).padStart(2, "0");

    setForm((currentForm) => ({
      ...currentForm,
      date: `${year}-${month}-${day}`,
      time: `${hour}:${minute}`,
    }));

    setMessage("");
    setShowForm(true);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const localStart = new Date(`${form.date}T${form.time}`);

    if (Number.isNaN(localStart.getTime())) {
      setMessage("Please select a valid date and time.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.rpc("create_appointment", {
      p_client_id: Number(form.clientId),
      p_pet_id: Number(form.petId),
      p_service_id: form.serviceId,
      p_staff_id: form.staffId,
      p_start_at: localStart.toISOString(),
      p_client_notes: form.clientNotes || null,
      p_internal_notes: form.internalNotes || null,
    });

    if (error) {
      console.error(error);
      setMessage(error.message);
      setSaving(false);
      return;
    }

    setForm(emptyForm);
    setShowForm(false);
    setSaving(false);
    await loadCalendar();
  }

  return (
    <>
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Schedule</p>
          <h2>Calendar</h2>
        </div>

        <button
          className="primary-button"
          onClick={() => {
            setShowForm(!showForm);
            setMessage("");
          }}
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
        <section className="dashboard-panel client-form-panel">
          <h3>New appointment</h3>

          <form className="client-form" onSubmit={handleSubmit}>
            <label>
              Client
              <select
                value={form.clientId}
                onChange={(event) =>
                  updateField("clientId", event.target.value)
                }
                required
              >
                <option value="">Select client</option>

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
                value={form.petId}
                onChange={(event) => updateField("petId", event.target.value)}
                disabled={!form.clientId}
                required
              >
                <option value="">Select pet</option>

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
                value={form.serviceId}
                onChange={(event) =>
                  updateField("serviceId", event.target.value)
                }
                required
              >
                <option value="">Select service</option>

                {services
                  .filter((service) => service.is_active)
                  .map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} — ${Number(service.base_price).toFixed(2)}
                    </option>
                  ))}
              </select>
            </label>

            <label>
              Assigned staff
              <select
                value={form.staffId}
                onChange={(event) => updateField("staffId", event.target.value)}
                required
              >
                <option value="">Select staff member</option>

                {staff.map((staffMember) => (
                  <option key={staffMember.id} value={staffMember.id}>
                    {staffMember.first_name} {staffMember.last_name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Date
              <input
                type="date"
                value={form.date}
                onChange={(event) => updateField("date", event.target.value)}
                required
              />
            </label>

            <label>
              Start time
              <input
                type="time"
                value={form.time}
                onChange={(event) => updateField("time", event.target.value)}
                required
              />
            </label>

            <label className="full-width">
              Client notes
              <textarea
                value={form.clientNotes}
                onChange={(event) =>
                  updateField("clientNotes", event.target.value)
                }
                placeholder="Information provided by the client."
                rows={3}
              />
            </label>

            <label className="full-width">
              Internal notes
              <textarea
                value={form.internalNotes}
                onChange={(event) =>
                  updateField("internalNotes", event.target.value)
                }
                placeholder="Private notes for staff."
                rows={3}
              />
            </label>

            <div className="full-width form-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={saving}
              >
                {saving ? "Creating appointment..." : "Create appointment"}
              </button>
            </div>
          </form>
        </section>
      )}

      {loading ? (
        <p>Loading appointments...</p>
      ) : (
        <>
          <section className="calendar-panel">
            <FullCalendar
              plugins={[themePlugin, timeGridPlugin, interactionPlugin]}
              initialView="timeGridWeek"
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: "timeGridWeek,timeGridDay",
              }}
              buttonText={{
                today: "Today",
                week: "Week",
                day: "Day",
              }}
              events={calendarEvents}
              dateClick={handleCalendarClick}
              selectable
              nowIndicator
              allDaySlot={false}
              slotDuration="00:30:00"
              slotLabelInterval="01:00"
              slotMinTime="06:00:00"
              slotMaxTime="20:00:00"
              scrollTime="08:00:00"
              height="auto"
            />
          </section>

          <section className="dashboard-panel upcoming-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Coming up</p>
                <h3>Upcoming appointments</h3>
              </div>

              <strong>{upcomingAppointments.length}</strong>
            </div>

            {upcomingAppointments.length === 0 ? (
              <div className="empty-state">
                <h3>No upcoming appointments</h3>
                <p>Click an available calendar time to schedule one.</p>
              </div>
            ) : (
              <div className="appointment-list">
                {upcomingAppointments.map((appointment) => (
                  <article className="appointment-row" key={appointment.id}>
                    <div className="appointment-time">
                      <strong>
                        {new Date(appointment.start_at).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </strong>

                      <span>
                        {new Date(appointment.start_at).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>

                    <div className="appointment-summary">
                      <h3>
                        {getPetName(appointment.id)} —{" "}
                        {getServiceName(appointment.id)}
                      </h3>

                      <p>{getClientName(appointment.client_id)}</p>
                    </div>

                    <div>
                      <span className="client-detail-label">Assigned to</span>
                      <p>{getStaffName(appointment.id)}</p>
                    </div>

                    <span className="appointment-status">
                      {formatStatus(appointment.status)}
                    </span>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
