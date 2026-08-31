import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import BusinessModules from "./BusinessModules";
import SquareConnection from "./SquareConnection";
import "./Settings.css";

type SettingsProps = {
  businessId: string;
  readOnly?: boolean;
  onSaved?: (businessName: string, logoUrl: string | null) => void;
  onModulesChanged?: (enabled: Array<"grooming"|"pet_sitting"|"boarding_daycare"|"veterinary">) => void;
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

type NotificationSettings = {
  push_enabled: boolean;
  new_request_enabled: boolean;
  appointment_reminder_enabled: boolean;
  appointment_status_enabled: boolean;
  payment_enabled: boolean;
  reminder_minutes_before: number;
  daily_digest_enabled: boolean;
  daily_digest_time: string;
};

type PushState =
  | "checking"
  | "unsupported"
  | "blocked"
  | "disabled"
  | "enabled";

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
  primary_color: "#00b4d8",
  accent_color: "#0077b6",
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

const defaultNotificationSettings: NotificationSettings = {
  push_enabled: false,
  new_request_enabled: true,
  appointment_reminder_enabled: true,
  appointment_status_enabled: true,
  payment_enabled: true,
  reminder_minutes_before: 60,
  daily_digest_enabled: false,
  daily_digest_time: "08:00",
};

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

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
    primary: "#00b4d8",
    accent: "#0077b6",
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
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5
    ? "#173a35"
    : "#ffffff";
}

export function applyBusinessTheme(primary: string, accent: string) {
  // Automatically upgrade businesses still using the original Pawffice colors.
  const resolvedPrimary = primary.toLowerCase() === "#183f37" ? "#00b4d8" : primary;
  const resolvedAccent = accent.toLowerCase() === "#32685c" ? "#0077b6" : accent;
  const root = document.documentElement;
  root.style.setProperty("--brand-primary", resolvedPrimary);
  root.style.setProperty("--brand-accent", resolvedAccent);
  root.style.setProperty("--brand-on-primary", contrastText(resolvedPrimary));
  root.style.setProperty("--brand-on-accent", contrastText(resolvedAccent));
}

function Settings({ businessId, readOnly = false, onSaved, onModulesChanged }: SettingsProps) {
  const [form, setForm] = useState<SettingsForm>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stripeStatus, setStripeStatus] =
    useState<StripeConnectionStatus>(defaultStripeStatus);
  const [stripeLoading, setStripeLoading] = useState(true);
  const [stripeConnecting, setStripeConnecting] = useState(false);
  const [notificationSettings, setNotificationSettings] =
    useState<NotificationSettings>(defaultNotificationSettings);
  const [notificationLoading, setNotificationLoading] = useState(true);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [pushChanging, setPushChanging] = useState(false);
  const [pushTesting, setPushTesting] = useState(false);
  const [pushState, setPushState] = useState<PushState>("checking");
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
    async function loadNotifications() {
      setNotificationLoading(true);

      const { data, error } = await supabase
        .from("business_notification_settings")
        .select(
          "push_enabled, new_request_enabled, appointment_reminder_enabled, appointment_status_enabled, payment_enabled, reminder_minutes_before, daily_digest_enabled, daily_digest_time",
        )
        .eq("business_id", businessId)
        .maybeSingle();

      if (error) {
        console.error("Notification settings error:", error);
        setMessage(error.message);
        setIsError(true);
      } else if (data) {
        setNotificationSettings({
          ...defaultNotificationSettings,
          ...(data as Partial<NotificationSettings>),
        });
      }

      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        setPushState("unsupported");
      } else if (Notification.permission === "denied") {
        setPushState("blocked");
      } else {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setPushState(subscription ? "enabled" : "disabled");
      }

      setNotificationLoading(false);
    }

    void loadNotifications();
  }, [businessId]);

  function updateNotification<K extends keyof NotificationSettings>(
    key: K,
    value: NotificationSettings[K],
  ) {
    setNotificationSettings((current) => ({ ...current, [key]: value }));
  }

  async function saveNotificationSettings() {
    setNotificationSaving(true);
    setMessage("");
    setIsError(false);

    const { error } = await supabase
      .from("business_notification_settings")
      .upsert(
        {
          business_id: businessId,
          ...notificationSettings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "business_id" },
      );

    setNotificationSaving(false);
    if (error) {
      setMessage(error.message);
      setIsError(true);
      return;
    }

    setMessage("Notification preferences saved.");
  }

  async function enablePushNotifications() {
    setPushChanging(true);
    setMessage("");
    setIsError(false);

    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error(
          "Push notifications are not supported by this browser.",
        );
      }

      const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        throw new Error(
          "The VAPID public key is missing from this deployment.",
        );
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState(permission === "denied" ? "blocked" : "disabled");
        throw new Error("Notification permission was not granted.");
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const json = subscription.toJSON();
      const { data: userData, error: userError } =
        await supabase.auth.getUser();
      if (userError || !userData.user)
        throw new Error("You must be signed in.");
      if (!json.keys?.p256dh || !json.keys.auth) {
        throw new Error("The browser did not return complete push keys.");
      }

      const { error } = await supabase.from("push_subscription").upsert(
        {
          business_id: businessId,
          auth_user_id: userData.user.id,
          endpoint: subscription.endpoint,
          p256dh_key: json.keys.p256dh,
          auth_key: json.keys.auth,
          device_name: navigator.userAgent,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );
      if (error) throw error;

      const updated = { ...notificationSettings, push_enabled: true };
      const { error: settingsError } = await supabase
        .from("business_notification_settings")
        .upsert(
          {
            business_id: businessId,
            ...updated,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "business_id" },
        );
      if (settingsError) throw settingsError;

      setNotificationSettings(updated);
      setPushState("enabled");
      setMessage("Push notifications are enabled on this device.");
    } catch (error) {
      console.error("Push notification error:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Push notifications could not be enabled.",
      );
      setIsError(true);
    } finally {
      setPushChanging(false);
    }
  }

  async function disablePushNotifications() {
    setPushChanging(true);
    setMessage("");
    setIsError(false);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        const { error } = await supabase
          .from("push_subscription")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("endpoint", endpoint);
        if (error) throw error;
      }

      setPushState("disabled");
      setMessage("Push notifications are disabled on this device.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Push notifications could not be disabled.",
      );
      setIsError(true);
    } finally {
      setPushChanging(false);
    }
  }
  async function sendTestPushNotification() {
    setPushTesting(true);
    setMessage("");
    setIsError(false);

    const { data, error } = await supabase.functions.invoke(
      "send-push-notification",
      {
        body: {
          businessId,
          title: "Pawffice HQ test",
          body: "Hoozah! Push notifications are working on this device.",
          url: "/",
        },
      },
    );

    setPushTesting(false);

    if (error) {
      console.error("Test push error:", error);
      setMessage(error.message || "The test notification could not be sent.");
      setIsError(true);
      return;
    }

    if (!data?.success) {
      setMessage(
        data?.error || "The test notification could not be delivered.",
      );
      setIsError(true);
      return;
    }

    const delivered = Number(data.delivered ?? 1);

    setMessage(
      `Test notification sent to ${delivered} device${
        delivered === 1 ? "" : "s"
      }.`,
    );
  }

  function pushStateLabel() {
    if (pushState === "enabled") return "Enabled on this device";
    if (pushState === "blocked") return "Blocked in browser settings";
    if (pushState === "unsupported") return "Not supported by this browser";
    if (pushState === "checking") return "Checking…";
    return "Not enabled on this device";
  }

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
        <BusinessModules businessId={businessId} readOnly={readOnly} onChanged={onModulesChanged} />
        <SquareConnection businessId={businessId} readOnly={readOnly} />
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
            <p className="eyebrow">Notifications</p>
            <h3>Business alerts</h3>
            <p className="settings-help">
              Choose which alerts your team receives. Push permission is saved
              separately for each phone, tablet, or computer.
            </p>
          </div>

          {notificationLoading ? (
            <p>Loading notification settings…</p>
          ) : (
            <div className="notification-preferences">
              <p className="notification-device-status">
                <strong>Device status: {pushStateLabel()}</strong>
              </p>

              {!readOnly && pushState === "enabled" && (
                <div className="form-actions">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={pushTesting || pushChanging}
                    onClick={() => void sendTestPushNotification()}
                  >
                    {pushTesting ? "Sending test…" : "Send test notification"}
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    disabled={pushChanging || pushTesting}
                    onClick={() => void disablePushNotifications()}
                  >
                    {pushChanging ? "Updating…" : "Disable on this device"}
                  </button>
                </div>
              )}

              {!readOnly &&
                pushState !== "enabled" &&
                pushState !== "unsupported" &&
                pushState !== "blocked" && (
                  <div className="notification-device-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={pushChanging}
                      onClick={() => void enablePushNotifications()}
                    >
                      {pushChanging ? "Enabling…" : "Enable on this device"}
                    </button>
                  </div>
                )}

              {pushState === "blocked" && (
                <p className="settings-help">
                  Allow notifications for Pawffice HQ in this browser&apos;s
                  site settings, then reload this page.
                </p>
              )}

              <div className="settings-switches">
                <label>
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={notificationSettings.new_request_enabled}
                    onChange={(event) =>
                      updateNotification(
                        "new_request_enabled",
                        event.target.checked,
                      )
                    }
                  />
                  <span>
                    <strong>New appointment requests</strong>
                    <small>
                      Alert the team when a requested booking arrives.
                    </small>
                  </span>
                </label>

                <label>
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={notificationSettings.appointment_reminder_enabled}
                    onChange={(event) =>
                      updateNotification(
                        "appointment_reminder_enabled",
                        event.target.checked,
                      )
                    }
                  />
                  <span>
                    <strong>Upcoming appointment reminders</strong>
                    <small>Remind the team before an appointment begins.</small>
                  </span>
                </label>

                <label>
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={notificationSettings.appointment_status_enabled}
                    onChange={(event) =>
                      updateNotification(
                        "appointment_status_enabled",
                        event.target.checked,
                      )
                    }
                  />
                  <span>
                    <strong>Appointment status changes</strong>
                    <small>
                      Alert the team about cancellations and updates.
                    </small>
                  </span>
                </label>

                <label>
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={notificationSettings.payment_enabled}
                    onChange={(event) =>
                      updateNotification(
                        "payment_enabled",
                        event.target.checked,
                      )
                    }
                  />
                  <span>
                    <strong>Payments and refunds</strong>
                    <small>
                      Alert the team when money is received or refunded.
                    </small>
                  </span>
                </label>

                <label>
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={notificationSettings.daily_digest_enabled}
                    onChange={(event) =>
                      updateNotification(
                        "daily_digest_enabled",
                        event.target.checked,
                      )
                    }
                  />
                  <span>
                    <strong>Daily schedule summary</strong>
                    <small>
                      Send a morning overview of the day&apos;s appointments.
                    </small>
                  </span>
                </label>
              </div>

              <div className="settings-form-grid">
                <label>
                  Remind me before appointments
                  <select
                    disabled={
                      readOnly ||
                      !notificationSettings.appointment_reminder_enabled
                    }
                    value={notificationSettings.reminder_minutes_before}
                    onChange={(event) =>
                      updateNotification(
                        "reminder_minutes_before",
                        Number(event.target.value),
                      )
                    }
                  >
                    <option value={15}>15 minutes before</option>
                    <option value={30}>30 minutes before</option>
                    <option value={60}>1 hour before</option>
                    <option value={120}>2 hours before</option>
                    <option value={1440}>1 day before</option>
                  </select>
                </label>

                <label>
                  Daily summary time
                  <input
                    type="time"
                    disabled={
                      readOnly || !notificationSettings.daily_digest_enabled
                    }
                    value={notificationSettings.daily_digest_time}
                    onChange={(event) =>
                      updateNotification(
                        "daily_digest_time",
                        event.target.value,
                      )
                    }
                  />
                </label>
              </div>

              {!readOnly && (
                <div className="notification-save-actions">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={notificationSaving}
                    onClick={() => void saveNotificationSettings()}
                  >
                    {notificationSaving
                      ? "Saving…"
                      : "Save notification preferences"}
                  </button>
                </div>
              )}
            </div>
          )}
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
