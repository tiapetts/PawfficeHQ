import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

type ClientsProps = {
  businessId: string;
};

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
};

type ClientForm = typeof emptyForm;

export default function Clients({ businessId }: ClientsProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadClients() {
      const { data, error } = await supabase
        .from("CLIENT")
        .select(
          `
          id,
          FirstName,
          LastName,
          PhoneNumber,
          EmailAddress,
          StreetAddress,
          AptNumber,
          ClientCity,
          ClientState,
          ClientZip
        `,
        )
        .eq("business_id", businessId)
        .order("LastName")
        .order("FirstName");

      if (error) {
        console.error(error);
        setMessage(error.message);
      } else {
        setClients(data ?? []);
      }

      setLoading(false);
    }

    loadClients();
  }, [businessId]);

  function updateField(field: keyof ClientForm, value: string) {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const { data, error } = await supabase
      .from("CLIENT")
      .insert({
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
      })
      .select(
        `
        id,
        FirstName,
        LastName,
        PhoneNumber,
        EmailAddress,
        StreetAddress,
        AptNumber,
        ClientCity,
        ClientState,
        ClientZip
      `,
      )
      .single();

    if (error) {
      console.error(error);
      setMessage(error.message);
      setSaving(false);
      return;
    }

    setClients((currentClients) =>
      [...currentClients, data].sort((a, b) =>
        `${a.LastName} ${a.FirstName}`.localeCompare(
          `${b.LastName} ${b.FirstName}`,
        ),
      ),
    );

    setForm(emptyForm);
    setShowForm(false);
    setSaving(false);
  }

  return (
    <>
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Contacts</p>
          <h2>Clients</h2>
        </div>

        <button
          className="primary-button"
          onClick={() => {
            setShowForm(!showForm);
            setMessage("");
          }}
        >
          {showForm ? "Cancel" : "+ Add client"}
        </button>
      </header>

      {message && (
        <p className="error-message" role="alert">
          {message}
        </p>
      )}

      {showForm && (
        <section className="dashboard-panel client-form-panel">
          <h3>New client</h3>

          <form className="client-form" onSubmit={handleSubmit}>
            <label>
              First name
              <input
                type="text"
                value={form.FirstName}
                onChange={(event) =>
                  updateField("FirstName", event.target.value)
                }
                required
              />
            </label>

            <label>
              Last name
              <input
                type="text"
                value={form.LastName}
                onChange={(event) =>
                  updateField("LastName", event.target.value)
                }
                required
              />
            </label>

            <label>
              Phone number
              <input
                type="tel"
                value={form.PhoneNumber}
                onChange={(event) =>
                  updateField("PhoneNumber", event.target.value)
                }
              />
            </label>

            <label>
              Email address
              <input
                type="email"
                value={form.EmailAddress}
                onChange={(event) =>
                  updateField("EmailAddress", event.target.value)
                }
              />
            </label>

            <label className="full-width">
              Street address
              <input
                type="text"
                value={form.StreetAddress}
                onChange={(event) =>
                  updateField("StreetAddress", event.target.value)
                }
              />
            </label>

            <label>
              Apartment/unit
              <input
                type="text"
                value={form.AptNumber}
                onChange={(event) =>
                  updateField("AptNumber", event.target.value)
                }
              />
            </label>

            <label>
              City
              <input
                type="text"
                value={form.ClientCity}
                onChange={(event) =>
                  updateField("ClientCity", event.target.value)
                }
              />
            </label>

            <label>
              State
              <input
                type="text"
                maxLength={2}
                placeholder="WI"
                value={form.ClientState}
                onChange={(event) =>
                  updateField("ClientState", event.target.value.toUpperCase())
                }
              />
            </label>

            <label>
              ZIP code
              <input
                type="text"
                inputMode="numeric"
                value={form.ClientZip}
                onChange={(event) =>
                  updateField("ClientZip", event.target.value)
                }
              />
            </label>

            <div className="full-width form-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={saving}
              >
                {saving ? "Saving client..." : "Save client"}
              </button>
            </div>
          </form>
        </section>
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
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
