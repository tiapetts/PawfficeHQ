import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import "./Settings.css";

type SettingsProps = {
  businessId: string;
  readOnly?: boolean;
  onSaved?: (businessName: string, logoUrl: string | null) => void;
};

type DayHours = { open: boolean; start: string; end: string };
type DayName =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";
type BusinessHours = Record<DayName, DayHours>;

type StripeConnectionStatus = {
  account_status:
    | "not_connected"
    | "onboarding"
    | "restricted"
    | "active"
    | "disabled";
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements_currently_due: unknown[];
  onboarding_started_at: string | null;
  connected_at: string | null;
  updated_at: string | null;
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
  business_hours: BusinessHours;
  appointment_interval: number;
  calendar_start: string;
  calendar_end: string;
  week_starts_on: number;
  cancellation_notice_hours: number;
  allow_double_booking: boolean;
  auto_complete_past: boolean;
  default_appointment_status: string;
};

const defaultHours: BusinessHours = {
  monday: { open: true, start: "08:00", end: "17:00" },
  tuesday: { open: true, start: "08:00", end: "17:00" },
  wednesday: { open: true, start: "08:00", end: "17:00" },
  thursday: { open: true, start: "08:00", end: "17:00" },
  friday: { open: true, start: "08:00", end: "17:00" },
  saturday: { open: false, start: "08:00", end: "17:00" },
  sunday: { open: false, start: "08:00", end: "17:00" },
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
  business_hours: defaultHours,
  appointment_interval: 30,
  calendar_start: "08:00",
  calendar_end: "18:00",
  week_starts_on: 1,
  cancellation_notice_hours: 24,
  allow_double_booking: false,
  auto_complete_past: false,
  default_appointment_status: "confirmed",
};

const defaultStripeStatus: StripeConnectionStatus = {
  account_status: "not_connected",
  charges_enabled: false,
  payouts_enabled: false,
  details_submitted: false,
  requirements_currently_due: [],
  onboarding_started_at: null,
  connected_at: null,
  updated_at: null,
};

const days: Array<{ key: DayName; label: string }> = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

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
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62
    ? "#173a35"
    : "#ffffff";
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
  const [stripeStatus, setStripeStatus] =
    useState<StripeConnectionStatus>(defaultStripeStatus);
  const [stripeLoading, setStripeLoading] = useState(true);
  const [stripeConnecting, setStripeConnecting] = useState(false);
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
        const value = data as Partial<SettingsForm>;
        const loaded: SettingsForm = {
          ...defaults,
          ...value,
          business_hours: { ...defaultHours, ...(value.business_hours ?? {}) },
        };
        setForm(loaded);
        applyBusinessTheme(loaded.primary_color, loaded.accent_color);
      }
      setLoading(false);
    }
    void load();
  }, [businessId]);

  useEffect(() => {
    async function loadStripeStatus() {
      setStripeLoading(true);

      const { data: syncedData, error: syncError } =
        await supabase.functions.invoke("sync-stripe-account", {
          body: { businessId },
        });

      if (!syncError && syncedData && !syncedData.error) {
        setStripeStatus({
          ...defaultStripeStatus,
          ...(syncedData as Partial<StripeConnectionStatus>),
        });
        setStripeLoading(false);
        return;
      }

      console.error(
        "Stripe status sync error:",
        syncError ?? syncedData?.error,
      );

      const { data: savedData, error: savedError } = await supabase.rpc(
        "get_stripe_connection_status",
        { p_business_id: businessId },
      );

      if (savedError) {
        setMessage(savedError.message);
        setIsError(true);
      } else if (savedData) {
        setStripeStatus({
          ...defaultStripeStatus,
          ...(savedData as Partial<StripeConnectionStatus>),
        });
      }

      setStripeLoading(false);
    }

    void loadStripeStatus();
  }, [businessId]);

  function update<K extends keyof SettingsForm>(
    key: K,
    value: SettingsForm[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateDay(day: DayName, change: Partial<DayHours>) {
    setForm((current) => ({
      ...current,
      business_hours: {
        ...current.business_hours,
        [day]: { ...current.business_hours[day], ...change },
      },
    }));
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

    const { error: profileError } = await supabase.rpc(
      "save_business_settings",
      {
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
      },
    );

    if (profileError) {
      setSaving(false);
      setMessage(profileError.message);
      setIsError(true);
      return;
    }

    const { error: operationsError } = await supabase.rpc(
      "save_business_operations",
      {
        p_business_id: businessId,
        p_business_hours: form.business_hours,
        p_appointment_interval: form.appointment_interval,
        p_calendar_start: form.calendar_start,
        p_calendar_end: form.calendar_end,
        p_week_starts_on: form.week_starts_on,
        p_cancellation_notice_hours: form.cancellation_notice_hours,
        p_allow_double_booking: form.allow_double_booking,
        p_auto_complete_past: form.auto_complete_past,
        p_default_appointment_status: form.default_appointment_status,
      },
    );

    setSaving(false);
    if (operationsError) {
      setMessage(operationsError.message);
      setIsError(true);
      return;
    }
    applyBusinessTheme(form.primary_color, form.accent_color);
    onSaved?.(form.business_name, form.logo_url);
    setMessage("Business and scheduling settings saved.");
  }

  async function connectStripe() {
    setStripeConnecting(true);
    setMessage("");
    setIsError(false);

    const returnUrl = `${window.location.origin}${window.location.pathname}`;
    const { data, error } = await supabase.functions.invoke(
      "create-stripe-onboarding",
      {
        body: {
          businessId,
          returnUrl,
        },
      },
    );

    if (error) {
      console.error("Stripe onboarding error:", error);
      setMessage(error.message || "Stripe onboarding could not be started.");
      setIsError(true);
      setStripeConnecting(false);
      return;
    }

    const onboardingUrl = String(data?.url ?? "");

    if (!onboardingUrl.startsWith("https://")) {
      setMessage(data?.error || "Stripe did not return an onboarding link.");
      setIsError(true);
      setStripeConnecting(false);
      return;
    }

    window.location.assign(onboardingUrl);
  }

  function stripeStatusLabel() {
    if (stripeLoading) return "Checking connection…";
    if (stripeStatus.account_status === "active") return "Connected and ready";
    if (stripeStatus.account_status === "restricted") return "Action required";
    if (stripeStatus.account_status === "disabled") return "Payments disabled";
    if (stripeStatus.account_status === "onboarding")
      return "Setup in progress";
    return "Not connected";
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

        <section className="dashboard-panel settings-section">
          <div>
            <p className="eyebrow">Payments</p>
            <h3>Stripe payment processing</h3>
            <p className="settings-help">
              Connect this business to Stripe so client card payments can be
              deposited into the business&apos;s own Stripe account.
            </p>
          </div>

          <div>
            <p>
              <strong>Status: {stripeStatusLabel()}</strong>
            </p>

            {stripeStatus.account_status === "active" && (
              <p className="settings-help">
                Card payments and payouts are enabled for this business.
              </p>
            )}

            {stripeStatus.account_status === "onboarding" && (
              <p className="settings-help">
                Stripe setup has been started. Continue onboarding to complete
                the remaining business and bank-account information.
              </p>
            )}

            {!readOnly && stripeStatus.account_status !== "active" && (
              <button
                type="button"
                className="primary-button"
                disabled={stripeLoading || stripeConnecting}
                onClick={() => void connectStripe()}
              >
                {stripeConnecting
                  ? "Opening Stripe…"
                  : stripeStatus.account_status === "not_connected"
                    ? "Connect Stripe"
                    : "Continue Stripe setup"}
              </button>
            )}

            {readOnly && (
              <p className="settings-help">
                Stripe connection changes are unavailable in read-only support
                view.
              </p>
            )}
          </div>
        </section>

        <section className="dashboard-panel settings-section">
          <div>
            <p className="eyebrow">Scheduling</p>
            <h3>Business hours</h3>
            <p className="settings-help">
              Set the hours shown on your calendar and used for future online
              booking.
            </p>
          </div>
          <div className="hours-list">
            {days.map(({ key, label }) => {
              const hours = form.business_hours[key];
              return (
                <div
                  className={`hours-row ${hours.open ? "" : "closed"}`}
                  key={key}
                >
                  <label className="day-toggle">
                    <input
                      type="checkbox"
                      disabled={readOnly}
                      checked={hours.open}
                      onChange={(e) =>
                        updateDay(key, { open: e.target.checked })
                      }
                    />
                    <span>{label}</span>
                  </label>
                  {hours.open ? (
                    <div className="hours-time-range">
                      <label>
                        Opens
                        <input
                          type="time"
                          disabled={readOnly}
                          value={hours.start}
                          onChange={(e) =>
                            updateDay(key, { start: e.target.value })
                          }
                        />
                      </label>
                      <span>to</span>
                      <label>
                        Closes
                        <input
                          type="time"
                          disabled={readOnly}
                          value={hours.end}
                          onChange={(e) =>
                            updateDay(key, { end: e.target.value })
                          }
                        />
                      </label>
                    </div>
                  ) : (
                    <strong>Closed</strong>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="dashboard-panel settings-section">
          <div>
            <p className="eyebrow">Calendar</p>
            <h3>Scheduling preferences</h3>
            <p className="settings-help">
              Control how appointments and available time appear for your team.
            </p>
          </div>
          <div className="settings-form-grid">
            <label>
              Appointment interval
              <select
                disabled={readOnly}
                value={form.appointment_interval}
                onChange={(e) =>
                  update("appointment_interval", Number(e.target.value))
                }
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>60 minutes</option>
              </select>
            </label>
            <label>
              Week starts on
              <select
                disabled={readOnly}
                value={form.week_starts_on}
                onChange={(e) =>
                  update("week_starts_on", Number(e.target.value))
                }
              >
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
              </select>
            </label>
            <label>
              Calendar starts
              <input
                type="time"
                disabled={readOnly}
                value={form.calendar_start}
                onChange={(e) => update("calendar_start", e.target.value)}
              />
            </label>
            <label>
              Calendar ends
              <input
                type="time"
                disabled={readOnly}
                value={form.calendar_end}
                onChange={(e) => update("calendar_end", e.target.value)}
              />
            </label>
            <label>
              Cancellation notice
              <input
                type="number"
                min={0}
                max={720}
                disabled={readOnly}
                value={form.cancellation_notice_hours}
                onChange={(e) =>
                  update("cancellation_notice_hours", Number(e.target.value))
                }
              />
              <small>Hours required before an appointment.</small>
            </label>
            <label>
              New appointment status
              <select
                disabled={readOnly}
                value={form.default_appointment_status}
                onChange={(e) =>
                  update("default_appointment_status", e.target.value)
                }
              >
                <option value="confirmed">Confirmed</option>
                <option value="requested">Requested</option>
              </select>
            </label>
          </div>
          <div className="settings-switches">
            <label>
              <input
                type="checkbox"
                disabled={readOnly}
                checked={form.allow_double_booking}
                onChange={(e) =>
                  update("allow_double_booking", e.target.checked)
                }
              />
              <span>
                <strong>Allow double-booking</strong>
                <small>
                  Permit overlapping appointments for the same time.
                </small>
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                disabled={readOnly}
                checked={form.auto_complete_past}
                onChange={(e) => update("auto_complete_past", e.target.checked)}
              />
              <span>
                <strong>Automatically complete past appointments</strong>
                <small>
                  Move unfinished appointments to completed after their end
                  time.
                </small>
              </span>
            </label>
          </div>
        </section>
      </div>
    </form>
  );
}

export default Settings;
