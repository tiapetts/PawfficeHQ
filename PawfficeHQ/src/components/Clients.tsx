import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import ClientImportExport from "./ClientImportExport";
import "./ClientEditing.css";

type ClientsProps = { businessId: string; readOnly?: boolean };
type Client = {
  id: number;
  FirstName: string;
  LastName: string;
  PhoneNumber: string | null;
  EmailAddress: string | null;
  StreetAddress: string | null;
  AptNumber: string | null;
  ClientCity: string | null;
  ClientState: string | null;
  ClientZip: string | null;
  booking_deposit_required: boolean;
  booking_deposit_type: "fixed" | "percentage";
  booking_deposit_value: number;
  booking_deposit_reason: string | null;
};
const emptyForm = {
  FirstName: "",
  LastName: "",
  PhoneNumber: "",
  EmailAddress: "",
  StreetAddress: "",
  AptNumber: "",
  ClientCity: "",
  ClientState: "",
  ClientZip: "",
  booking_deposit_required: false,
  booking_deposit_type: "fixed" as "fixed" | "percentage",
  booking_deposit_value: "",
  booking_deposit_reason: "",
};
type ClientForm = typeof emptyForm;
const selection =
  "id, FirstName, LastName, PhoneNumber, EmailAddress, StreetAddress, AptNumber, ClientCity, ClientState, ClientZip, booking_deposit_required, booking_deposit_type, booking_deposit_value, booking_deposit_reason";

export default function Clients({
  businessId,
  readOnly = false,
}: ClientsProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showMigration, setShowMigration] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function loadClients() {
    const { data, error } = await supabase
      .from("CLIENT")
      .select(selection)
      .eq("business_id", businessId)
      .order("LastName")
      .order("FirstName");
    if (error) {
      console.error(error);
      setMessage(error.message);
      setSuccess(false);
    } else setClients((data as Client[] | null) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void loadClients();
  }, [businessId]);

  function updateField<K extends keyof ClientForm>(
    field: K,
    value: ClientForm[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setMessage("");
    setSuccess(false);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openEdit(client: Client) {
    setEditingId(client.id);
    setForm({
      FirstName: client.FirstName,
      LastName: client.LastName,
      PhoneNumber: client.PhoneNumber ?? "",
      EmailAddress: client.EmailAddress ?? "",
      StreetAddress: client.StreetAddress ?? "",
      AptNumber: client.AptNumber ?? "",
      ClientCity: client.ClientCity ?? "",
      ClientState: client.ClientState ?? "",
      ClientZip: client.ClientZip ?? "",
      booking_deposit_required: client.booking_deposit_required,
      booking_deposit_type: client.booking_deposit_type,
      booking_deposit_value:
        client.booking_deposit_value > 0
          ? String(client.booking_deposit_value)
          : "",
      booking_deposit_reason: client.booking_deposit_reason ?? "",
    });
    setMessage("");
    setSuccess(false);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setSuccess(false);
    const wasEditing = editingId !== null;
    const values = {
      business_id: businessId,
      FirstName: form.FirstName.trim(),
      LastName: form.LastName.trim(),
      PhoneNumber: form.PhoneNumber.trim() || null,
      EmailAddress: form.EmailAddress.trim() || null,
      StreetAddress: form.StreetAddress.trim() || null,
      AptNumber: form.AptNumber.trim() || null,
      ClientCity: form.ClientCity.trim() || null,
      ClientState: form.ClientState.trim().toUpperCase() || null,
      ClientZip: form.ClientZip.trim() || null,
      booking_deposit_required: form.booking_deposit_required,
      booking_deposit_type: form.booking_deposit_type,
      booking_deposit_value: form.booking_deposit_required
        ? Number(form.booking_deposit_value)
        : 0,
      booking_deposit_reason: form.booking_deposit_required
        ? form.booking_deposit_reason.trim() || null
        : null,
    };

    const query = editingId
      ? supabase
          .from("CLIENT")
          .update(values)
          .eq("id", editingId)
          .eq("business_id", businessId)
      : supabase.from("CLIENT").insert(values);
    const { error } = await query;
    setSaving(false);
    if (error) {
      console.error(error);
      setMessage(error.message);
      return;
    }
    closeForm();
    await loadClients();
    setSuccess(true);
    setMessage(wasEditing ? "Client changes saved." : "Client added.");
  }

  return (
    <>
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Contacts</p>
          <h2>Clients</h2>
        </div>
        {!readOnly && (
          <div className="client-header-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowMigration((current) => !current)}
            >
              {showMigration ? "Close import/export" : "Import / Export"}
            </button>
            <button
              className="primary-button"
              onClick={showForm ? closeForm : openNew}
            >
              {showForm ? "Cancel" : "+ Add client"}
            </button>
          </div>
        )}
      </header>
      {message && (
        <p
          className={success ? "client-success" : "error-message"}
          role="status"
        >
          {message}
        </p>
      )}

      {showForm && !readOnly && (
        <section className="dashboard-panel client-form-panel">
          <div className="client-form-title">
            <div>
              <p className="eyebrow">
                {editingId ? "Client profile" : "New contact"}
              </p>
              <h3>{editingId ? "Edit client" : "New client"}</h3>
            </div>
            {editingId && <span>Client #{editingId}</span>}
          </div>
          <form className="client-form" onSubmit={handleSubmit}>
            <label>
              First name
              <input
                value={form.FirstName}
                onChange={(e) => updateField("FirstName", e.target.value)}
                required
              />
            </label>
            <label>
              Last name
              <input
                value={form.LastName}
                onChange={(e) => updateField("LastName", e.target.value)}
                required
              />
            </label>
            <label>
              Phone number
              <input
                type="tel"
                value={form.PhoneNumber}
                onChange={(e) => updateField("PhoneNumber", e.target.value)}
              />
            </label>
            <label>
              Email address
              <input
                type="email"
                value={form.EmailAddress}
                onChange={(e) => updateField("EmailAddress", e.target.value)}
              />
            </label>
            <label className="full-width">
              Street address
              <input
                value={form.StreetAddress}
                onChange={(e) => updateField("StreetAddress", e.target.value)}
              />
            </label>
            <label>
              Apartment/unit
              <input
                value={form.AptNumber}
                onChange={(e) => updateField("AptNumber", e.target.value)}
              />
            </label>
            <label>
              City
              <input
                value={form.ClientCity}
                onChange={(e) => updateField("ClientCity", e.target.value)}
              />
            </label>
            <label>
              State
              <input
                maxLength={2}
                placeholder="WI"
                value={form.ClientState}
                onChange={(e) =>
                  updateField("ClientState", e.target.value.toUpperCase())
                }
              />
            </label>
            <label>
              ZIP code
              <input
                inputMode="numeric"
                value={form.ClientZip}
                onChange={(e) => updateField("ClientZip", e.target.value)}
              />
            </label>
            <div className="full-width client-deposit-settings">
              <label className="client-deposit-toggle">
                <input
                  type="checkbox"
                  checked={form.booking_deposit_required}
                  onChange={(e) =>
                    updateField("booking_deposit_required", e.target.checked)
                  }
                />
                <span>
                  <strong>Require a deposit for future bookings</strong>
                  <small>
                    New appointments for this client will require a deposit
                    before confirmation.
                  </small>
                </span>
              </label>

              {form.booking_deposit_required && (
                <div className="client-deposit-fields">
                  <label>
                    Deposit type
                    <select
                      value={form.booking_deposit_type}
                      onChange={(e) =>
                        updateField(
                          "booking_deposit_type",
                          e.target.value as "fixed" | "percentage",
                        )
                      }
                    >
                      <option value="fixed">Fixed amount</option>
                      <option value="percentage">Percentage</option>
                    </select>
                  </label>
                  <label>
                    {form.booking_deposit_type === "fixed"
                      ? "Deposit amount"
                      : "Deposit percentage"}
                    <input
                      type="number"
                      min="0.01"
                      max={
                        form.booking_deposit_type === "percentage"
                          ? 100
                          : undefined
                      }
                      step="0.01"
                      value={form.booking_deposit_value}
                      onChange={(e) =>
                        updateField("booking_deposit_value", e.target.value)
                      }
                      required
                    />
                  </label>
                  <label className="full-width">
                    Internal reason
                    <textarea
                      rows={3}
                      value={form.booking_deposit_reason}
                      onChange={(e) =>
                        updateField("booking_deposit_reason", e.target.value)
                      }
                      placeholder="For example: Deposit required after a missed appointment."
                    />
                  </label>
                </div>
              )}
            </div>
            <div className="full-width form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeForm}
              >
                Cancel
              </button>
              <button className="primary-button" disabled={saving}>
                {saving
                  ? "Saving…"
                  : editingId
                    ? "Save changes"
                    : "Save client"}
              </button>
            </div>
          </form>
        </section>
      )}

      {showMigration && !readOnly && (
        <ClientImportExport
          businessId={businessId}
          clients={clients}
          onImported={loadClients}
        />
      )}

      <section className="dashboard-panel">
        {loading ? (
          <p>Loading clients...</p>
        ) : clients.length === 0 ? (
          <div className="empty-state">
            <h3>No clients yet</h3>
            <p>Add your first client to begin their profile.</p>
          </div>
        ) : (
          <div className="client-list">
            {clients.map((client) => (
              <article className="client-row" key={client.id}>
                <div className="client-avatar">
                  {client.FirstName.charAt(0)}
                  {client.LastName.charAt(0)}
                </div>
                <div className="client-name">
                  <strong>
                    {client.FirstName} {client.LastName}
                  </strong>
                  <span>{client.EmailAddress || "No email listed"}</span>
                  {client.booking_deposit_required && (
                    <span className="client-deposit-badge">
                      Deposit required ·{" "}
                      {client.booking_deposit_type === "percentage"
                        ? `${client.booking_deposit_value}%`
                        : `$${Number(client.booking_deposit_value).toFixed(2)}`}
                    </span>
                  )}
                </div>
                <div>
                  <span className="client-detail-label">Phone</span>
                  <p>{client.PhoneNumber || "Not listed"}</p>
                </div>
                <div>
                  <span className="client-detail-label">Location</span>
                  <p>
                    {[client.ClientCity, client.ClientState]
                      .filter(Boolean)
                      .join(", ") || "Not listed"}
                  </p>
                </div>
                {!readOnly && (
                  <button
                    className="client-edit-button"
                    type="button"
                    onClick={() => openEdit(client)}
                  >
                    Edit
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
