import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

type ServicesProps = {
  businessId: string;
};

type Service = {
  id: string | number;
  name: string;
  category: string;
  description: string | null;
  duration_minutes: number;
  base_price: number;
  is_active: boolean;
};

const emptyForm = {
  name: "",
  category: "",
  description: "",
  durationMinutes: "",
  basePrice: "",
};

type ServiceForm = typeof emptyForm;

export default function Services({ businessId }: ServicesProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadServices() {
      const { data, error } = await supabase
        .from("service")
        .select(
          `
          id,
          name,
          category,
          description,
          duration_minutes,
          base_price,
          is_active
        `,
        )
        .eq("business_id", businessId)
        .order("category")
        .order("name");

      if (error) {
        console.error(error);
        setMessage(error.message);
      } else {
        setServices(data ?? []);
      }

      setLoading(false);
    }

    void loadServices();
  }, [businessId]);

  function updateField(field: keyof ServiceForm, value: string) {
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
      .from("service")
      .insert({
        business_id: businessId,
        name: form.name.trim(),
        category: form.category,
        description: form.description.trim() || null,
        duration_minutes: Number(form.durationMinutes),
        base_price: Number(form.basePrice),
        is_active: true,
      })
      .select(
        `
        id,
        name,
        category,
        description,
        duration_minutes,
        base_price,
        is_active
      `,
      )
      .single();

    if (error) {
      console.error(error);
      setMessage(error.message);
      setSaving(false);
      return;
    }

    setServices((currentServices) =>
      [...currentServices, data].sort((a, b) =>
        `${a.category} ${a.name}`.localeCompare(`${b.category} ${b.name}`),
      ),
    );

    setForm(emptyForm);
    setShowForm(false);
    setSaving(false);
  }

  async function toggleService(service: Service) {
    setMessage("");

    const newStatus = !service.is_active;

    const { error } = await supabase
      .from("service")
      .update({
        is_active: newStatus,
      })
      .eq("id", service.id);

    if (error) {
      console.error(error);
      setMessage(error.message);
      return;
    }

    setServices((currentServices) =>
      currentServices.map((currentService) =>
        currentService.id === service.id
          ? {
              ...currentService,
              is_active: newStatus,
            }
          : currentService,
      ),
    );
  }

  return (
    <>
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Business setup</p>
          <h2>Services</h2>
        </div>

        <button
          className="primary-button"
          onClick={() => {
            setShowForm(!showForm);
            setMessage("");
          }}
        >
          {showForm ? "Cancel" : "+ Add service"}
        </button>
      </header>

      {message && (
        <p className="error-message" role="alert">
          {message}
        </p>
      )}

      {showForm && (
        <section className="dashboard-panel client-form-panel">
          <h3>New service</h3>

          <form className="client-form" onSubmit={handleSubmit}>
            <label>
              Service name
              <input
                type="text"
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="Full-service groom"
                required
              />
            </label>

            <label>
              Category
              <select
                value={form.category}
                onChange={(event) =>
                  updateField("category", event.target.value)
                }
                required
              >
                <option value="">Select category</option>
                <option value="Grooming">Grooming</option>
                <option value="Boarding">Boarding</option>
                <option value="Daycare">Daycare</option>
                <option value="Pet Sitting">Pet sitting</option>
                <option value="Dog Walking">Dog walking</option>
                <option value="Veterinary">Veterinary</option>
                <option value="Other">Other</option>
              </select>
            </label>

            <label>
              Duration in minutes
              <input
                type="number"
                min="1"
                step="1"
                value={form.durationMinutes}
                onChange={(event) =>
                  updateField("durationMinutes", event.target.value)
                }
                placeholder="60"
                required
              />
            </label>

            <label>
              Base price
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.basePrice}
                onChange={(event) =>
                  updateField("basePrice", event.target.value)
                }
                placeholder="65.00"
                required
              />
            </label>

            <label className="full-width">
              Description
              <textarea
                value={form.description}
                onChange={(event) =>
                  updateField("description", event.target.value)
                }
                placeholder="Describe what is included."
                rows={4}
              />
            </label>

            <div className="full-width form-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={saving}
              >
                {saving ? "Saving service..." : "Save service"}
              </button>
            </div>
          </form>
        </section>
      )}

      {loading ? (
        <p>Loading services...</p>
      ) : services.length === 0 ? (
        <section className="dashboard-panel">
          <div className="empty-state">
            <h3>No services yet</h3>
            <p>Add your first bookable service and its pricing.</p>
          </div>
        </section>
      ) : (
        <section className="service-grid">
          {services.map((service) => (
            <article
              className={`service-card ${!service.is_active ? "inactive" : ""}`}
              key={service.id}
            >
              <div className="service-card-header">
                <span className="service-category">{service.category}</span>

                <span
                  className={`status-badge ${
                    service.is_active ? "active" : "inactive"
                  }`}
                >
                  {service.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              <h3>{service.name}</h3>

              <p className="service-description">
                {service.description || "No description provided."}
              </p>

              <div className="service-meta">
                <strong>${Number(service.base_price).toFixed(2)}</strong>
                <span>{service.duration_minutes} minutes</span>
              </div>

              <button
                type="button"
                className="secondary-button"
                onClick={() => toggleService(service)}
              >
                {service.is_active ? "Mark inactive" : "Reactivate"}
              </button>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
