import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import "./Invoices.css";

type InvoicesProps = {
  businessId: string;
  readOnly?: boolean;
};

type Invoice = {
  id: string;
  appointment_id: string | null;
  client_id: number;
  invoice_number: string;
  status: string;
  currency: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  notes: string | null;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  created_at: string;
};

type InvoiceItem = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type Payment = {
  id: string;
  invoice_id: string;
  amount: number;
  tip_amount: number;
  method: string;
  status: string;
  provider: string | null;
  provider_payment_id: string | null;
  reference_note: string | null;
  paid_at: string | null;
  created_at: string;
};

type Refund = {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
  reason: string | null;
  refunded_at: string | null;
  created_at: string;
};

type Appointment = {
  id: string;
  client_id: number;
  start_at: string;
  status: string;
};

type Client = {
  id: number;
  FirstName: string;
  LastName: string;
  EmailAddress: string | null;
  PhoneNumber: string | null;
  StreetAddress: string | null;
  AptNumber: string | null;
  ClientCity: string | null;
  ClientState: string | null;
  ClientZip: string | null;
};

type BusinessSettings = {
  business_name: string;
  phone: string;
  email: string;
  website: string;
  street_address: string;
  city: string;
  state: string;
  zip: string;
  logo_url: string | null;
};

type Pet = {
  id: number;
  PetName: string;
};

type AppointmentPet = {
  appointment_id: string;
  pet_id: number;
};

type InvoiceFilter = "all" | "unpaid" | "draft" | "paid" | "void";

const statusLabels: Record<string, string> = {
  draft: "Draft",
  open: "Open",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
  refunded: "Refunded",
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const emptyPaymentForm = {
  amount: "",
  tipAmount: "",
  method: "cash",
  referenceNote: "",
};

const emptyRefundForm = {
  amount: "",
  reason: "",
};

export default function Invoices({
  businessId,
  readOnly = false,
}: InvoicesProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [appointmentPets, setAppointmentPets] = useState<AppointmentPet[]>([]);
  const [businessSettings, setBusinessSettings] =
    useState<BusinessSettings | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState("");
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(
    null,
  );
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [receiptInvoiceId, setReceiptInvoiceId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  const [refundPaymentId, setRefundPaymentId] = useState<string | null>(null);
  const [refundForm, setRefundForm] = useState(emptyRefundForm);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [filter, setFilter] = useState<InvoiceFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkoutInvoiceId, setCheckoutInvoiceId] = useState<string | null>(
    null,
  );
  const [emailingReceipt, setEmailingReceipt] = useState(false);
  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [receiptMessage, setReceiptMessage] = useState("");

  async function loadInvoices() {
    setLoading(true);
    setMessage("");

    const [
      invoicesResult,
      appointmentsResult,
      clientsResult,
      petsResult,
      appointmentPetsResult,
      settingsResult,
    ] = await Promise.all([
      supabase
        .from("invoice")
        .select(
          "id, appointment_id, client_id, invoice_number, status, currency, subtotal, discount_total, tax_total, total, notes, issued_at, due_at, paid_at, created_at",
        )
        .eq("business_id", businessId)
        .order("created_at", { ascending: false }),
      supabase
        .from("appointment")
        .select("id, client_id, start_at, status")
        .eq("business_id", businessId)
        .order("start_at", { ascending: false }),
      supabase
        .from("CLIENT")
        .select(
          "id, FirstName, LastName, EmailAddress, PhoneNumber, StreetAddress, AptNumber, ClientCity, ClientState, ClientZip",
        )
        .eq("business_id", businessId),
      supabase.from("PET").select("id, PetName").eq("business_id", businessId),
      supabase.from("appointment_pet").select("appointment_id, pet_id"),
      supabase.rpc("get_business_settings", { p_business_id: businessId }),
    ]);

    const firstError = [
      invoicesResult.error,
      appointmentsResult.error,
      clientsResult.error,
      petsResult.error,
      appointmentPetsResult.error,
      settingsResult.error,
    ].find(Boolean);

    if (firstError) {
      console.error(firstError);
      setMessage(firstError.message);
      setLoading(false);
      return;
    }

    const loadedInvoices = invoicesResult.data ?? [];
    const invoiceIds = loadedInvoices.map((invoice) => invoice.id);
    let loadedItems: InvoiceItem[] = [];
    let loadedPayments: Payment[] = [];
    let loadedRefunds: Refund[] = [];

    if (invoiceIds.length > 0) {
      const [itemsResult, paymentsResult] = await Promise.all([
        supabase
          .from("invoice_item")
          .select(
            "id, invoice_id, description, quantity, unit_price, line_total",
          )
          .in("invoice_id", invoiceIds),
        supabase
          .from("payment")
          .select(
            "id, invoice_id, amount, tip_amount, method, status, provider, provider_payment_id, reference_note, paid_at, created_at",
          )
          .in("invoice_id", invoiceIds)
          .order("created_at", { ascending: false }),
      ]);

      const detailError = itemsResult.error || paymentsResult.error;

      if (detailError) {
        console.error(detailError);
        setMessage(detailError.message);
        setLoading(false);
        return;
      }

      loadedItems = itemsResult.data ?? [];
      loadedPayments = paymentsResult.data ?? [];

      const paymentIds = loadedPayments.map((payment) => payment.id);
      if (paymentIds.length > 0) {
        const { data: refundData, error: refundError } = await supabase
          .from("refund")
          .select(
            "id, payment_id, amount, status, reason, refunded_at, created_at",
          )
          .in("payment_id", paymentIds)
          .order("created_at", { ascending: false });

        if (refundError) {
          console.error(refundError);
          setMessage(refundError.message);
          setLoading(false);
          return;
        }

        loadedRefunds = refundData ?? [];
      }
    }

    setInvoices(loadedInvoices);
    setItems(loadedItems);
    setPayments(loadedPayments);
    setRefunds(loadedRefunds);
    setAppointments(appointmentsResult.data ?? []);
    setClients(clientsResult.data ?? []);
    setPets(petsResult.data ?? []);
    setAppointmentPets(appointmentPetsResult.data ?? []);
    setBusinessSettings(
      (settingsResult.data as BusinessSettings | null) ?? null,
    );
    setLoading(false);
  }

  useEffect(() => {
    void loadInvoices();
  }, [businessId]);

  function getClientName(clientId: number) {
    const client = clients.find((item) => item.id === clientId);
    return client ? `${client.FirstName} ${client.LastName}` : "Unknown client";
  }

  function getAppointmentPetName(appointmentId: string) {
    const petIds = appointmentPets
      .filter((link) => link.appointment_id === appointmentId)
      .map((link) => link.pet_id);
    const names = pets
      .filter((pet) => petIds.includes(pet.id))
      .map((pet) => pet.PetName);
    return names.length > 0 ? names.join(", ") : "Unknown pet";
  }

  function getPaidAmount(invoiceId: string) {
    const grossPaid = payments
      .filter(
        (payment) =>
          payment.invoice_id === invoiceId &&
          ["succeeded", "partially_refunded", "refunded"].includes(
            payment.status,
          ),
      )
      .reduce((total, payment) => total + Number(payment.amount), 0);

    const paymentIds = new Set(
      payments
        .filter((payment) => payment.invoice_id === invoiceId)
        .map((payment) => payment.id),
    );
    const refunded = refunds
      .filter(
        (refund) =>
          paymentIds.has(refund.payment_id) && refund.status === "succeeded",
      )
      .reduce((total, refund) => total + Number(refund.amount), 0);

    return Math.max(grossPaid - refunded, 0);
  }

  function getRefundedAmount(paymentId: string, includePending = false) {
    return refunds
      .filter(
        (refund) =>
          refund.payment_id === paymentId &&
          (refund.status === "succeeded" ||
            (includePending && refund.status === "pending")),
      )
      .reduce((total, refund) => total + Number(refund.amount), 0);
  }

  function getRefundableAmount(payment: Payment) {
    return Math.max(
      Number(payment.amount) - getRefundedAmount(payment.id, true),
      0,
    );
  }

  function getBalance(invoice: Invoice) {
    if (["refunded", "void"].includes(invoice.status)) {
      return 0;
    }

    return Math.max(Number(invoice.total) - getPaidAmount(invoice.id), 0);
  }

  const availableAppointments = useMemo(() => {
    const invoicedAppointmentIds = new Set(
      invoices
        .filter((invoice) => invoice.status !== "void")
        .map((invoice) => invoice.appointment_id)
        .filter(Boolean),
    );

    return appointments.filter(
      (appointment) =>
        !invoicedAppointmentIds.has(appointment.id) &&
        !["cancelled", "no_show", "void"].includes(appointment.status),
    );
  }, [appointments, invoices]);

  const filteredInvoices = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return invoices.filter((invoice) => {
      if (
        filter === "unpaid" &&
        !["open", "partially_paid", "overdue"].includes(invoice.status)
      ) {
        return false;
      }
      if (!["all", "unpaid"].includes(filter) && invoice.status !== filter) {
        return false;
      }

      if (normalizedSearch) {
        const appointmentPet = invoice.appointment_id
          ? getAppointmentPetName(invoice.appointment_id)
          : "";
        const searchable = [
          invoice.invoice_number,
          getClientName(invoice.client_id),
          appointmentPet,
          statusLabels[invoice.status] ?? invoice.status,
        ]
          .join(" ")
          .toLowerCase();

        return searchable.includes(normalizedSearch);
      }

      return true;
    });
  }, [appointmentPets, clients, filter, invoices, pets, search]);

  const totals = useMemo(
    () => ({
      outstanding: invoices.reduce(
        (total, invoice) =>
          ["open", "partially_paid", "overdue"].includes(invoice.status)
            ? total + getBalance(invoice)
            : total,
        0,
      ),
      paid: invoices.reduce(
        (total, invoice) => total + getPaidAmount(invoice.id),
        0,
      ),
      drafts: invoices.filter((invoice) => invoice.status === "draft").length,
    }),
    [invoices, payments, refunds],
  );

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAppointmentId) return;

    setSaving(true);
    setMessage("");
    setSuccessMessage("");

    const { data, error } = await supabase.rpc(
      "create_invoice_from_appointment",
      { p_appointment_id: selectedAppointmentId },
    );

    if (error) {
      console.error(error);
      setMessage(error.message);
      setSaving(false);
      return;
    }

    setSelectedAppointmentId("");
    setShowCreateForm(false);
    setExpandedInvoiceId(String(data));
    setSuccessMessage("Draft invoice created.");
    await loadInvoices();
    setSaving(false);
  }

  async function issueInvoice(invoiceId: string) {
    setSaving(true);
    setMessage("");
    setSuccessMessage("");

    const { error } = await supabase.rpc("issue_invoice", {
      p_invoice_id: invoiceId,
    });

    if (error) {
      console.error(error);
      setMessage(error.message);
      setSaving(false);
      return;
    }

    setSuccessMessage("Invoice issued and ready for payment.");
    await loadInvoices();
    setSaving(false);
  }

  async function openStripeCheckout(invoiceId: string) {
    setCheckoutInvoiceId(invoiceId);
    setMessage("");
    setSuccessMessage("");

    const returnUrl = `${window.location.origin}${window.location.pathname}`;
    const { data, error } = await supabase.functions.invoke(
      "create-stripe-checkout",
      {
        body: { invoiceId, returnUrl },
      },
    );

    const checkoutData = data as { url?: string; error?: string } | null;

    if (error || !checkoutData?.url) {
      console.error("Stripe Checkout error:", error, checkoutData);
      setMessage(
        checkoutData?.error ??
          error?.message ??
          "Stripe Checkout could not be opened.",
      );
      setCheckoutInvoiceId(null);
      return;
    }

    window.location.assign(checkoutData.url);
  }

  function openPaymentForm(invoice: Invoice) {
    setPaymentInvoiceId(invoice.id);
    setPaymentForm({
      ...emptyPaymentForm,
      amount: getBalance(invoice).toFixed(2),
    });
    setMessage("");
    setSuccessMessage("");
  }

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paymentInvoiceId) return;

    setSaving(true);
    setMessage("");
    setSuccessMessage("");

    const { error } = await supabase.rpc("record_manual_payment", {
      p_invoice_id: paymentInvoiceId,
      p_amount: Number(paymentForm.amount),
      p_tip_amount: Number(paymentForm.tipAmount || 0),
      p_method: paymentForm.method,
      p_reference_note: paymentForm.referenceNote.trim() || null,
    });

    if (error) {
      console.error(error);
      setMessage(error.message);
      setSaving(false);
      return;
    }

    setPaymentInvoiceId(null);
    setPaymentForm(emptyPaymentForm);
    setSuccessMessage("Payment recorded successfully.");
    await loadInvoices();
    setSaving(false);
  }

  function openRefundForm(payment: Payment) {
    setRefundPaymentId(payment.id);
    setRefundForm({
      amount: getRefundableAmount(payment).toFixed(2),
      reason: "",
    });
    setPaymentInvoiceId(null);
    setMessage("");
    setSuccessMessage("");
  }

  async function issueRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!refundPaymentId) return;

    const amount = Number(refundForm.amount);
    const payment = payments.find((item) => item.id === refundPaymentId);
    if (!payment || !Number.isFinite(amount) || amount <= 0) return;

    const confirmed = window.confirm(
      `Refund ${money.format(amount)} to the client's original card? This cannot be undone from Pawffice HQ.`,
    );
    if (!confirmed) return;

    setSaving(true);
    setMessage("");
    setSuccessMessage("");

    const { data, error } = await supabase.functions.invoke(
      "create-stripe-refund",
      {
        body: {
          paymentId: refundPaymentId,
          amount,
          reason: refundForm.reason.trim(),
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
      setSaving(false);
      return;
    }

    setRefundPaymentId(null);
    setRefundForm(emptyRefundForm);
    setSuccessMessage(
      refundData.status === "succeeded"
        ? "Stripe refund completed successfully."
        : "Stripe refund submitted and is pending.",
    );
    await loadInvoices();
    setSaving(false);
  }

  const receiptInvoice = invoices.find(
    (invoice) => invoice.id === receiptInvoiceId,
  );
  const receiptItems = receiptInvoice
    ? items.filter((item) => item.invoice_id === receiptInvoice.id)
    : [];
  const receiptPayments = receiptInvoice
    ? payments.filter(
        (payment) =>
          payment.invoice_id === receiptInvoice.id &&
          ["succeeded", "partially_refunded", "refunded"].includes(
            payment.status,
          ),
      )
    : [];
  const receiptPaymentIds = new Set(
    receiptPayments.map((payment) => payment.id),
  );
  const receiptRefunds = refunds.filter(
    (refund) =>
      receiptPaymentIds.has(refund.payment_id) && refund.status === "succeeded",
  );
  const receiptRefundTotal = receiptRefunds.reduce(
    (total, refund) => total + Number(refund.amount),
    0,
  );
  const receiptClient = receiptInvoice
    ? clients.find((client) => client.id === receiptInvoice.client_id)
    : undefined;
  const receiptTipTotal = receiptPayments.reduce(
    (total, payment) => total + Number(payment.tip_amount),
    0,
  );

  async function emailReceipt() {
    if (!receiptInvoice) return;

    setEmailingReceipt(true);
    setReceiptMessage("");

    const { data, error } = await supabase.functions.invoke(
      "send-invoice-receipt",
      {
        body: { invoiceId: receiptInvoice.id },
      },
    );

    if (error) {
      console.error(error);
      setReceiptMessage(
        typeof data?.error === "string"
          ? data.error
          : error.message || "Receipt email failed.",
      );
      setEmailingReceipt(false);
      return;
    }

    if (!data?.success) {
      setReceiptMessage(data?.error ?? "Receipt email failed.");
      setEmailingReceipt(false);
      return;
    }

    setReceiptMessage(data.message ?? "Receipt emailed successfully.");
    setEmailingReceipt(false);
  }

  return (
    <>
      <header className="dashboard-header invoice-page-header">
        <div>
          <p className="eyebrow">Payments</p>
          <h2>Invoices</h2>
          <p className="invoice-subtitle">
            Create invoices, track balances, and record payments.
          </p>
        </div>

        {!readOnly && (
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setShowCreateForm((current) => !current);
              setMessage("");
              setSuccessMessage("");
            }}
          >
            {showCreateForm ? "Cancel" : "+ Create invoice"}
          </button>
        )}
      </header>

      {message && (
        <p className="error-message" role="alert">
          {message}
        </p>
      )}
      {successMessage && (
        <p className="invoice-success" role="status">
          {successMessage}
        </p>
      )}

      {showCreateForm && !readOnly && (
        <section className="dashboard-panel invoice-create-panel">
          <div>
            <p className="eyebrow">New invoice</p>
            <h3>Create from appointment</h3>
            <p>
              The booked service and its booking-time price will be copied into
              the invoice.
            </p>
          </div>

          {availableAppointments.length === 0 ? (
            <p>Every eligible appointment already has an invoice.</p>
          ) : (
            <form className="invoice-create-form" onSubmit={createInvoice}>
              <label>
                Appointment
                <select
                  value={selectedAppointmentId}
                  onChange={(event) =>
                    setSelectedAppointmentId(event.target.value)
                  }
                  required
                >
                  <option value="">Choose an appointment</option>
                  {availableAppointments.map((appointment) => (
                    <option key={appointment.id} value={appointment.id}>
                      {new Date(appointment.start_at).toLocaleDateString()} —{" "}
                      {getAppointmentPetName(appointment.id)} —{" "}
                      {getClientName(appointment.client_id)}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="submit"
                className="primary-button"
                disabled={saving}
              >
                {saving ? "Creating..." : "Create draft invoice"}
              </button>
            </form>
          )}
        </section>
      )}

      <section className="invoice-summary-grid">
        <article>
          <span>Outstanding</span>
          <strong>{loading ? "—" : money.format(totals.outstanding)}</strong>
        </article>
        <article>
          <span>Payments received</span>
          <strong>{loading ? "—" : money.format(totals.paid)}</strong>
        </article>
        <article>
          <span>Draft invoices</span>
          <strong>{loading ? "—" : totals.drafts}</strong>
        </article>
      </section>

      <section className="dashboard-panel invoice-list-panel">
        <div className="invoice-toolbar">
          <label>
            <span>Search invoices</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Invoice, client, or pet"
            />
          </label>

          <div className="invoice-filter-tabs" aria-label="Invoice filters">
            {(
              [
                ["all", "All"],
                ["unpaid", "Unpaid"],
                ["draft", "Drafts"],
                ["paid", "Paid"],
                ["void", "Void"],
              ] as Array<[InvoiceFilter, string]>
            ).map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={filter === value ? "active" : ""}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p>Loading invoices...</p>
        ) : filteredInvoices.length === 0 ? (
          <div className="empty-state invoice-empty-state">
            <h3>No invoices found</h3>
            <p>Create one from an appointment or change your filters.</p>
          </div>
        ) : (
          <div className="invoice-list">
            {filteredInvoices.map((invoice) => {
              const invoiceItems = items.filter(
                (item) => item.invoice_id === invoice.id,
              );
              const invoicePayments = payments.filter(
                (payment) => payment.invoice_id === invoice.id,
              );
              const paid = getPaidAmount(invoice.id);
              const balance = getBalance(invoice);
              const expanded = expandedInvoiceId === invoice.id;

              return (
                <article className="invoice-card" key={invoice.id}>
                  <button
                    type="button"
                    className="invoice-card-summary"
                    onClick={() =>
                      setExpandedInvoiceId(expanded ? null : invoice.id)
                    }
                    aria-expanded={expanded}
                  >
                    <div>
                      <span className="invoice-number">
                        {invoice.invoice_number}
                      </span>
                      <h3>{getClientName(invoice.client_id)}</h3>
                      <p>
                        {invoice.appointment_id
                          ? getAppointmentPetName(invoice.appointment_id)
                          : "No appointment attached"}
                        {" · "}
                        {new Date(invoice.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    <span
                      className={`invoice-status invoice-status-${invoice.status}`}
                    >
                      {statusLabels[invoice.status] ?? invoice.status}
                    </span>

                    <div className="invoice-card-amount">
                      <span>Total</span>
                      <strong>{money.format(Number(invoice.total))}</strong>
                      {balance > 0 && invoice.status !== "draft" && (
                        <small>{money.format(balance)} due</small>
                      )}
                    </div>
                  </button>

                  {expanded && (
                    <div className="invoice-card-details">
                      <div className="invoice-line-items">
                        <h4>Invoice items</h4>
                        {invoiceItems.length === 0 ? (
                          <p>No line items were found.</p>
                        ) : (
                          invoiceItems.map((item) => (
                            <div key={item.id}>
                              <span>
                                {item.description}
                                {Number(item.quantity) !== 1
                                  ? ` × ${item.quantity}`
                                  : ""}
                              </span>
                              <strong>
                                {money.format(Number(item.line_total))}
                              </strong>
                            </div>
                          ))
                        )}
                      </div>

                      <dl className="invoice-totals">
                        <div>
                          <dt>Subtotal</dt>
                          <dd>{money.format(Number(invoice.subtotal))}</dd>
                        </div>
                        <div>
                          <dt>Discounts</dt>
                          <dd>
                            −{money.format(Number(invoice.discount_total))}
                          </dd>
                        </div>
                        <div>
                          <dt>Tax</dt>
                          <dd>{money.format(Number(invoice.tax_total))}</dd>
                        </div>
                        <div className="invoice-total-row">
                          <dt>Total</dt>
                          <dd>{money.format(Number(invoice.total))}</dd>
                        </div>
                        <div>
                          <dt>Paid</dt>
                          <dd>{money.format(paid)}</dd>
                        </div>
                        <div className="invoice-balance-row">
                          <dt>Balance</dt>
                          <dd>{money.format(balance)}</dd>
                        </div>
                      </dl>

                      {invoicePayments.length > 0 && (
                        <div className="invoice-payment-history">
                          <h4>Payments</h4>
                          {invoicePayments.map((payment) => (
                            <div
                              className="invoice-payment-entry"
                              key={payment.id}
                            >
                              <span>
                                {payment.method.replaceAll("_", " ")} ·{" "}
                                {new Date(
                                  payment.paid_at ?? payment.created_at,
                                ).toLocaleString()}
                              </span>
                              <strong>
                                {money.format(Number(payment.amount))}
                              </strong>
                              {!readOnly &&
                                Boolean(payment.provider_payment_id) &&
                                ["succeeded", "partially_refunded"].includes(
                                  payment.status,
                                ) &&
                                getRefundableAmount(payment) > 0 && (
                                  <button
                                    type="button"
                                    className="invoice-refund-button"
                                    onClick={() => openRefundForm(payment)}
                                    disabled={saving}
                                  >
                                    Refund
                                  </button>
                                )}
                            </div>
                          ))}
                        </div>
                      )}

                      {refunds.some((refund) =>
                        invoicePayments.some(
                          (payment) => payment.id === refund.payment_id,
                        ),
                      ) && (
                        <div className="invoice-refund-history">
                          <h4>Refunds</h4>
                          {refunds
                            .filter((refund) =>
                              invoicePayments.some(
                                (payment) => payment.id === refund.payment_id,
                              ),
                            )
                            .map((refund) => (
                              <div key={refund.id}>
                                <span>
                                  {refund.status.replaceAll("_", " ")} ·{" "}
                                  {new Date(
                                    refund.refunded_at ?? refund.created_at,
                                  ).toLocaleString()}
                                  {refund.reason ? ` · ${refund.reason}` : ""}
                                </span>
                                <strong>
                                  −{money.format(Number(refund.amount))}
                                </strong>
                              </div>
                            ))}
                        </div>
                      )}

                      {(invoicePayments.length > 0 || !readOnly) && (
                        <div className="invoice-actions">
                          {invoicePayments.length > 0 && (
                            <button
                              type="button"
                              className="invoice-secondary-button"
                              onClick={() => setReceiptInvoiceId(invoice.id)}
                            >
                              View receipt
                            </button>
                          )}
                          {!readOnly && invoice.status === "draft" && (
                            <button
                              type="button"
                              className="primary-button"
                              onClick={() => void issueInvoice(invoice.id)}
                              disabled={saving}
                            >
                              Issue invoice
                            </button>
                          )}
                          {!readOnly &&
                            ["open", "partially_paid", "overdue"].includes(
                              invoice.status,
                            ) &&
                            balance > 0 && (
                              <>
                                <button
                                  type="button"
                                  className="primary-button"
                                  onClick={() =>
                                    void openStripeCheckout(invoice.id)
                                  }
                                  disabled={checkoutInvoiceId !== null}
                                >
                                  {checkoutInvoiceId === invoice.id
                                    ? "Opening Stripe..."
                                    : "Pay online"}
                                </button>

                                <button
                                  type="button"
                                  className="invoice-secondary-button"
                                  onClick={() => openPaymentForm(invoice)}
                                  disabled={checkoutInvoiceId !== null}
                                >
                                  Record other payment
                                </button>
                              </>
                            )}
                        </div>
                      )}

                      {paymentInvoiceId === invoice.id && !readOnly && (
                        <form
                          className="invoice-payment-form"
                          onSubmit={recordPayment}
                        >
                          <h4>Record payment</h4>
                          <label>
                            Payment amount
                            <input
                              type="number"
                              min="0.01"
                              max={balance.toFixed(2)}
                              step="0.01"
                              value={paymentForm.amount}
                              onChange={(event) =>
                                setPaymentForm((current) => ({
                                  ...current,
                                  amount: event.target.value,
                                }))
                              }
                              required
                            />
                          </label>
                          <label>
                            Tip
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={paymentForm.tipAmount}
                              onChange={(event) =>
                                setPaymentForm((current) => ({
                                  ...current,
                                  tipAmount: event.target.value,
                                }))
                              }
                              placeholder="0.00"
                            />
                          </label>
                          <label>
                            Method
                            <select
                              value={paymentForm.method}
                              onChange={(event) =>
                                setPaymentForm((current) => ({
                                  ...current,
                                  method: event.target.value,
                                }))
                              }
                            >
                              <option value="cash">Cash</option>
                              <option value="card">
                                External card terminal
                              </option>
                              <option value="check">Check</option>
                              <option value="gift_card">Gift card</option>
                              <option value="other">Other</option>
                            </select>
                          </label>
                          <label className="invoice-payment-note">
                            Reference note
                            <input
                              type="text"
                              value={paymentForm.referenceNote}
                              onChange={(event) =>
                                setPaymentForm((current) => ({
                                  ...current,
                                  referenceNote: event.target.value,
                                }))
                              }
                              placeholder="Check number or other note"
                            />
                          </label>
                          <div className="invoice-payment-actions">
                            <button
                              type="button"
                              className="invoice-secondary-button"
                              onClick={() => setPaymentInvoiceId(null)}
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="primary-button"
                              disabled={saving}
                            >
                              {saving ? "Recording..." : "Save payment"}
                            </button>
                          </div>
                        </form>
                      )}

                      {refundPaymentId &&
                        invoicePayments.some(
                          (payment) => payment.id === refundPaymentId,
                        ) &&
                        !readOnly && (
                          <form
                            className="invoice-refund-form"
                            onSubmit={issueRefund}
                          >
                            <div>
                              <h4>Refund card payment</h4>
                              <p>
                                The money will be returned through Stripe to the
                                client’s original payment method.
                              </p>
                            </div>

                            <label>
                              Refund amount
                              <input
                                type="number"
                                min="0.01"
                                max={getRefundableAmount(
                                  invoicePayments.find(
                                    (payment) => payment.id === refundPaymentId,
                                  )!,
                                ).toFixed(2)}
                                step="0.01"
                                value={refundForm.amount}
                                onChange={(event) =>
                                  setRefundForm((current) => ({
                                    ...current,
                                    amount: event.target.value,
                                  }))
                                }
                                required
                              />
                            </label>

                            <label className="invoice-refund-note">
                              Internal refund note
                              <input
                                type="text"
                                maxLength={500}
                                value={refundForm.reason}
                                onChange={(event) =>
                                  setRefundForm((current) => ({
                                    ...current,
                                    reason: event.target.value,
                                  }))
                                }
                                placeholder="Why is this payment being refunded?"
                                required
                              />
                            </label>

                            <div className="invoice-refund-actions">
                              <button
                                type="button"
                                className="invoice-secondary-button"
                                onClick={() => {
                                  setRefundPaymentId(null);
                                  setRefundForm(emptyRefundForm);
                                }}
                                disabled={saving}
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                className="invoice-danger-button"
                                disabled={saving}
                              >
                                {saving ? "Refunding..." : "Issue refund"}
                              </button>
                            </div>
                          </form>
                        )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {receiptInvoice && (
        <div
          className="receipt-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`Receipt ${receiptInvoice.invoice_number}`}
        >
          <div className="receipt-sheet">
            <div className="receipt-screen-actions">
              <button
                type="button"
                className="invoice-secondary-button"
                onClick={() => {
                  setReceiptInvoiceId(null);
                  setReceiptMessage("");
                }}
              >
                Close
              </button>
              {!readOnly && (
                <button
                  type="button"
                  className="invoice-secondary-button"
                  onClick={() => void emailReceipt()}
                  disabled={emailingReceipt || !receiptClient?.EmailAddress}
                  title={
                    receiptClient?.EmailAddress
                      ? `Email ${receiptClient.EmailAddress}`
                      : "Add an email address to this client first"
                  }
                >
                  {emailingReceipt
                    ? "Emailing..."
                    : receiptClient?.EmailAddress
                      ? "Email receipt"
                      : "Client email missing"}
                </button>
              )}
              <button
                type="button"
                className="primary-button"
                onClick={() => window.print()}
              >
                Print / Save PDF
              </button>
            </div>

            {receiptMessage && (
              <p className="receipt-email-message" role="status">
                {receiptMessage}
              </p>
            )}

            <header className="receipt-header">
              <div className="receipt-business">
                {businessSettings?.logo_url && (
                  <img
                    src={businessSettings.logo_url}
                    alt={`${businessSettings.business_name} logo`}
                  />
                )}
                <div>
                  <h1>{businessSettings?.business_name ?? "Pawffice HQ"}</h1>
                  {businessSettings?.street_address && (
                    <p>{businessSettings.street_address}</p>
                  )}
                  {(businessSettings?.city || businessSettings?.state) && (
                    <p>
                      {[businessSettings.city, businessSettings.state]
                        .filter(Boolean)
                        .join(", ")}{" "}
                      {businessSettings.zip}
                    </p>
                  )}
                  {businessSettings?.phone && <p>{businessSettings.phone}</p>}
                  {businessSettings?.email && <p>{businessSettings.email}</p>}
                </div>
              </div>

              <div className="receipt-title">
                <p>PAYMENT RECEIPT</p>
                <h2>{receiptInvoice.invoice_number}</h2>
                <span>
                  {new Date(
                    receiptInvoice.paid_at ?? receiptInvoice.created_at,
                  ).toLocaleDateString()}
                </span>
              </div>
            </header>

            <section className="receipt-customer">
              <div>
                <span>Receipt for</span>
                <strong>
                  {receiptClient
                    ? `${receiptClient.FirstName} ${receiptClient.LastName}`
                    : "Client"}
                </strong>
                {receiptClient?.EmailAddress && (
                  <p>{receiptClient.EmailAddress}</p>
                )}
                {receiptClient?.PhoneNumber && (
                  <p>{receiptClient.PhoneNumber}</p>
                )}
              </div>
              <div>
                <span>Pet</span>
                <strong>
                  {receiptInvoice.appointment_id
                    ? getAppointmentPetName(receiptInvoice.appointment_id)
                    : "Not listed"}
                </strong>
              </div>
            </section>

            <section className="receipt-items">
              <div className="receipt-table-heading">
                <span>Description</span>
                <span>Amount</span>
              </div>
              {receiptItems.map((item) => (
                <div key={item.id}>
                  <span>
                    {item.description}
                    {Number(item.quantity) !== 1 ? ` × ${item.quantity}` : ""}
                  </span>
                  <strong>{money.format(Number(item.line_total))}</strong>
                </div>
              ))}
            </section>

            <section className="receipt-summary">
              <div>
                <span>Subtotal</span>
                <strong>{money.format(Number(receiptInvoice.subtotal))}</strong>
              </div>
              {Number(receiptInvoice.discount_total) > 0 && (
                <div>
                  <span>Discounts</span>
                  <strong>
                    −{money.format(Number(receiptInvoice.discount_total))}
                  </strong>
                </div>
              )}
              {Number(receiptInvoice.tax_total) > 0 && (
                <div>
                  <span>Tax</span>
                  <strong>
                    {money.format(Number(receiptInvoice.tax_total))}
                  </strong>
                </div>
              )}
              <div>
                <span>Invoice total</span>
                <strong>{money.format(Number(receiptInvoice.total))}</strong>
              </div>
              {receiptTipTotal > 0 && (
                <div>
                  <span>Tip</span>
                  <strong>{money.format(receiptTipTotal)}</strong>
                </div>
              )}
              {receiptRefundTotal > 0 && (
                <div>
                  <span>Refunded</span>
                  <strong>−{money.format(receiptRefundTotal)}</strong>
                </div>
              )}
              <div className="receipt-paid-total">
                <span>Total paid</span>
                <strong>
                  {money.format(
                    receiptPayments.reduce(
                      (total, payment) =>
                        total +
                        Number(payment.amount) +
                        Number(payment.tip_amount),
                      0,
                    ) - receiptRefundTotal,
                  )}
                </strong>
              </div>
              <div>
                <span>Balance</span>
                <strong>{money.format(getBalance(receiptInvoice))}</strong>
              </div>
            </section>

            <section className="receipt-payment-details">
              <h3>Payment details</h3>
              {receiptPayments.map((payment) => (
                <div key={payment.id}>
                  <span>
                    {payment.method.replaceAll("_", " ")} ·{" "}
                    {new Date(
                      payment.paid_at ?? payment.created_at,
                    ).toLocaleString()}
                  </span>
                  <strong>
                    {money.format(
                      Number(payment.amount) + Number(payment.tip_amount),
                    )}
                  </strong>
                </div>
              ))}
              {receiptRefunds.map((refund) => (
                <div key={refund.id}>
                  <span>
                    Refund ·{" "}
                    {new Date(
                      refund.refunded_at ?? refund.created_at,
                    ).toLocaleString()}
                  </span>
                  <strong>−{money.format(Number(refund.amount))}</strong>
                </div>
              ))}
            </section>

            <footer className="receipt-footer">
              <strong>Thank you for trusting us with your pet!</strong>
              {businessSettings?.website && <p>{businessSettings.website}</p>}
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
