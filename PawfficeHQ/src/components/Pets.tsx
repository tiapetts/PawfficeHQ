import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import ProfilePhoto from "./ProfilePhoto";
import "./PetEditing.css";

type PetsProps = { businessId: string; readOnly?: boolean };
type PetId = number | string;
type Pet = {
  id: PetId;
  PetName: string;
  species: string;
  PetBreed: string | null;
  PetDOB: string | null;
  PetWeight: number | null;
  profile_photo_path: string | null;
  archived_at: string | null;
  archive_reason: string | null;
};
type Client = { id: number; FirstName: string; LastName: string; archived_at: string | null };
type ClientPet = {
  client_id: number;
  pet_id: PetId;
  relationship: string | null;
  is_primary: boolean;
};
const emptyForm = {
  ownerId: "",
  PetName: "",
  species: "",
  PetBreed: "",
  PetDOB: "",
  PetWeight: "",
};
type PetForm = typeof emptyForm;
const petSelection = "id, PetName, species, PetBreed, PetDOB, PetWeight, profile_photo_path, archived_at, archive_reason";

export default function Pets({ businessId, readOnly = false }: PetsProps) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientPets, setClientPets] = useState<ClientPet[]>([]);
  const [form, setForm] = useState<PetForm>(emptyForm);
  const [editingId, setEditingId] = useState<PetId | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [listMode, setListMode] = useState<"active" | "archived">("active");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function loadData() {
    const [petsResult, clientsResult, linksResult] = await Promise.all([
      supabase
        .from("PET")
        .select(petSelection)
        .eq("business_id", businessId)
        .order("PetName"),
      supabase
        .from("CLIENT")
        .select("id, FirstName, LastName, archived_at")
        .eq("business_id", businessId)
        .order("LastName"),
      supabase
        .from("client_pet")
        .select("client_id, pet_id, relationship, is_primary"),
    ]);
    const error = petsResult.error || clientsResult.error || linksResult.error;
    if (error) {
      console.error(error);
      setMessage(error.message);
      setSuccess(false);
    } else {
      setPets((petsResult.data as Pet[] | null) ?? []);
      setClients(clientsResult.data ?? []);
      setClientPets((linksResult.data as ClientPet[] | null) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, [businessId]);
  function updateField(field: keyof PetForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }
  function ownerLink(petId: PetId) {
    return (
      clientPets.find(
        (link) => String(link.pet_id) === String(petId) && link.is_primary,
      ) ?? clientPets.find((link) => String(link.pet_id) === String(petId))
    );
  }
  function getOwnerName(petId: PetId) {
    const link = ownerLink(petId);
    const owner = clients.find(
      (client) => String(client.id) === String(link?.client_id),
    );
    return owner ? `${owner.FirstName} ${owner.LastName}` : "No owner attached";
  }
  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }
  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setMessage("");
    setSuccess(false);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function openEdit(pet: Pet) {
    setEditingId(pet.id);
    setForm({
      ownerId: String(ownerLink(pet.id)?.client_id ?? ""),
      PetName: pet.PetName,
      species: pet.species,
      PetBreed: pet.PetBreed ?? "",
      PetDOB: pet.PetDOB ?? "",
      PetWeight: pet.PetWeight === null ? "" : String(pet.PetWeight),
    });
    setMessage("");
    setSuccess(false);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setSuccess(false);
    const wasEditing = editingId !== null;
    const values = {
      business_id: businessId,
      PetName: form.PetName.trim(),
      species: form.species,
      PetBreed: form.PetBreed.trim() || null,
      PetDOB: form.PetDOB || null,
      PetWeight: form.PetWeight ? Number(form.PetWeight) : null,
    };
    const petQuery = wasEditing
      ? supabase
          .from("PET")
          .update(values)
          .eq("id", editingId)
          .eq("business_id", businessId)
          .select(petSelection)
          .single()
      : supabase.from("PET").insert(values).select(petSelection).single();
    const { data: savedPet, error: petError } = await petQuery;
    if (petError || !savedPet) {
      setMessage(petError?.message ?? "Pet could not be saved");
      setSaving(false);
      return;
    }

    const existingLink = wasEditing ? ownerLink(editingId) : undefined;
    let relationshipError: { message: string } | null = null;
    if (existingLink) {
      const result = await supabase
        .from("client_pet")
        .update({
          client_id: Number(form.ownerId),
          relationship: "owner",
          is_primary: true,
        })
        .eq("pet_id", editingId)
        .eq("client_id", existingLink.client_id);
      relationshipError = result.error;
    } else {
      const result = await supabase.from("client_pet").insert({
        client_id: Number(form.ownerId),
        pet_id: savedPet.id,
        relationship: "owner",
        is_primary: true,
      });
      relationshipError = result.error;
    }
    if (relationshipError) {
      if (!wasEditing)
        await supabase.from("PET").delete().eq("id", savedPet.id);
      setMessage(relationshipError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    closeForm();
    await loadData();
    setSuccess(true);
    setMessage(wasEditing ? "Pet changes saved." : "Pet added.");
  }

  async function archivePet(pet: Pet) {
    const reason = window.prompt(
      `Why are you archiving ${pet.PetName}?`,
      "No longer receiving services",
    );
    if (reason === null) return;
    const { error } = await supabase
      .from("PET")
      .update({ archived_at: new Date().toISOString(), archive_reason: reason.trim() || null })
      .eq("id", pet.id)
      .eq("business_id", businessId);
    if (error) {
      setSuccess(false);
      setMessage(error.message);
      return;
    }
    if (String(editingId) === String(pet.id)) closeForm();
    await loadData();
    setSuccess(true);
    setMessage(`${pet.PetName} was archived. Their care history was preserved.`);
  }

  async function restorePet(pet: Pet) {
    const { error } = await supabase
      .from("PET")
      .update({ archived_at: null, archive_reason: null })
      .eq("id", pet.id)
      .eq("business_id", businessId);
    if (error) {
      setSuccess(false);
      setMessage(error.message);
      return;
    }
    await loadData();
    setSuccess(true);
    setMessage(`${pet.PetName} was restored.`);
  }

  const visiblePets = pets.filter((pet) =>
    listMode === "archived" ? pet.archived_at !== null : pet.archived_at === null,
  );

  return (
    <>
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Care records</p>
          <h2>Pets</h2>
        </div>
        {!readOnly && (
          <button
            className="primary-button"
            onClick={showForm ? closeForm : openNew}
          >
            {showForm ? "Cancel" : "+ Add pet"}
          </button>
        )}
      </header>
      {message && (
        <p className={success ? "pet-success" : "error-message"} role="status">
          {message}
        </p>
      )}

      {showForm && !readOnly && (
        <section className="dashboard-panel client-form-panel">
          <div className="pet-form-title">
            <div>
              <p className="eyebrow">
                {editingId !== null ? "Pet profile" : "New care record"}
              </p>
              <h3>{editingId !== null ? "Edit pet" : "New pet"}</h3>
            </div>
            {editingId !== null && <span>Pet #{editingId}</span>}
          </div>
          {editingId !== null && (
            <div className="profile-photo-section">
              <ProfilePhoto
                businessId={businessId}
                entity="pets"
                table="PET"
                recordId={editingId}
                photoPath={pets.find((pet) => String(pet.id) === String(editingId))?.profile_photo_path ?? null}
                initials={form.PetName.charAt(0)}
                label={form.PetName || "Pet"}
                editable
                onChanged={loadData}
              />
            </div>
          )}
          {clients.filter((client) => !client.archived_at).length === 0 ? (
            <p>You must add a client before adding their pet.</p>
          ) : (
            <form className="client-form" onSubmit={handleSubmit}>
              <label className="full-width">
                Pet owner
                <select
                  value={form.ownerId}
                  onChange={(e) => updateField("ownerId", e.target.value)}
                  required
                >
                  <option value="">Select a client</option>
                  {clients.filter((client) => !client.archived_at).map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.FirstName} {client.LastName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Pet name
                <input
                  value={form.PetName}
                  onChange={(e) => updateField("PetName", e.target.value)}
                  required
                />
              </label>
              <label>
                Species
                <select
                  value={form.species}
                  onChange={(e) => updateField("species", e.target.value)}
                  required
                >
                  <option value="">Select species</option>
                  {["Dog", "Cat", "Bird", "Rabbit", "Reptile", "Other"].map(
                    (species) => (
                      <option key={species}>{species}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Breed
                <input
                  value={form.PetBreed}
                  onChange={(e) => updateField("PetBreed", e.target.value)}
                />
              </label>
              <label>
                Date of birth
                <input
                  type="date"
                  value={form.PetDOB}
                  onChange={(e) => updateField("PetDOB", e.target.value)}
                />
              </label>
              <label>
                Weight
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.PetWeight}
                  onChange={(e) => updateField("PetWeight", e.target.value)}
                  placeholder="Weight in pounds"
                />
              </label>
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
                    : editingId !== null
                      ? "Save changes"
                      : "Save pet"}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      <div className="record-list-filter" role="group" aria-label="Pet status">
        <button type="button" className={listMode === "active" ? "active" : ""} onClick={() => setListMode("active")}>
          Active ({pets.filter((pet) => !pet.archived_at).length})
        </button>
        <button type="button" className={listMode === "archived" ? "active" : ""} onClick={() => setListMode("archived")}>
          Archived ({pets.filter((pet) => pet.archived_at).length})
        </button>
      </div>

      {loading ? (
        <p>Loading pets...</p>
      ) : visiblePets.length === 0 ? (
        <section className="dashboard-panel">
          <div className="empty-state">
            <h3>{listMode === "archived" ? "No archived pets" : "No active pets yet"}</h3>
            <p>{listMode === "archived" ? "Archived pet profiles will appear here." : "Add a pet and connect them to their owner."}</p>
          </div>
        </section>
      ) : (
        <section className="pet-grid">
          {visiblePets.map((pet) => (
            <article className="pet-card" key={pet.id}>
              <ProfilePhoto
                businessId={businessId}
                entity="pets"
                table="PET"
                recordId={pet.id}
                photoPath={pet.profile_photo_path}
                initials={pet.PetName.charAt(0)}
                label={pet.PetName}
                compact
              />
              <div>
                <h3>{pet.PetName}</h3>
                <p>{[pet.species, pet.PetBreed].filter(Boolean).join(" · ")}</p>
                {pet.archived_at && <p className="archive-reason">Archived · {pet.archive_reason || "No reason provided"}</p>}
              </div>
              <dl className="pet-details">
                <div>
                  <dt>Owner</dt>
                  <dd>{getOwnerName(pet.id)}</dd>
                </div>
                <div>
                  <dt>Weight</dt>
                  <dd>
                    {pet.PetWeight ? `${pet.PetWeight} lbs` : "Not listed"}
                  </dd>
                </div>
                <div>
                  <dt>Date of birth</dt>
                  <dd>{pet.PetDOB || "Not listed"}</dd>
                </div>
              </dl>
              {!readOnly && (
                <div className="record-actions pet-record-actions">
                  {pet.archived_at ? (
                    <button className="pet-edit-button" type="button" onClick={() => void restorePet(pet)}>Restore pet</button>
                  ) : (
                    <>
                      <button className="pet-edit-button" type="button" onClick={() => openEdit(pet)}>Edit pet</button>
                      <button className="archive-button" type="button" onClick={() => void archivePet(pet)}>Archive pet</button>
                    </>
                  )}
                </div>
              )}
            </article>
          ))}
        </section>
      )}
    </>
  );
}
