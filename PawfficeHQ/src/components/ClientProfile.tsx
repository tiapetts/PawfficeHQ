import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Client } from "./Clients";
import ProfilePhoto from "./ProfilePhoto";
import "./ClientProfile.css";

type Pet = {
  id: number; PetName: string; species: string | null; PetBreed: string | null;
  PetDOB: string | null; PetWeight: number | null; archived_at: string | null;
};
type Props = {
  businessId: string; client: Client; onBack: () => void; onEdit?: () => void;
};

export default function ClientProfile({ businessId, client, onBack, onEdit }: Props) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
      {onEdit && <button type="button" className="primary-button" onClick={onEdit}>Edit client</button>}
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
