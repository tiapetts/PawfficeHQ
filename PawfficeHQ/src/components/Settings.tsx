import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import "./Settings.css";

type SettingsProps = {
  businessId: string;
  readOnly?: boolean;
  onSaved?: (businessName: string, logoUrl: string | null) => void;
};

type SettingsForm = {
  business_name: string;
  phone: string;
  email: string;
  website: string;
  street_address: string;
  city: string;
  state: string;
  zip: string;
  time_zone: string;
  description: string;
  logo_url: string | null;
  theme_preset: string;
  primary_color: string;
  accent_color: string;
};

const defaults: SettingsForm = {
  business_name: "",
  phone: "",
  email: "",
  website: "",
  street_address: "",
  city: "",
  state: "",
  zip: "",
  time_zone: "America/Chicago",
  description: "",
  logo_url: null,
  theme_preset: "pawffice",
  primary_color: "#183f37",
  accent_color: "#32685c",
};

const themes = [
  {
    id: "pawffice",
    name: "Pawffice Classic",
    primary: "#183f37",
    accent: "#32685c",
  },
  { id: "ocean", name: "Ocean Blue", primary: "#183b56", accent: "#2f718f" },
  { id: "berry", name: "Berry", primary: "#55263f", accent: "#8b4868" },
  { id: "lavender", name: "Lavender", primary: "#41385f", accent: "#7365a0" },
  { id: "sand", name: "Warm Sand", primary: "#55402d", accent: "#96724e" },
];

function contrastText(hex: string) {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((index) =>
    parseInt(value.slice(index, index + 2), 16),
  );
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#173a35" : "#ffffff";
}

export function applyBusinessTheme(primary: string, accent: string) {
  const root = document.documentElement;
  root.style.setProperty("--brand-primary", primary);
  root.style.setProperty("--brand-accent", accent);
  root.style.setProperty("--brand-on-primary", contrastText(primary));
  root.style.setProperty("--brand-on-accent", contrastText(accent));
}

function Settings({ businessId, readOnly = false, onSaved }: SettingsProps) {
  const [form, setForm] = useState<SettingsForm>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.rpc("get_business_settings", {
        p_business_id: businessId,
      });
      if (error) {
        setMessage(error.message);
        setIsError(true);
      } else if (data) {
        const loaded = { ...defaults, ...(data as SettingsForm) };
        setForm(loaded);
        applyBusinessTheme(loaded.primary_color, loaded.accent_color);
      }
      setLoading(false);
    }
    void load();
  }, [businessId]);

  function update<K extends keyof SettingsForm>(
    key: K,
    value: SettingsForm[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function chooseTheme(theme: (typeof themes)[number]) {
    setForm((current) => ({
      ...current,
      theme_preset: theme.id,
      primary_color: theme.primary,
      accent_color: theme.accent,
    }));
    applyBusinessTheme(theme.primary, theme.accent);
  }

  async function uploadLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setMessage("Logo files must be smaller than 2 MB.");
      setIsError(true);
      return;
    }
    setUploading(true);
    setMessage("");
    const path = `${businessId}/logo`;
    const { error } = await supabase.storage
      .from("business-branding")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      setMessage(error.message);
      setIsError(true);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage
      .from("business-branding")
      .getPublicUrl(path);
    update("logo_url", `${data.publicUrl}?v=${Date.now()}`);
    setUploading(false);
    setMessage("Logo uploaded. Save settings to finish.");
    setIsError(false);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setIsError(false);
    const { error } = await supabase.rpc("save_business_settings", {
      p_business_id: businessId,
      p_business_name: form.business_name,
      p_phone: form.phone,
      p_email: form.email,
      p_website: form.website,
      p_street_address: form.street_address,
      p_city: form.city,
      p_state: form.state,
      p_zip: form.zip,
      p_time_zone: form.time_zone,
      p_description: form.description,
      p_logo_url: form.logo_url,
      p_theme_preset: form.theme_preset,
      p_primary_color: form.primary_color,
      p_accent_color: form.accent_color,
    });
    setSaving(false);
    if (error) {
      setMessage(error.message);
      setIsError(true);
      return;
    }
    applyBusinessTheme(form.primary_color, form.accent_color);
    onSaved?.(form.business_name, form.logo_url);
    setMessage("Business settings saved.");
  }

  if (loading) return <p>Loading settings…</p>;

  return (
    <form onSubmit={save}>
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Business controls</p>
          <h2>Settings</h2>
        </div>
        {!readOnly && (
          <button className="primary-button" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        )}
      </header>
      {message && (
        <p className={isError ? "error-message" : "settings-success"}>
          {message}
        </p>
      )}

      <div className="settings-layout">
        <section className="dashboard-panel settings-section">
          <div>
            <p className="eyebrow">Profile</p>
            <h3>Business information</h3>
            <p className="settings-help">
              Used across your dashboard, messages, receipts, and future client
              portal.
            </p>
          </div>
          <div className="settings-form-grid">
            <label>
              Business name
              <input
                required
                disabled={readOnly}
                value={form.business_name}
                onChange={(e) => update("business_name", e.target.value)}
              />
            </label>
            <label>
              Business email
              <input
                type="email"
                disabled={readOnly}
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
              />
            </label>
            <label>
              Phone
              <input
                type="tel"
                disabled={readOnly}
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
              />
            </label>
            <label>
              Website
              <input
                type="url"
                placeholder="https://"
                disabled={readOnly}
                value={form.website}
                onChange={(e) => update("website", e.target.value)}
              />
            </label>
            <label className="settings-full">
              Street address
              <input
                disabled={readOnly}
                value={form.street_address}
                onChange={(e) => update("street_address", e.target.value)}
              />
            </label>
            <label>
              City
              <input
                disabled={readOnly}
                value={form.city}
                onChange={(e) => update("city", e.target.value)}
              />
            </label>
            <label>
              State
              <input
                disabled={readOnly}
                value={form.state}
                onChange={(e) => update("state", e.target.value)}
              />
            </label>
            <label>
              ZIP code
              <input
                disabled={readOnly}
                value={form.zip}
                onChange={(e) => update("zip", e.target.value)}
              />
            </label>
            <label>
              Time zone
              <select
                disabled={readOnly}
                value={form.time_zone}
                onChange={(e) => update("time_zone", e.target.value)}
              >
                <option value="America/New_York">Eastern</option>
                <option value="America/Chicago">Central</option>
                <option value="America/Denver">Mountain</option>
                <option value="America/Los_Angeles">Pacific</option>
                <option value="America/Anchorage">Alaska</option>
                <option value="Pacific/Honolulu">Hawaii</option>
              </select>
            </label>
            <label className="settings-full">
              Business description
              <textarea
                rows={4}
                disabled={readOnly}
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="dashboard-panel settings-section">
          <div>
            <p className="eyebrow">Branding</p>
            <h3>Logo and appearance</h3>
            <p className="settings-help">
              Make Pawffice HQ feel like your business while keeping every
              screen readable.
            </p>
          </div>
          <div className="logo-control">
            <div className="logo-preview">
              {form.logo_url ? (
                <img src={form.logo_url} alt="Business logo preview" />
              ) : (
                <span>
                  {form.business_name.slice(0, 2).toUpperCase() || "HQ"}
                </span>
              )}
            </div>
            {!readOnly && (
              <label className="logo-upload">
                {uploading ? "Uploading…" : "Upload logo"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  disabled={uploading}
                  onChange={uploadLogo}
                />
              </label>
            )}
            <small>PNG, JPG, WebP, or SVG. Maximum 2 MB.</small>
          </div>
          <div className="theme-grid">
            {themes.map((theme) => (
              <button
                key={theme.id}
                type="button"
                disabled={readOnly}
                className={`theme-option ${form.theme_preset === theme.id ? "selected" : ""}`}
                onClick={() => chooseTheme(theme)}
              >
                <span className="theme-swatches">
                  <i style={{ background: theme.primary }} />
                  <i style={{ background: theme.accent }} />
                </span>
                <strong>{theme.name}</strong>
              </button>
            ))}
          </div>
          <div className="color-grid">
            <label>
              Primary color
              <span className="color-control">
                <input
                  type="color"
                  disabled={readOnly}
                  value={form.primary_color}
                  onChange={(e) => {
                    update("primary_color", e.target.value);
                    update("theme_preset", "custom");
                    applyBusinessTheme(e.target.value, form.accent_color);
                  }}
                />
                <code>{form.primary_color}</code>
              </span>
            </label>
            <label>
              Accent color
              <span className="color-control">
                <input
                  type="color"
                  disabled={readOnly}
                  value={form.accent_color}
                  onChange={(e) => {
                    update("accent_color", e.target.value);
                    update("theme_preset", "custom");
                    applyBusinessTheme(form.primary_color, e.target.value);
                  }}
                />
                <code>{form.accent_color}</code>
              </span>
            </label>
          </div>
        </section>
      </div>
    </form>
  );
}

export default Settings;
