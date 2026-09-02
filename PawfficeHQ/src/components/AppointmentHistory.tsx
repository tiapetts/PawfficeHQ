import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import "./AppointmentHistory.css";

type AppointmentHistoryProps = {
  businessId: string;
  onOpenInvoice?: (invoiceId: string) => void;
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
  status_before_cancellation: string | null;
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

type AppointmentInvoice = {
  id: string;
  appointment_id: string | null;
  status: string;
};

type AppointmentPayment = {
  id: string;
  invoice_id: string;
  amount: number;
  status: string;
  provider: string | null;
};

type AppointmentRefund = {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
};

type HistoryFilter =
  | "all"
  | "upcoming"
  | "requested"
  | "completed"
  | "cancelled"
  | "cancelled_or_no_show"
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
  onOpenInvoice,
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
  const [invoices, setInvoices] = useState<AppointmentInvoice[]>([]);
  const [payments, setPayments] = useState<AppointmentPayment[]>([]);
  const [refunds, setRefunds] = useState<AppointmentRefund[]>([]);
  const [activeFilter, setActiveFilter] = useState<HistoryFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<
    string | null
  >(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [payingAppointmentId, setPayingAppointmentId] = useState<string | null>(
    null,
  );
  const [refundPaymentId, setRefundPaymentId] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refunding, setRefunding] = useState(false);
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
        invoicesResult,
        paymentsResult,
        refundsResult,
      ] = await Promise.all([
        supabase
          .from("appointment")
          .select(
            "id, client_id, start_at, end_at, status, status_before_cancellation, client_notes, internal_notes",
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
        supabase
          .from("invoice")
          .select("id, appointment_id, status")
          .eq("business_id", businessId)
          .neq("status", "void"),
        supabase
          .from("payment")
          .select("id, invoice_id, amount, status, provider")
          .eq("business_id", businessId)
          .in("status", ["succeeded", "partially_refunded", "refunded"]),
        supabase
          .from("refund")
          .select("id, payment_id, amount, status")
          .eq("business_id", businessId)
          .in("status", ["pending", "succeeded"]),
      ]);

      const firstError = [
        appointmentsResult.error,
        clientsResult.error,
        petsResult.error,
        servicesResult.error,
        staffResult.error,
        invoicesResult.error,
        paymentsResult.error,
        refundsResult.error,
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
      setInvoices(invoicesResult.data ?? []);
      setPayments(paymentsResult.data ?? []);
      setRefunds(refundsResult.data ?? []);
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
        activeFilter === "cancelled_or_no_show" &&
        !["cancelled", "no_show"].includes(appointment.status)
      ) {
        return false;
      }

      if (
        !["all", "upcoming", "cancelled_or_no_show"].includes(activeFilter) &&
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
    newStatus:
      | "requested"
      | "confirmed"
      | "checked_in"
      | "in_progress"
      | "ready_for_pickup"
      | "completed"
      | "cancelled"
      | "no_show",
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

    const currentAppointment = appointments.find(
      (appointment) => appointment.id === appointmentId,
    );

    if (!currentAppointment) {
      setMessage("The appointment could not be found. Refresh and try again.");
      setUpdatingId(null);
      return;
    }

    const statusBeforeCancellation =
      newStatus === "cancelled"
        ? currentAppointment.status
        : currentAppointment.status === "cancelled"
          ? null
          : currentAppointment.status_before_cancellation;

    const { data, error } = await supabase
      .from("appointment")
      .update({
        status: newStatus,
        status_before_cancellation: statusBeforeCancellation,
      })
      .eq("id", appointmentId)
      .eq("business_id", businessId)
      .select("id, status, status_before_cancellation")
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
          ? {
              ...appointment,
              status: data.status,
              status_before_cancellation: data.status_before_cancellation,
            }
          : appointment,
      ),
    );

    setSelectedAppointmentId(null);
    setUpdatingId(null);
  }

  async function openAppointmentCheckout(appointmentId: string) {
    setPayingAppointmentId(appointmentId);
    setMessage("");

    try {
      const { data: invoiceIdData, error: invoiceError } = await supabase.rpc(
        "create_invoice_from_appointment",
        { p_appointment_id: appointmentId },
      );

      if (invoiceError || !invoiceIdData) {
        throw (
          invoiceError ??
          new Error("The appointment invoice could not be created.")
        );
      }

      const invoiceId = String(invoiceIdData);
      const { data: invoice, error: invoiceStatusError } = await supabase
        .from("invoice")
        .select("id, status")
        .eq("id", invoiceId)
        .single();

      if (invoiceStatusError || !invoice) {
        throw (
          invoiceStatusError ??
          new Error("The appointment invoice could not be loaded.")
        );
      }

      if (invoice.status === "draft") {
        const { error: issueError } = await supabase.rpc("issue_invoice", {
          p_invoice_id: invoiceId,
        });

        if (issueError) throw issueError;
      } else if (
        !["open", "partially_paid", "overdue"].includes(invoice.status)
      ) {
        throw new Error(
          invoice.status === "paid"
            ? "This appointment is already paid."
            : "This appointment is not currently available for payment.",
        );
      }

      onOpenInvoice?.(invoiceId);
    } catch (error) {
      console.error("Appointment checkout error:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "The invoice could not be opened.",
      );
      setPayingAppointmentId(null);
    }
  }

  function openRefundForm(payment: AppointmentPayment, refundable: number) {
    setRefundPaymentId(payment.id);
    setRefundAmount(refundable.toFixed(2));
    setRefundReason("");
    setMessage("");
  }

  async function issueRefund(
    event: FormEvent<HTMLFormElement>,
    refundable: number,
  ) {
    event.preventDefault();
    if (!refundPaymentId) return;

    const amount = Number(refundAmount);

    if (!Number.isFinite(amount) || amount <= 0 || amount > refundable) {
      setMessage(
        `Enter an amount between $0.01 and $${refundable.toFixed(2)}.`,
      );
      return;
    }

    if (!refundReason.trim()) {
      setMessage("Enter an internal reason for the refund.");
      return;
    }

    if (
      !window.confirm(
        `Refund $${amount.toFixed(2)} to the client's original card?`,
      )
    ) {
      return;
    }

    setRefunding(true);
    setMessage("");

    const { data, error } = await supabase.functions.invoke(
      "create-stripe-refund",
      {
        body: {
          paymentId: refundPaymentId,
          amount,
          reason: refundReason.trim(),
        },
      },
    );

    const refundData = data as {
      success?: boolean;
      status?: string;
      error?: string;
    } | null;

    if (error || !refundData?.success) {
      console.error("Stripe refund error:", error, refundData);
      setMessage(
        refundData?.error ??
          error?.message ??
          "The refund could not be issued.",
      );
      setRefunding(false);
      return;
    }

    const [invoicesResult, paymentsResult, refundsResult] = await Promise.all([
      supabase
        .from("invoice")
        .select("id, appointment_id, status")
        .eq("business_id", businessId)
        .neq("status", "void"),
      supabase
        .from("payment")
        .select("id, invoice_id, amount, status, provider")
        .eq("business_id", businessId)
        .in("status", ["succeeded", "partially_refunded", "refunded"]),
      supabase
        .from("refund")
        .select("id, payment_id, amount, status")
        .eq("business_id", businessId)
        .in("status", ["pending", "succeeded"]),
    ]);

    if (invoicesResult.data) setInvoices(invoicesResult.data);
    if (paymentsResult.data) setPayments(paymentsResult.data);
    if (refundsResult.data) setRefunds(refundsResult.data);

    setRefundPaymentId(null);
    setRefundAmount("");
    setRefundReason("");
    setRefunding(false);
    setMessage(
      refundData.status === "succeeded"
        ? "Refund completed successfully."
        : "Refund submitted and pending.",
    );
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
        <button type="button" className="history-summary-card clickable-summary-card" onClick={() => setActiveFilter("all")}>
          <span>All appointments</span>
          <strong>{loading ? "—" : summary.total}</strong>
          <small>Show all →</small>
        </button>
        <button type="button" className="history-summary-card clickable-summary-card" onClick={() => setActiveFilter("requested")}>
          <span>Awaiting approval</span>
          <strong>{loading ? "—" : summary.requested}</strong>
          <small>Show requests →</small>
        </button>
        <button type="button" className="history-summary-card clickable-summary-card" onClick={() => setActiveFilter("completed")}>
          <span>Completed</span>
          <strong>{loading ? "—" : summary.completed}</strong>
          <small>Show completed →</small>
        </button>
        <button type="button" className="history-summary-card clickable-summary-card" onClick={() => setActiveFilter("cancelled_or_no_show")}>
          <span>Cancelled / no-show</span>
          <strong>{loading ? "—" : summary.cancelled}</strong>
          <small>Show cancelled →</small>
        </button>
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
              const appointmentInvoice = invoices.find(
                (invoice) => invoice.appointment_id === appointment.id,
              );
              const stripePayment = payments.find(
                (payment) =>
                  payment.invoice_id === appointmentInvoice?.id &&
                  payment.provider === "stripe",
              );
              const refundedAmount = stripePayment
                ? refunds
                    .filter((refund) => refund.payment_id === stripePayment.id)
                    .reduce((total, refund) => total + Number(refund.amount), 0)
                : 0;
              const refundable = stripePayment
                ? Math.max(Number(stripePayment.amount) - refundedAmount, 0)
                : 0;
              const fullyRefunded = Boolean(stripePayment && refundable <= 0);
              const partiallyRefunded = refundedAmount > 0 && !fullyRefunded;
              const paymentComplete = Boolean(stripePayment);

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

                    {paymentComplete ? (
                      <div
                        className="history-record-actions"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="secondary-button"
                          disabled
                        >
                          {fullyRefunded
                            ? "Refunded"
                            : partiallyRefunded
                              ? "Partially refunded"
                              : "Paid"}
                        </button>

                        {!fullyRefunded && stripePayment && (
                          <button
                            type="button"
                            className="history-danger-button"
                            disabled={refunding}
                            onClick={() =>
                              openRefundForm(stripePayment, refundable)
                            }
                          >
                            Refund payment
                          </button>
                        )}

                        {refundPaymentId === stripePayment?.id && (
                          <form
                            onSubmit={(event) =>
                              void issueRefund(event, refundable)
                            }
                            style={{ width: "100%" }}
                          >
                            <label>
                              Refund amount
                              <input
                                type="number"
                                min="0.01"
                                max={refundable.toFixed(2)}
                                step="0.01"
                                value={refundAmount}
                                onChange={(event) =>
                                  setRefundAmount(event.target.value)
                                }
                                required
                              />
                            </label>

                            <label>
                              Internal refund reason
                              <input
                                type="text"
                                maxLength={500}
                                value={refundReason}
                                onChange={(event) =>
                                  setRefundReason(event.target.value)
                                }
                                required
                              />
                            </label>

                            <div className="history-record-actions">
                              <button
                                type="button"
                                className="secondary-button"
                                disabled={refunding}
                                onClick={() => setRefundPaymentId(null)}
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                className="history-danger-button"
                                disabled={refunding}
                              >
                                {refunding ? "Refunding..." : "Issue refund"}
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    ) : !["requested", "cancelled", "no_show", "void"].includes(
                        appointment.status,
                      ) ? (
                      <div
                        className="history-record-actions"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="primary-button"
                          disabled={payingAppointmentId !== null}
                          onClick={() =>
                            void openAppointmentCheckout(appointment.id)
                          }
                        >
                          {payingAppointmentId === appointment.id
                            ? "Opening invoice..."
                            : "Take payment"}
                        </button>
                      </div>
                    ) : null}

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

                        {appointment.status === "no_show" && (
                          <button
                            type="button"
                            className="history-approve-button"
                            disabled={updatingId === appointment.id}
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Undo this no-show and restore the appointment to confirmed?",
                                )
                              ) {
                                void updateAppointmentStatus(
                                  appointment.id,
                                  "confirmed",
                                );
                              }
                            }}
                          >
                            {updatingId === appointment.id
                              ? "Restoring..."
                              : "Undo no-show"}
                          </button>
                        )}

                        {appointment.status === "cancelled" && (
                          <button
                            type="button"
                            className="history-approve-button"
                            disabled={updatingId === appointment.id}
                            onClick={() => {
                              const previousStatus =
                                appointment.status_before_cancellation;

                              const restoreStatus =
                                previousStatus === "requested" ||
                                previousStatus === "confirmed" ||
                                previousStatus === "checked_in" ||
                                previousStatus === "in_progress" ||
                                previousStatus === "ready_for_pickup"
                                  ? previousStatus
                                  : "confirmed";

                              if (
                                window.confirm(
                                  `Undo this cancellation and restore the appointment to ${statusLabels[
                                    restoreStatus
                                  ].toLowerCase()}?`,
                                )
                              ) {
                                void updateAppointmentStatus(
                                  appointment.id,
                                  restoreStatus,
                                );
                              }
                            }}
                          >
                            {updatingId === appointment.id
                              ? "Restoring..."
                              : "Undo cancellation"}
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
