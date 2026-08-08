import {
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import { supabase } from "../lib/supabase";
import "./Responsive.css";
import "./Notifications.css";

type CalendarProps = {
  businessId: string;
  readOnly?: boolean;
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

function Calendar({ businessId, readOnly = false }: CalendarProps) {
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
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date(), 1));
  const [mobileDate, setMobileDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia("(max-width: 720px)").matches,
  );
  const [draggingAppointmentId, setDraggingAppointmentId] = useState<
    string | null
  >(null);
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationChannel, setNotificationChannel] = useState("email");
  const [notificationBody, setNotificationBody] = useState("");
  const [confirmSmsConsent, setConfirmSmsConsent] = useState(false);
  const [sendingNotification, setSendingNotification] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [appointmentInterval, setAppointmentInterval] = useState(30);
  const [calendarStart, setCalendarStart] = useState("08:00");
  const [calendarEnd, setCalendarEnd] = useState("18:00");
  const [weekStartsOn, setWeekStartsOn] = useState(1);

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
        .select(
          "id, client_id, start_at, end_at, status, client_notes, internal_notes",
        )
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

  useEffect(() => {
    async function loadCalendarSettings() {
      const { data, error } = await supabase.rpc("get_business_settings", {
        p_business_id: businessId,
      });

      if (error) {
        console.error("Calendar settings error:", error);
        setMessage(error.message);
        return;
      }

      const savedInterval = Number(data?.appointment_interval);

      if ([15, 30, 60].includes(savedInterval)) {
        setAppointmentInterval(savedInterval);
      }

      if (typeof data?.calendar_start === "string" && data.calendar_start) {
        setCalendarStart(data.calendar_start);
      }

      if (typeof data?.calendar_end === "string" && data.calendar_end) {
        setCalendarEnd(data.calendar_end);
      }

      const savedWeekStart = Number(data?.week_starts_on);

      if ([0, 1].includes(savedWeekStart)) {
        setWeekStartsOn(savedWeekStart);

        setWeekStart((currentDate) =>
          getWeekStart(currentDate, savedWeekStart),
        );
      }
    }

    void loadCalendarSettings();
  }, [businessId]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 720px)");
    const update = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    setIsMobile(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

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

  //
  const timeSlots = useMemo(() => {
    const [startHour = 8, startMinute = 0] = calendarStart
      .split(":")
      .map(Number);

    const [endHour = 18, endMinute = 0] = calendarEnd.split(":").map(Number);

    const startInMinutes = startHour * 60 + startMinute;
    const endInMinutes = endHour * 60 + endMinute;

    if (
      !Number.isFinite(startInMinutes) ||
      !Number.isFinite(endInMinutes) ||
      endInMinutes <= startInMinutes
    ) {
      return [];
    }

    const numberOfSlots = Math.ceil(
      (endInMinutes - startInMinutes) / appointmentInterval,
    );

    return Array.from(
      { length: numberOfSlots },
      (_, index) => startInMinutes + index * appointmentInterval,
    );
  }, [appointmentInterval, calendarStart, calendarEnd]);
  const visibleDays = isMobile ? [mobileDate] : weekDays;

  function moveCalendar(amount: number) {
    if (isMobile) {
      setMobileDate((current) => {
        const next = new Date(current);
        next.setDate(next.getDate() + amount);
        return next;
      });
      return;
    }

    setWeekStart((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + amount * 7);
      return next;
    });
  }

  function goToToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setMobileDate(today);
    setWeekStart(getWeekStart(today, weekStartsOn));
  }

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

  function getWeekStart(date: Date, startsOn: number) {
    const start = new Date(date);
    const currentDay = start.getDay();
    const distance = (currentDay - startsOn + 7) % 7;

    start.setDate(start.getDate() - distance);
    start.setHours(0, 0, 0, 0);

    return start;
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
    if (readOnly) return;
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
    const slotEnd = new Date(
      slotStart.getTime() + appointmentInterval * 60_000,
    );

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

  async function moveAppointment(
    event: DragEvent<HTMLButtonElement>,
    day: Date,
    minutesAfterMidnight: number,
  ) {
    event.preventDefault();

    if (readOnly) return;

    const appointmentId =
      event.dataTransfer.getData("text/plain") || draggingAppointmentId;
    const appointment = appointments.find((item) => item.id === appointmentId);

    if (!appointment) return;

    const newStart = new Date(day);
    newStart.setHours(
      Math.floor(minutesAfterMidnight / 60),
      minutesAfterMidnight % 60,
      0,
      0,
    );

    const duration =
      new Date(appointment.end_at).getTime() -
      new Date(appointment.start_at).getTime();
    const newEnd = new Date(newStart.getTime() + duration);

    setMessage("");

    const { data: conflicts, error: conflictError } = await supabase
      .from("appointment")
      .select("id")
      .eq("business_id", businessId)
      .neq("id", appointment.id)
      .lt("start_at", newEnd.toISOString())
      .gt("end_at", newStart.toISOString())
      .not("status", "in", "(cancelled,void)")
      .limit(1);

    if (conflictError) {
      console.error(conflictError);
      setMessage(conflictError.message);
      setDraggingAppointmentId(null);
      return;
    }

    if (conflicts && conflicts.length > 0) {
      setMessage(
        "That move would overlap another appointment. Choose another time.",
      );
      setDraggingAppointmentId(null);
      return;
    }

    const { error: updateError } = await supabase
      .from("appointment")
      .update({
        start_at: newStart.toISOString(),
        end_at: newEnd.toISOString(),
      })
      .eq("id", appointment.id)
      .eq("business_id", businessId);

    if (updateError) {
      console.error(updateError);
      setMessage(updateError.message);
      setDraggingAppointmentId(null);
      return;
    }

    setDraggingAppointmentId(null);
    setMessage(
      `Appointment moved to ${newStart.toLocaleDateString()} at ${newStart.toLocaleTimeString(
        [],
        { hour: "numeric", minute: "2-digit" },
      )}.`,
    );
    await loadCalendar();
  }

  async function updateAppointmentStatus(status: string) {
    if (!selectedAppointment || readOnly) return;

    setUpdatingStatus(true);
    setMessage("");

    const { data, error } = await supabase
      .from("appointment")
      .update({ status })
      .eq("id", selectedAppointment.id)
      .eq("business_id", businessId)
      .select(
        "id, client_id, start_at, end_at, status, client_notes, internal_notes",
      )
      .single();

    setUpdatingStatus(false);

    if (error) {
      console.error(error);
      setMessage(error.message);
      return;
    }

    setSelectedAppointment(data);
    setAppointments((current) =>
      current.map((appointment) =>
        appointment.id === data.id ? data : appointment,
      ),
    );
  }

  function openReadyNotification() {
    if (!selectedAppointment) return;
    setNotificationBody(
      `${petName(selectedAppointment.id)} is ready for pickup! Please contact us if you have any questions.`,
    );
    setNotificationChannel("email");
    setConfirmSmsConsent(false);
    setShowNotification(true);
  }

  async function sendReadyNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAppointment) return;
    setSendingNotification(true);
    setMessage("");
    const { data, error } = await supabase.functions.invoke(
      "send-client-notification",
      {
        body: {
          appointmentId: selectedAppointment.id,
          channel: notificationChannel,
          message: notificationBody,
          confirmSmsConsent,
        },
      },
    );
    setSendingNotification(false);
    if (error || data?.error) {
      setMessage(data?.error ?? error?.message ?? "Notification failed");
      return;
    }
    const results = (data?.results ?? []) as Array<{ message: string }>;
    setMessage(results.map((result) => result.message).join(" • "));
    setShowNotification(false);
    setSelectedAppointment(null);
    await loadCalendar();
  }

  function formatStatus(status: string) {
    return status
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function statusColor(status: string) {
    const colors: Record<string, string> = {
      requested: "#7c5c2e",
      confirmed: "#315f55",
      checked_in: "#2f6f9f",
      in_progress: "#b7791f",
      ready_for_pickup: "#27695a",
      completed: "#687773",
      cancelled: "#a33f3f",
      no_show: "#713b62",
      void: "#5f6664",
    };

    return colors[status] ?? "#315f55";
  }

  function statusCellColor(status: string) {
    const colors: Record<string, string> = {
      requested: "#f4eadb",
      confirmed: "#dcece7",
      checked_in: "#dcecf6",
      in_progress: "#f8ebcd",
      ready_for_pickup: "#d8eee8",
      completed: "#e4e8e7",
      cancelled: "#f6dddd",
      no_show: "#eee0ea",
      void: "#e5e7e6",
    };

    return colors[status] ?? "#dcece7";
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

        {!readOnly && (
          <button
            className="primary-button"
            type="button"
            onClick={() => setShowForm((current) => !current)}
          >
            {showForm ? "Cancel" : "+ New appointment"}
          </button>
        )}
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
            <p className="eyebrow">
              {isMobile ? "Daily schedule" : "Weekly schedule"}
            </p>
            <h3>
              {visibleDays[0].toLocaleDateString(undefined, {
                weekday: isMobile ? "long" : undefined,
                month: "long",
                day: "numeric",
              })}
              {!isMobile && (
                <>
                  {" – "}
                  {weekDays[6].toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </>
              )}
            </h3>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="secondary-button"
              type="button"
              onClick={() => moveCalendar(-1)}
            >
              {isMobile ? "‹" : "Previous"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={goToToday}
            >
              Today
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => moveCalendar(1)}
            >
              {isMobile ? "›" : "Next"}
            </button>
          </div>
        </div>

        <p style={{ marginTop: 0, color: "#58716b" }}>
          {readOnly
            ? "Click an appointment to view its details."
            : "Click an open time to create an appointment, or drag an appointment to reschedule it."}
        </p>

        <div className="calendar-scroll">
          <div
            className="calendar-grid"
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
                ? "70px minmax(0, 1fr)"
                : "84px repeat(7, minmax(135px, 1fr))",
              minWidth: isMobile ? 0 : 1030,
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
            {visibleDays.map((day) => {
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
              ...visibleDays.map((day) => {
                const occupiedSlot = appointmentInSlot(day, slot);
                return (
                  <button
                    key={`${day.toISOString()}-${slot}`}
                    type="button"
                    onClick={() => {
                      if (occupiedSlot) {
                        setSelectedAppointment(occupiedSlot.appointment);
                      } else {
                        selectTimeSlot(day, slot);
                      }
                    }}
                    onDragOver={(event) => {
                      if (!readOnly && draggingAppointmentId)
                        event.preventDefault();
                    }}
                    onDrop={(event) => {
                      if (!readOnly) void moveAppointment(event, day, slot);
                    }}
                    style={{
                      minHeight: 62,
                      padding: 5,
                      border: 0,
                      borderRight: "1px solid #d7e0dd",
                      borderBottom: "1px solid #d7e0dd",
                      background: occupiedSlot
                        ? statusCellColor(occupiedSlot.appointment.status)
                        : "#ffffff",
                      cursor: occupiedSlot ? "default" : "pointer",
                      textAlign: "left",
                      color: "#183b34",
                      opacity: 1,
                    }}
                    title={
                      occupiedSlot
                        ? "Drag this appointment to an open time"
                        : "Create an appointment at this time"
                    }
                  >
                    {occupiedSlot && (
                      <span
                        draggable={!readOnly && occupiedSlot.isFirstSlot}
                        onDragStart={(event) => {
                          if (readOnly || !occupiedSlot.isFirstSlot) return;
                          event.stopPropagation();
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData(
                            "text/plain",
                            occupiedSlot.appointment.id,
                          );
                          setDraggingAppointmentId(occupiedSlot.appointment.id);
                        }}
                        onDragEnd={() => setDraggingAppointmentId(null)}
                        style={{
                          display: "block",
                          height: "100%",
                          minHeight: 44,
                          padding: "6px 7px",
                          borderRadius: occupiedSlot.isFirstSlot
                            ? "6px 6px 0 0"
                            : 0,
                          background: statusColor(
                            occupiedSlot.appointment.status,
                          ),
                          color: "white",
                          fontSize: 12,
                          lineHeight: 1.25,
                          cursor:
                            !readOnly && occupiedSlot.isFirstSlot
                              ? "grab"
                              : occupiedSlot.isFirstSlot
                                ? "pointer"
                                : "default",
                        }}
                      >
                        {occupiedSlot.isFirstSlot ? (
                          <>
                            <strong>
                              {petName(occupiedSlot.appointment.id)}
                            </strong>
                            <br />
                            {serviceName(occupiedSlot.appointment.id)}
                            <br />
                            <span style={{ opacity: 0.85 }}>
                              {formatStatus(occupiedSlot.appointment.status)}
                            </span>
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

      {selectedAppointment && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 300,
            display: "grid",
            placeItems: "center",
            padding: 20,
            background: "rgba(18, 44, 38, 0.58)",
          }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setSelectedAppointment(null);
          }}
        >
          <section
            className="dashboard-panel"
            style={{
              width: "min(680px, 100%)",
              margin: 0,
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 20,
              }}
            >
              <div>
                <p className="eyebrow">Appointment details</p>
                <h2 style={{ marginTop: 5 }}>
                  {petName(selectedAppointment.id)} —{" "}
                  {serviceName(selectedAppointment.id)}
                </h2>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setSelectedAppointment(null)}
              >
                Close
              </button>
            </div>

            {readOnly && (
              <p
                style={{
                  padding: "10px 12px",
                  borderRadius: 7,
                  background: "#fff3c4",
                  color: "#594710",
                  fontWeight: 700,
                }}
              >
                Read-only support view
              </p>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 18,
                margin: "24px 0",
              }}
            >
              <div>
                <p className="eyebrow">Client</p>
                <strong>{clientName(selectedAppointment.client_id)}</strong>
              </div>
              <div>
                <p className="eyebrow">Pet</p>
                <strong>{petName(selectedAppointment.id)}</strong>
              </div>
              <div>
                <p className="eyebrow">Service</p>
                <strong>{serviceName(selectedAppointment.id)}</strong>
              </div>
              <div>
                <p className="eyebrow">Staff</p>
                <strong>{staffName(selectedAppointment.id)}</strong>
              </div>
              <div>
                <p className="eyebrow">Date</p>
                <strong>
                  {new Date(selectedAppointment.start_at).toLocaleDateString(
                    undefined,
                    {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    },
                  )}
                </strong>
              </div>
              <div>
                <p className="eyebrow">Time</p>
                <strong>
                  {new Date(selectedAppointment.start_at).toLocaleTimeString(
                    [],
                    {
                      hour: "numeric",
                      minute: "2-digit",
                    },
                  )}
                  {" – "}
                  {new Date(selectedAppointment.end_at).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </strong>
              </div>
            </div>

            <div style={{ marginBottom: 22 }}>
              <p className="eyebrow">Client notes</p>
              <p>{selectedAppointment.client_notes || "No client notes."}</p>
              <p className="eyebrow">Internal notes</p>
              <p>
                {selectedAppointment.internal_notes || "No internal notes."}
              </p>
            </div>

            <div>
              <p className="eyebrow">Status</p>
              <h3>{formatStatus(selectedAppointment.status)}</h3>

              {!readOnly && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {[
                    ["confirmed", "Confirmed"],
                    ["checked_in", "Checked in"],
                    ["in_progress", "In progress"],
                    ["ready_for_pickup", "Ready for pickup"],
                    ["completed", "Completed"],
                    ["cancelled", "Cancelled"],
                    ["no_show", "No-show"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={
                        selectedAppointment.status === value
                          ? "primary-button"
                          : "secondary-button"
                      }
                      disabled={updatingStatus}
                      onClick={() => void updateAppointmentStatus(value)}
                    >
                      {label}
                    </button>
                  ))}
                  {selectedAppointment.status !== "completed" && (
                    <button
                      type="button"
                      className="primary-button"
                      disabled={updatingStatus}
                      onClick={openReadyNotification}
                    >
                      Notify ready for pickup
                    </button>
                  )}
                </div>
              )}
            </div>

            {showNotification && !readOnly && (
              <form
                className="notification-composer"
                onSubmit={sendReadyNotification}
              >
                <div>
                  <p className="eyebrow">Client notification</p>
                  <h3>Ready for pickup</h3>
                </div>
                <label>
                  Send by
                  <select
                    value={notificationChannel}
                    onChange={(event) =>
                      setNotificationChannel(event.target.value)
                    }
                  >
                    <option value="email">Email</option>
                    <option value="sms">Text message</option>
                    <option value="both">Email and text</option>
                  </select>
                </label>
                <label>
                  Message
                  <textarea
                    rows={4}
                    maxLength={1000}
                    required
                    value={notificationBody}
                    onChange={(event) =>
                      setNotificationBody(event.target.value)
                    }
                  />
                </label>
                {(notificationChannel === "sms" ||
                  notificationChannel === "both") && (
                  <label className="notification-consent">
                    <input
                      type="checkbox"
                      required
                      checked={confirmSmsConsent}
                      onChange={(event) =>
                        setConfirmSmsConsent(event.target.checked)
                      }
                    />{" "}
                    I confirm this client consented to receive text messages.
                  </label>
                )}
                <div className="notification-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setShowNotification(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      void updateAppointmentStatus("ready_for_pickup");
                      setShowNotification(false);
                    }}
                  >
                    Mark ready without sending
                  </button>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={sendingNotification}
                  >
                    {sendingNotification ? "Sending…" : "Send notification"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default Calendar;
