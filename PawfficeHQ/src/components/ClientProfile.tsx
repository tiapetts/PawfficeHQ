import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Client } from "./Clients";
import ProfilePhoto from "./ProfilePhoto";
import ServiceAgreementProfile from "./ServiceAgreementProfile";
import Calendar from "./Calendar";
import "./ClientProfile.css";

type Pet = {
  id: number; PetName: string; species: string | null; PetBreed: string | null;
  PetDOB: string | null; PetWeight: number | null; archived_at: string | null;
};
type AppointmentSummary = {
  last: string | null;
  next: string | null;
  cancellations: number;
  noShows: number;
};
const formatAppointmentDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "None recorded";

type Props = {
  businessId: string; client: Client; onBack: () => void; onEdit?: () => void; onNewAppointment?: () => void;
};

export default function ClientProfile({ businessId, client, onBack, onEdit, onNewAppointment }: Props) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [appointmentSummary, setAppointmentSummary] = useState<AppointmentSummary | null>(null);
  const [appointmentError, setAppointmentError] = useState("");
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [appointmentRefresh, setAppointmentRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const links = await supabase.from("client_pet").select("pet_id").eq("client_id", client.id);
        if (links.error) throw links.error;
        const ids = [...new Set((links.data ?? []).map(row => row.pet_id))];
        const result = ids.length ? await supabase.from("PET")
          .select("id, PetName, species, PetBreed, PetDOB, PetWeight, archived_at")
          .eq("business_id", businessId).in("id", ids).order("PetName") : { data: [], error: null };
        if (result.error) throw result.error;
        if (active) setPets(result.data ?? []);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load this client's pets. Please reopen the profile to retry.");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [businessId, client.id]);
  useEffect(() => {
    let active = true;
    async function loadAppointmentSummary() {
      setAppointmentSummary(null);
      setAppointmentError("");
      const now = new Date().toISOString();
      const base = () => supabase.from("appointment").select("start_at")
        .eq("business_id", businessId).eq("client_id", client.id);
      const [last, next, cancelled, noShows] = await Promise.all([
        base().lt("start_at", now).not("status", "in", '("cancelled","void","no_show")')
          .order("start_at", { ascending: false }).limit(1),
        base().gte("start_at", now).not("status", "in", '("cancelled","void","no_show")')
          .order("start_at", { ascending: true }).limit(1),
        supabase.from("appointment").select("id", { count: "exact", head: true })
          .eq("business_id", businessId).eq("client_id", client.id).eq("status", "cancelled"),
        supabase.from("appointment").select("id", { count: "exact", head: true })
          .eq("business_id", businessId).eq("client_id", client.id).eq("status", "no_show"),
      ]);
      if (!active) return;
      const failure = [last.error, next.error, cancelled.error, noShows.error].find(Boolean);
      if (failure) {
        setAppointmentError("Unable to load appointment history.");
        return;
      }
      setAppointmentSummary({
        last: last.data?.[0]?.start_at ?? null,
        next: next.data?.[0]?.start_at ?? null,
        cancellations: cancelled.count ?? 0,
        noShows: noShows.count ?? 0,
      });
    }
    void loadAppointmentSummary();
    return () => { active = false; };
  }, [businessId, client.id, appointmentRefresh]);
  const address = [
    client.StreetAddress, client.AptNumber,
    [client.ClientCity, client.ClientState, client.ClientZip].filter(Boolean).join(" "),
  ].filter(Boolean);
  return <section className="client-profile">
    <button type="button" className="secondary-button" onClick={onBack}>← Back to clients</button>
    <header className="dashboard-header">
      <div><p className="eyebrow">Client profile</p><h2>{client.FirstName} {client.LastName}</h2>
        {client.archived_at && <p>Archived · {client.archive_reason || "No reason provided"}</p>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {onNewAppointment && <button type="button" className="primary-button" onClick={() => setShowAppointmentModal(true)}>+ New appointment</button>}
        {onEdit && <button type="button" className="secondary-button" onClick={onEdit}>Edit client</button>}
      </div>
    </header>
    <section className="dashboard-panel client-profile-details" aria-label="Client information">
      <ProfilePhoto businessId={businessId} entity="clients" table="CLIENT" recordId={client.id}
        photoPath={client.profile_photo_path} initials={client.FirstName.charAt(0) + client.LastName.charAt(0)}
        label={client.FirstName + " " + client.LastName} compact />
      <dl>
        <div><dt>Phone</dt><dd>{client.PhoneNumber || "Not listed"}</dd></div>
        <div><dt>Email</dt><dd>{client.EmailAddress || "Not listed"}</dd></div>
        <div><dt>Address</dt><dd>{address.length ? address.map(line => <div key={line}>{line}</div>) : "Not listed"}</dd></div>
        <div><dt>SMS consent</dt><dd>{client.sms_consent ? "Enabled" : "Not recorded"}</dd></div>
        <div><dt>Booking deposit</dt><dd>{client.booking_deposit_required
          ? (client.booking_deposit_type === "percentage" ? client.booking_deposit_value + "%" : "$" + Number(client.booking_deposit_value).toFixed(2))
          : "Not required"}{client.booking_deposit_reason && <p>{client.booking_deposit_reason}</p>}</dd></div>
      </dl>
    </section>
    <section className="dashboard-panel" aria-label="Client appointment history">
      <h3>Appointment history</h3>
      {appointmentError ? <p role="alert">{appointmentError}</p> :
        !appointmentSummary ? <p role="status">Loading appointment history…</p> :
        <div className="client-appointment-stats">
          <article className="client-appointment-stat"><span>Last appointment</span><strong>{formatAppointmentDate(appointmentSummary.last)}</strong></article>
          <article className="client-appointment-stat"><span>Next appointment</span><strong>{formatAppointmentDate(appointmentSummary.next)}</strong></article>
          <article className="client-appointment-stat"><span>Cancellations</span><strong>{appointmentSummary.cancellations}</strong></article>
          <article className="client-appointment-stat"><span>No-shows</span><strong>{appointmentSummary.noShows}</strong></article>
        </div>}
    </section>
    {showAppointmentModal && <Calendar businessId={businessId} initialClientId={client.id}
      appointmentModalOnly onAppointmentModalClose={() => setShowAppointmentModal(false)}
      onAppointmentSaved={() => { setShowAppointmentModal(false); setAppointmentRefresh(value => value + 1); }} />}
    <ServiceAgreementProfile businessId={businessId} clientId={client.id} />
    <section className="dashboard-panel" aria-label="Client pets">
      <h3>Animals in this household</h3>
      {loading ? <p role="status">Loading pets…</p> : error ? <p role="alert">{error}</p> :
        pets.length === 0 ? <p>No animals are linked to this client yet.</p> :
        <div className="client-profile-pets">{pets.map(pet => <article key={pet.id}>
          <h4>{pet.PetName || "Unnamed pet"} {pet.archived_at && <span className="archive-reason">Archived</span>}</h4>
          <dl>
            <div><dt>Species</dt><dd>{pet.species || "Not listed"}</dd></div>
            <div><dt>Breed</dt><dd>{pet.PetBreed || "Not listed"}</dd></div>
            <div><dt>Date of birth</dt><dd>{pet.PetDOB || "Not listed"}</dd></div>
            <div><dt>Weight</dt><dd>{pet.PetWeight ?? "Not listed"}</dd></div>
          </dl>
        </article>)}</div>}
    </section>
  </section>;
}
