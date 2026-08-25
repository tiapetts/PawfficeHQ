import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import ClientImportExport from "./ClientImportExport";
import PetImportExport from "./PetImportExport";
import ProfilePhoto from "./ProfilePhoto";
import "./ClientEditing.css";
import "./RecordSearch.css";

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
  profile_photo_path: string | null;
  archived_at: string | null;
  archive_reason: string | null;
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
  "id, FirstName, LastName, PhoneNumber, EmailAddress, StreetAddress, AptNumber, ClientCity, ClientState, ClientZip, booking_deposit_required, booking_deposit_type, booking_deposit_value, booking_deposit_reason, profile_photo_path, archived_at, archive_reason";

export default function Clients({
  businessId,
  readOnly = false,
}: ClientsProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showMigration, setShowMigration] = useState(false);
  const [listMode, setListMode] = useState<"active" | "archived">("active");
  const [search, setSearch] = useState("");
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

  async function archiveClient(client: Client) {
    const reason = window.prompt(
      `Why are you archiving ${client.FirstName} ${client.LastName}?`,
      "No longer receiving services",
    );
    if (reason === null) return;
    const { error } = await supabase
      .from("CLIENT")
      .update({ archived_at: new Date().toISOString(), archive_reason: reason.trim() || null })
      .eq("id", client.id)
      .eq("business_id", businessId);
    if (error) {
      setSuccess(false);
      setMessage(error.message);
      return;
    }
    if (editingId === client.id) closeForm();
    await loadClients();
    setSuccess(true);
    setMessage(`${client.FirstName} ${client.LastName} was archived. Their history was preserved.`);
  }

  async function restoreClient(client: Client) {
    const { error } = await supabase
      .from("CLIENT")
      .update({ archived_at: null, archive_reason: null })
      .eq("id", client.id)
      .eq("business_id", businessId);
    if (error) {
      setSuccess(false);
      setMessage(error.message);
      return;
    }
    await loadClients();
    setSuccess(true);
    setMessage(`${client.FirstName} ${client.LastName} was restored.`);
  }

  const searchQuery = search.trim().toLowerCase();
  const visibleClients = clients.filter((client) => {
    const inList = listMode === "archived" ? client.archived_at !== null : client.archived_at === null;
    if (!inList || !searchQuery) return inList;
    return [client.FirstName, client.LastName, client.EmailAddress, client.PhoneNumber, client.StreetAddress, client.ClientCity, client.ClientState, client.ClientZip]
      .filter(Boolean).join(" ").toLowerCase().includes(searchQuery);
  });

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
          {editingId !== null && (
            <div className="profile-photo-section">
              <ProfilePhoto
                businessId={businessId}
                entity="clients"
                table="CLIENT"
                recordId={editingId}
                photoPath={clients.find((client) => client.id === editingId)?.profile_photo_path ?? null}
                initials={`${form.FirstName.charAt(0)}${form.LastName.charAt(0)}`}
                label={`${form.FirstName} ${form.LastName}`.trim() || "Client"}
                editable
                onChanged={loadClients}
              />
            </div>
          )}
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
        <>
          <ClientImportExport
            businessId={businessId}
            clients={clients}
            onImported={loadClients}
          />
          <PetImportExport businessId={businessId} />
        </>
      )}

      <section className="record-search-bar">
        <label><span>Search clients</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, phone, or location" /></label>
        <strong>{visibleClients.length} {visibleClients.length === 1 ? "client" : "clients"}</strong>
        {search && <button className="secondary-button" type="button" onClick={() => setSearch("")}>Clear</button>}
      </section>
      <div className="record-list-filter" role="group" aria-label="Client status">
        <button type="button" className={listMode === "active" ? "active" : ""} onClick={() => setListMode("active")}>
          Active ({clients.filter((client) => !client.archived_at).length})
        </button>
        <button type="button" className={listMode === "archived" ? "active" : ""} onClick={() => setListMode("archived")}>
          Archived ({clients.filter((client) => client.archived_at).length})
        </button>
      </div>

      <section className="dashboard-panel">
        {loading ? (
          <p>Loading clients...</p>
        ) : visibleClients.length === 0 ? (
          <div className="empty-state">
            <h3>{search ? "No matching clients" : listMode === "archived" ? "No archived clients" : "No active clients yet"}</h3>
            <p>{search ? "Try another name, email, phone number, or location." : listMode === "archived" ? "Archived client profiles will appear here." : "Add your first client to begin their profile."}</p>
          </div>
        ) : (
          <div className="client-list">
            {visibleClients.map((client) => (
              <article className="client-row" key={client.id}>
                <ProfilePhoto
                  businessId={businessId}
                  entity="clients"
                  table="CLIENT"
                  recordId={client.id}
                  photoPath={client.profile_photo_path}
                  initials={`${client.FirstName.charAt(0)}${client.LastName.charAt(0)}`}
                  label={`${client.FirstName} ${client.LastName}`}
                  compact
                />
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
                  {client.archived_at && (
                    <span className="archive-reason">Archived · {client.archive_reason || "No reason provided"}</span>
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
                  <div className="record-actions">
                    {client.archived_at ? (
                      <button className="client-edit-button" type="button" onClick={() => void restoreClient(client)}>Restore</button>
                    ) : (
                      <>
                        <button className="client-edit-button" type="button" onClick={() => openEdit(client)}>Edit</button>
                        <button className="archive-button" type="button" onClick={() => void archiveClient(client)}>Archive</button>
                      </>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
