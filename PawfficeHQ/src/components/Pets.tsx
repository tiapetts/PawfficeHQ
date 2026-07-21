import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

type PetsProps = {
  businessId: string;
};

type PetId = number | string;

type Pet = {
  id: PetId;
  PetName: string;
  species: string;
  PetBreed: string | null;
  PetDOB: string | null;
  PetWeight: number | null;
};

type Client = {
  id: number;
  FirstName: string;
  LastName: string;
};

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

export default function Pets({ businessId }: PetsProps) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientPets, setClientPets] = useState<ClientPet[]>([]);
  const [form, setForm] = useState<PetForm>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadData() {
      const [petsResult, clientsResult, linksResult] = await Promise.all([
        supabase
          .from("PET")
          .select("id, PetName, species, PetBreed, PetDOB, PetWeight")
          .eq("business_id", businessId)
          .order("PetName"),

        supabase
          .from("CLIENT")
          .select("id, FirstName, LastName")
          .eq("business_id", businessId)
          .order("LastName"),

        supabase
          .from("client_pet")
          .select("client_id, pet_id, relationship, is_primary"),
      ]);

      const error =
        petsResult.error || clientsResult.error || linksResult.error;

      if (error) {
        console.error(error);
        setMessage(error.message);
      } else {
        setPets(petsResult.data ?? []);
        setClients(clientsResult.data ?? []);
        setClientPets(linksResult.data ?? []);
      }

      setLoading(false);
    }

    loadData();
  }, [businessId]);

  function updateField(field: keyof PetForm, value: string) {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  function getOwnerName(petId: PetId) {
    const relationship = clientPets.find(
      (link) => String(link.pet_id) === String(petId),
    );

    if (!relationship) {
      return "No owner attached";
    }

    const owner = clients.find(
      (client) => String(client.id) === String(relationship.client_id),
    );

    return owner ? `${owner.FirstName} ${owner.LastName}` : "Owner unavailable";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const { data: newPet, error: petError } = await supabase
      .from("PET")
      .insert({
        business_id: businessId,
        PetName: form.PetName.trim(),
        species: form.species,
        PetBreed: form.PetBreed.trim() || null,
        PetDOB: form.PetDOB || null,
        PetWeight: form.PetWeight ? Number(form.PetWeight) : null,
      })
      .select("id, PetName, species, PetBreed, PetDOB, PetWeight")
      .single();

    if (petError) {
      console.error(petError);
      setMessage(petError.message);
      setSaving(false);
      return;
    }

    const newRelationship = {
      client_id: Number(form.ownerId),
      pet_id: newPet.id,
      relationship: "owner",
      is_primary: true,
    };

    const { error: relationshipError } = await supabase
      .from("client_pet")
      .insert(newRelationship);

    if (relationshipError) {
      console.error(relationshipError);

      // Remove the orphaned pet if attaching the owner fails
      await supabase.from("PET").delete().eq("id", newPet.id);

      setMessage(relationshipError.message);
      setSaving(false);
      return;
    }

    setPets((currentPets) =>
      [...currentPets, newPet].sort((a, b) =>
        a.PetName.localeCompare(b.PetName),
      ),
    );

    setClientPets((currentLinks) => [...currentLinks, newRelationship]);

    setForm(emptyForm);
    setShowForm(false);
    setSaving(false);
  }

  return (
    <>
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Care records</p>
          <h2>Pets</h2>
        </div>

        <button
          className="primary-button"
          onClick={() => {
            setShowForm(!showForm);
            setMessage("");
          }}
        >
          {showForm ? "Cancel" : "+ Add pet"}
        </button>
      </header>

      {message && (
        <p className="error-message" role="alert">
          {message}
        </p>
      )}

      {showForm && (
        <section className="dashboard-panel client-form-panel">
          <h3>New pet</h3>

          {clients.length === 0 ? (
            <p>You must add a client before adding their pet.</p>
          ) : (
            <form className="client-form" onSubmit={handleSubmit}>
              <label className="full-width">
                Pet owner
                <select
                  value={form.ownerId}
                  onChange={(event) =>
                    updateField("ownerId", event.target.value)
                  }
                  required
                >
                  <option value="">Select a client</option>

                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.FirstName} {client.LastName}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Pet name
                <input
                  type="text"
                  value={form.PetName}
                  onChange={(event) =>
                    updateField("PetName", event.target.value)
                  }
                  required
                />
              </label>

              <label>
                Species
                <select
                  value={form.species}
                  onChange={(event) =>
                    updateField("species", event.target.value)
                  }
                  required
                >
                  <option value="">Select species</option>
                  <option value="Dog">Dog</option>
                  <option value="Cat">Cat</option>
                  <option value="Bird">Bird</option>
                  <option value="Rabbit">Rabbit</option>
                  <option value="Reptile">Reptile</option>
                  <option value="Other">Other</option>
                </select>
              </label>

              <label>
                Breed
                <input
                  type="text"
                  value={form.PetBreed}
                  onChange={(event) =>
                    updateField("PetBreed", event.target.value)
                  }
                />
              </label>

              <label>
                Date of birth
                <input
                  type="date"
                  value={form.PetDOB}
                  onChange={(event) =>
                    updateField("PetDOB", event.target.value)
                  }
                />
              </label>

              <label>
                Weight
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.PetWeight}
                  onChange={(event) =>
                    updateField("PetWeight", event.target.value)
                  }
                  placeholder="Weight in pounds"
                />
              </label>

              <div className="full-width form-actions">
                <button
                  className="primary-button"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? "Saving pet..." : "Save pet"}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {loading ? (
        <p>Loading pets...</p>
      ) : pets.length === 0 ? (
        <section className="dashboard-panel">
          <div className="empty-state">
            <h3>No pets yet</h3>
            <p>Add a pet and connect them to their owner.</p>
          </div>
        </section>
      ) : (
        <section className="pet-grid">
          {pets.map((pet) => (
            <article className="pet-card" key={pet.id}>
              <div className="pet-avatar">{pet.PetName.charAt(0)}</div>

              <div>
                <h3>{pet.PetName}</h3>
                <p>{[pet.species, pet.PetBreed].filter(Boolean).join(" · ")}</p>
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
            </article>
          ))}
        </section>
      )}
    </>
  );
}
