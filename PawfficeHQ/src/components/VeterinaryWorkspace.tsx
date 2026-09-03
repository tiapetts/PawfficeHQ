import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import ProfilePhoto from "./ProfilePhoto";
import VeterinaryMedications from "./VeterinaryMedications";
import VeterinaryTreatmentPlan from "./VeterinaryTreatmentPlan";
import "./VeterinaryWorkspace.css";

type Props = { businessId: string; readOnly?: boolean; onOpenInvoice?: (invoiceId:string) => void };
type Pet = { id: number; PetName: string; species: string; PetBreed: string | null; PetDOB: string | null; PetWeight: number | null; profile_photo_path: string | null };
type Client = { id: number; FirstName: string; LastName: string; PhoneNumber: string | null; EmailAddress: string | null };
type ClientPet = { client_id: number; pet_id: number; is_primary: boolean };
type Profile = { pet_id: number; sex: string | null; reproductive_status: string | null; color_markings: string | null; microchip_number: string | null; deceased_at: string | null };
type Alert = { id: string; pet_id: number; alert_type: string; description: string; severity: string; is_active: boolean; created_at: string };
type Problem = { id: string; pet_id: number; name: string; status: string; onset_on: string | null; resolved_on: string | null; notes: string | null };
type Encounter = {
  id: string; pet_id: number; appointment_id: string | null; visit_type: string; chief_complaint: string | null; status: string;
  subjective: string | null; objective: string | null; assessment: string | null; plan: string | null; client_instructions: string | null;
  weight_kg: number | null; temperature_f: number | null; pulse_bpm: number | null; respiration_bpm: number | null;
  body_condition_score: number | null; pain_score: number | null; diagnoses: string[]; follow_up_on: string | null;
  created_at: string; finalized_at: string | null; entered_in_error_reason: string | null; entered_in_error_at: string | null; corrected_encounter_id: string | null;
};
type Amendment = { id: string; encounter_id: string; amendment_text: string; reason: string; created_at: string };
type Appointment = { id: string; client_id: number; start_at: string; end_at: string; status: string };
type AppointmentPet = { appointment_id: string; pet_id: number };
type AppointmentService = { appointment_id: string; service_id: string };
type Service = { id: string; name: string; category: string };
type VaccineRequirement = { id: string; name: string; species: string; is_active: boolean };
type Vaccination = { id: string; pet_id: number; encounter_id: string | null; requirement_id: string | null; vaccine_name: string; administered_on: string | null; expires_on: string; provider: string | null; lot_number: string | null; administration_site: string | null };
type Treatment = { id: string; pet_id: number; encounter_id: string; treatment_type: string; name: string; dose: string | null; route: string | null; administration_site: string | null; quantity: string | null; notes: string | null; performed_at: string };

const blankEncounter = {
  visit_type: "wellness", chief_complaint: "", subjective: "", objective: "", assessment: "", plan: "", client_instructions: "",
  weight_kg: "", temperature_f: "", pulse_bpm: "", respiration_bpm: "", body_condition_score: "", pain_score: "",
  diagnoses: "", follow_up_on: "", appointment_id: "",
};
const blankProfile = { sex: "unknown", reproductive_status: "unknown", color_markings: "", microchip_number: "" };
const blankTreatment = { treatment_type: "treatment", name: "", dose: "", route: "", administration_site: "", quantity: "", notes: "" };
const blankVaccine = { requirement_id: "", vaccine_name: "", administered_on: new Date().toISOString().slice(0, 10), expires_on: "", provider: "", lot_number: "", administration_site: "" };
const encounterColumns = "id, pet_id, appointment_id, visit_type, chief_complaint, status, subjective, objective, assessment, plan, client_instructions, weight_kg, temperature_f, pulse_bpm, respiration_bpm, body_condition_score, pain_score, diagnoses, follow_up_on, created_at, finalized_at, entered_in_error_reason, entered_in_error_at, corrected_encounter_id";

export default function VeterinaryWorkspace({ businessId, readOnly = false, onOpenInvoice }: Props) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientPets, setClientPets] = useState<ClientPet[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [amendments, setAmendments] = useState<Amendment[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentPets, setAppointmentPets] = useState<AppointmentPet[]>([]);
  const [appointmentServices, setAppointmentServices] = useState<AppointmentService[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [businessName, setBusinessName] = useState("PawfficeHQ Veterinary Care");
  const [vaccineRequirements, setVaccineRequirements] = useState<VaccineRequirement[]>([]);
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [profileForm, setProfileForm] = useState(blankProfile);
  const [alertForm, setAlertForm] = useState({ alert_type: "allergy", severity: "important", description: "" });
  const [problemForm, setProblemForm] = useState({ name: "", onset_on: "", notes: "" });
  const [encounterForm, setEncounterForm] = useState(blankEncounter);
  const [encounterPetId, setEncounterPetId] = useState<number | null>(null);
  const [editingEncounterId, setEditingEncounterId] = useState<string | null>(null);
  const [amendmentFor, setAmendmentFor] = useState<string | null>(null);
  const [amendmentForm, setAmendmentForm] = useState({ reason: "", text: "" });
  const [showEncounterForm, setShowEncounterForm] = useState(false);
  const [treatmentFor, setTreatmentFor] = useState<string | null>(null);
  const [planFor, setPlanFor] = useState<string | null>(null);
  const [treatmentForm, setTreatmentForm] = useState(blankTreatment);
  const [vaccineFor, setVaccineFor] = useState<string | null>(null);
  const [vaccineForm, setVaccineForm] = useState(blankVaccine);
  const [correctionFor, setCorrectionFor] = useState<string | null>(null);
  const [correctionForm, setCorrectionForm] = useState({ pet_id: "", reason: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [summaryView, setSummaryView] = useState<"today"|"drafts"|"alerts"|"followups"|null>(null);
  const [renderedAt] = useState(() => Date.now());

  async function loadData(preferredPetId?: number | null) {
    setLoading(true);
    setMessage("");
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const [petResult, clientResult, linkResult, profileResult, alertResult, problemResult, encounterResult, amendmentResult, appointmentResult, serviceResult, requirementResult, vaccinationResult, treatmentResult, businessResult] = await Promise.all([
      supabase.from("PET").select("id, PetName, species, PetBreed, PetDOB, PetWeight, profile_photo_path").eq("business_id", businessId).is("archived_at", null).order("PetName"),
      supabase.from("CLIENT").select("id, FirstName, LastName, PhoneNumber, EmailAddress").eq("business_id", businessId).is("archived_at", null),
      supabase.from("client_pet").select("client_id, pet_id, is_primary"),
      supabase.from("vet_patient_profile").select("pet_id, sex, reproductive_status, color_markings, microchip_number, deceased_at").eq("business_id", businessId),
      supabase.from("vet_medical_alert").select("id, pet_id, alert_type, description, severity, is_active, created_at").eq("business_id", businessId).order("created_at", { ascending: false }),
      supabase.from("vet_problem").select("id, pet_id, name, status, onset_on, resolved_on, notes").eq("business_id", businessId).order("created_at", { ascending: false }),
      supabase.from("vet_encounter").select(encounterColumns).eq("business_id", businessId).order("created_at", { ascending: false }),
      supabase.from("vet_encounter_amendment").select("id, encounter_id, amendment_text, reason, created_at").eq("business_id", businessId).order("created_at"),
      supabase.from("appointment").select("id, client_id, start_at, end_at, status").eq("business_id", businessId).gte("start_at", start.toISOString()).lt("start_at", end.toISOString()).not("status", "in", "(cancelled,canceled,no_show,void)").order("start_at"),
      supabase.from("service").select("id, name, category").eq("business_id", businessId).eq("is_active", true),
      supabase.from("vaccine_requirement").select("id, name, species, is_active").eq("business_id", businessId).eq("is_active", true).order("name"),
      supabase.from("pet_vaccination").select("id, pet_id, encounter_id, requirement_id, vaccine_name, administered_on, expires_on, provider, lot_number, administration_site").eq("business_id", businessId).order("administered_on", { ascending: false }),
      supabase.from("vet_treatment").select("id, pet_id, encounter_id, treatment_type, name, dose, route, administration_site, quantity, notes, performed_at").eq("business_id", businessId).order("performed_at", { ascending: false }),
      supabase.from("business").select("business_name").eq("id", businessId).single(),
    ]);
    const firstError = [petResult.error, clientResult.error, linkResult.error, profileResult.error, alertResult.error, problemResult.error, encounterResult.error, amendmentResult.error, appointmentResult.error, serviceResult.error, requirementResult.error, vaccinationResult.error, treatmentResult.error, businessResult.error].find(Boolean);
    if (firstError) { setMessage(firstError.message); setLoading(false); return; }
    const loadedAppointments = (appointmentResult.data as Appointment[] | null) ?? [];
    let petLinks: AppointmentPet[] = [], serviceLinks: AppointmentService[] = [];
    if (loadedAppointments.length) {
      const ids = loadedAppointments.map((item) => item.id);
      const [petLinksResult, serviceLinksResult] = await Promise.all([
        supabase.from("appointment_pet").select("appointment_id, pet_id").in("appointment_id", ids),
        supabase.from("appointment_service").select("appointment_id, service_id").in("appointment_id", ids),
      ]);
      if (petLinksResult.error || serviceLinksResult.error) setMessage((petLinksResult.error || serviceLinksResult.error)!.message);
      else {
        petLinks = (petLinksResult.data as AppointmentPet[]) ?? [];
        serviceLinks = (serviceLinksResult.data as AppointmentService[]) ?? [];
      }
    }
    const loadedPets = (petResult.data as Pet[] | null) ?? [];
    setPets(loadedPets); setClients((clientResult.data as Client[]) ?? []); setClientPets((linkResult.data as ClientPet[]) ?? []);
    const loadedProfiles = (profileResult.data as Profile[]) ?? [];
    setProfiles(loadedProfiles); setAlerts((alertResult.data as Alert[]) ?? []); setProblems((problemResult.data as Problem[]) ?? []);
    setEncounters((encounterResult.data as Encounter[]) ?? []); setAmendments((amendmentResult.data as Amendment[]) ?? []);
    setAppointments(loadedAppointments); setAppointmentPets(petLinks); setAppointmentServices(serviceLinks); setServices((serviceResult.data as Service[]) ?? []);
    setVaccineRequirements((requirementResult.data as VaccineRequirement[]) ?? []);
    setVaccinations((vaccinationResult.data as Vaccination[]) ?? []);
    setTreatments((treatmentResult.data as Treatment[]) ?? []);
    setBusinessName((businessResult.data as { business_name: string } | null)?.business_name ?? "PawfficeHQ Veterinary Care");
    const nextPet = preferredPetId ?? selectedPetId ?? petLinks[0]?.pet_id ?? loadedPets[0]?.id ?? null;
    setSelectedPetId(nextPet);
    const nextProfile = loadedProfiles.find((item) => item.pet_id === nextPet);
    setProfileForm(nextProfile ? {
      sex: nextProfile.sex ?? "unknown",
      reproductive_status: nextProfile.reproductive_status ?? "unknown",
      color_markings: nextProfile.color_markings ?? "",
      microchip_number: nextProfile.microchip_number ?? "",
    } : blankProfile);
    setLoading(false);
  }

  useEffect(() => {
    // Loading remote records is the synchronization purpose of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  const filteredPets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return pets.filter((pet) => {
      const link = clientPets.find((item) => item.pet_id === pet.id && item.is_primary) ?? clientPets.find((item) => item.pet_id === pet.id);
      const owner = clients.find((client) => client.id === link?.client_id);
      return !query || `${pet.PetName} ${pet.species} ${pet.PetBreed ?? ""} ${owner ? `${owner.FirstName} ${owner.LastName}` : ""}`.toLowerCase().includes(query);
    });
  }, [pets, clients, clientPets, search]);
  const veterinaryServiceIds = useMemo(() => new Set(services.filter((service) => service.category.toLowerCase() === "veterinary").map((service) => service.id)), [services]);
  const todayAppointments = useMemo(() => appointments.filter((appointment) => appointmentServices.some((link) => link.appointment_id === appointment.id && veterinaryServiceIds.has(link.service_id))), [appointments, appointmentServices, veterinaryServiceIds]);
  const todayPatientCount = todayAppointments.reduce((total, appointment) => total + Math.max(1, appointmentPets.filter((link) => link.appointment_id === appointment.id).length), 0);
  const selectedPet = pets.find((pet) => pet.id === selectedPetId) ?? null;
  const selectedProfile = profiles.find((profile) => profile.pet_id === selectedPetId);
  const selectedAlerts = alerts.filter((alert) => alert.pet_id === selectedPetId && alert.is_active);
  const selectedProblems = problems.filter((problem) => problem.pet_id === selectedPetId);
  const selectedEncounters = encounters.filter((encounter) => encounter.pet_id === selectedPetId && encounter.status !== "entered_in_error");
  const selectedErrorEncounters = encounters.filter((encounter) => encounter.pet_id === selectedPetId && encounter.status === "entered_in_error");
  const draftEncounters = encounters.filter((encounter) => encounter.status === "draft");
  const activeAlerts = alerts.filter((alert) => alert.is_active);
  const followUpEncounters = encounters.filter((encounter) => encounter.status !== "entered_in_error" && encounter.follow_up_on && encounter.follow_up_on >= new Date().toISOString().slice(0, 10));

  function ownerFor(petId: number) {
    const link = clientPets.find((item) => item.pet_id === petId && item.is_primary) ?? clientPets.find((item) => item.pet_id === petId);
    return clients.find((client) => client.id === link?.client_id);
  }
  function petsForAppointment(appointmentId: string) {
    const petIds = appointmentPets.filter((item) => item.appointment_id === appointmentId).map((item) => item.pet_id);
    return pets.filter((pet) => petIds.includes(pet.id));
  }
  function age(pet: Pet) {
    if (!pet.PetDOB) return "Age unknown";
    const years = Math.floor((renderedAt - new Date(pet.PetDOB + "T00:00:00").getTime()) / 31_557_600_000);
    return years < 1 ? "Under 1 year" : `${years} year${years === 1 ? "" : "s"}`;
  }
  function choosePet(petId: number) {
    setSelectedPetId(petId); setShowEncounterForm(false); setEditingEncounterId(null); setAmendmentFor(null); setPlanFor(null); setMessage("");
    const profile = profiles.find((item) => item.pet_id === petId);
    setProfileForm(profile ? { sex: profile.sex ?? "unknown", reproductive_status: profile.reproductive_status ?? "unknown", color_markings: profile.color_markings ?? "", microchip_number: profile.microchip_number ?? "" } : blankProfile);
  }
  function openSummaryRecord(petId:number, encounterId?:string){choosePet(petId);requestAnimationFrame(()=>requestAnimationFrame(()=>document.getElementById(encounterId?`vet-encounter-${encounterId}`:"vet-chart-header")?.scrollIntoView({behavior:"smooth",block:"start"})))}
  function startEncounter(appointment?: Appointment, appointmentPet?: Pet) {
    const pet = appointmentPet ?? selectedPet;
    if (!pet) return;
    choosePet(pet.id); setEncounterForm({ ...blankEncounter, appointment_id: appointment?.id ?? "", weight_kg: pet.PetWeight ? String((Number(pet.PetWeight) * 0.453592).toFixed(2)) : "" });
    setEncounterPetId(pet.id); setEditingEncounterId(null); setShowEncounterForm(true);
  }
  function editEncounter(encounter: Encounter) {
    if (encounter.status !== "draft") return;
    choosePet(encounter.pet_id); setEncounterPetId(encounter.pet_id); setEditingEncounterId(encounter.id); setShowEncounterForm(true);
    setEncounterForm({
      visit_type: encounter.visit_type, chief_complaint: encounter.chief_complaint ?? "", subjective: encounter.subjective ?? "", objective: encounter.objective ?? "",
      assessment: encounter.assessment ?? "", plan: encounter.plan ?? "", client_instructions: encounter.client_instructions ?? "",
      weight_kg: encounter.weight_kg == null ? "" : String(encounter.weight_kg), temperature_f: encounter.temperature_f == null ? "" : String(encounter.temperature_f),
      pulse_bpm: encounter.pulse_bpm == null ? "" : String(encounter.pulse_bpm), respiration_bpm: encounter.respiration_bpm == null ? "" : String(encounter.respiration_bpm),
      body_condition_score: encounter.body_condition_score == null ? "" : String(encounter.body_condition_score), pain_score: encounter.pain_score == null ? "" : String(encounter.pain_score),
      diagnoses: encounter.diagnoses.join(", "), follow_up_on: encounter.follow_up_on ?? "", appointment_id: encounter.appointment_id ?? "",
    });
  }
  const numberOrNull = (value: string) => value === "" ? null : Number(value);

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); if (!selectedPetId) return; setSaving(true); setMessage("");
    const { error } = await supabase.from("vet_patient_profile").upsert({ business_id: businessId, pet_id: selectedPetId, ...profileForm, color_markings: profileForm.color_markings.trim() || null, microchip_number: profileForm.microchip_number.trim() || null, updated_at: new Date().toISOString() }, { onConflict: "pet_id" });
    setSaving(false); if (error) return setMessage(error.message); setMessage("Patient details saved."); await loadData(selectedPetId);
  }
  async function addAlert(event: FormEvent) {
    event.preventDefault(); if (!selectedPetId) return; setSaving(true);
    const { error } = await supabase.from("vet_medical_alert").insert({ business_id: businessId, pet_id: selectedPetId, ...alertForm, description: alertForm.description.trim() });
    setSaving(false); if (error) return setMessage(error.message); setAlertForm({ alert_type: "allergy", severity: "important", description: "" }); await loadData(selectedPetId);
  }
  async function resolveAlert(id: string) {
    const { error } = await supabase.from("vet_medical_alert").update({ is_active: false, resolved_at: new Date().toISOString() }).eq("id", id).eq("business_id", businessId);
    if (error) setMessage(error.message); else await loadData(selectedPetId);
  }
  async function addProblem(event: FormEvent) {
    event.preventDefault(); if (!selectedPetId) return; setSaving(true);
    const { error } = await supabase.from("vet_problem").insert({ business_id: businessId, pet_id: selectedPetId, name: problemForm.name.trim(), onset_on: problemForm.onset_on || null, notes: problemForm.notes.trim() || null });
    setSaving(false); if (error) return setMessage(error.message); setProblemForm({ name: "", onset_on: "", notes: "" }); await loadData(selectedPetId);
  }
  async function changeProblem(problem: Problem, status: string) {
    const { error } = await supabase.from("vet_problem").update({ status, resolved_on: status === "resolved" ? new Date().toISOString().slice(0, 10) : null, updated_at: new Date().toISOString() }).eq("id", problem.id).eq("business_id", businessId);
    if (error) setMessage(error.message); else await loadData(selectedPetId);
  }
  async function saveEncounter(event: FormEvent) {
    event.preventDefault(); if (!encounterPetId) return; setSaving(true); setMessage("");
    const payload = {
      business_id: businessId, pet_id: encounterPetId, appointment_id: encounterForm.appointment_id || null, visit_type: encounterForm.visit_type,
      chief_complaint: encounterForm.chief_complaint.trim() || null, subjective: encounterForm.subjective.trim() || null, objective: encounterForm.objective.trim() || null,
      assessment: encounterForm.assessment.trim() || null, plan: encounterForm.plan.trim() || null, client_instructions: encounterForm.client_instructions.trim() || null,
      weight_kg: numberOrNull(encounterForm.weight_kg), temperature_f: numberOrNull(encounterForm.temperature_f), pulse_bpm: numberOrNull(encounterForm.pulse_bpm),
      respiration_bpm: numberOrNull(encounterForm.respiration_bpm), body_condition_score: numberOrNull(encounterForm.body_condition_score), pain_score: numberOrNull(encounterForm.pain_score),
      diagnoses: encounterForm.diagnoses.split(",").map((item) => item.trim()).filter(Boolean), follow_up_on: encounterForm.follow_up_on || null,
    };
    const result = editingEncounterId
      ? await supabase.from("vet_encounter").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editingEncounterId).eq("business_id", businessId)
      : await supabase.from("vet_encounter").insert(payload);
    setSaving(false); if (result.error) return setMessage(result.error.message);
    setShowEncounterForm(false); setEditingEncounterId(null); setEncounterPetId(null); setEncounterForm(blankEncounter); setMessage("Clinical encounter saved as a draft."); await loadData(encounterPetId);
  }
  async function finalizeEncounter(encounter: Encounter) {
    if (!window.confirm("Finalize this medical record? The original note will become read-only and future changes must be added as amendments.")) return;
    setSaving(true); const { error } = await supabase.rpc("finalize_vet_encounter", { p_encounter_id: encounter.id }); setSaving(false);
    if (error) setMessage(error.message); else { setMessage("Medical record finalized and locked."); await loadData(selectedPetId); }
  }
  async function addAmendment(event: FormEvent) {
    event.preventDefault(); if (!amendmentFor) return; setSaving(true);
    const { error } = await supabase.rpc("add_vet_encounter_amendment", { p_encounter_id: amendmentFor, p_reason: amendmentForm.reason.trim(), p_text: amendmentForm.text.trim() });
    setSaving(false); if (error) return setMessage(error.message); setAmendmentFor(null); setAmendmentForm({ reason: "", text: "" }); setMessage("Amendment added without changing the original note."); await loadData(selectedPetId);
  }

  async function correctEncounterPatient(event: FormEvent) {
    event.preventDefault();
    if (!correctionFor || !correctionForm.pet_id) return;
    const correctPetId = Number(correctionForm.pet_id);
    setSaving(true); setMessage("");
    const { error } = await supabase.rpc("correct_vet_encounter_patient", {
      p_encounter_id: correctionFor,
      p_correct_pet_id: correctPetId,
      p_reason: correctionForm.reason.trim(),
    });
    setSaving(false);
    if (error) return setMessage(error.message);
    setCorrectionFor(null); setCorrectionForm({ pet_id: "", reason: "" });
    setMessage("Original record marked entered in error. A reviewable draft was created under the correct patient.");
    await loadData(correctPetId);
  }

  async function addTreatment(event: FormEvent) {
    event.preventDefault();
    const encounter = encounters.find((item) => item.id === treatmentFor);
    if (!treatmentFor || !encounter) return;
    setSaving(true); setMessage("");
    const { error } = await supabase.from("vet_treatment").insert({
      business_id: businessId, pet_id: encounter.pet_id, encounter_id: treatmentFor,
      treatment_type: treatmentForm.treatment_type, name: treatmentForm.name.trim(),
      dose: treatmentForm.dose.trim() || null, route: treatmentForm.route.trim() || null,
      administration_site: treatmentForm.administration_site.trim() || null,
      quantity: treatmentForm.quantity.trim() || null, notes: treatmentForm.notes.trim() || null,
    });
    setSaving(false);
    if (error) return setMessage(error.message);
    setTreatmentFor(null); setTreatmentForm(blankTreatment); setMessage("Treatment added to the encounter."); await loadData(encounter.pet_id);
  }

  async function addAdministeredVaccine(event: FormEvent) {
    event.preventDefault();
    const encounter = encounters.find((item) => item.id === vaccineFor);
    if (!vaccineFor || !encounter) return;
    const requirement = vaccineRequirements.find((item) => item.id === vaccineForm.requirement_id);
    setSaving(true); setMessage("");
    const { error } = await supabase.from("pet_vaccination").insert({
      business_id: businessId, pet_id: encounter.pet_id, encounter_id: vaccineFor,
      requirement_id: vaccineForm.requirement_id || null,
      vaccine_name: requirement?.name ?? vaccineForm.vaccine_name.trim(),
      administered_on: vaccineForm.administered_on, expires_on: vaccineForm.expires_on,
      provider: vaccineForm.provider.trim() || businessName,
      lot_number: vaccineForm.lot_number.trim() || null,
      administration_site: vaccineForm.administration_site.trim() || null,
      notes: "Administered during clinical encounter",
    });
    setSaving(false);
    if (error) return setMessage(error.message);
    setVaccineFor(null); setVaccineForm(blankVaccine); setMessage("Administered vaccine added to the medical record."); await loadData(encounter.pet_id);
  }

  function printClientInstructions(encounter: Encounter) {
    if (!selectedPet) return;
    const owner = ownerFor(selectedPet.id);
    const encounterTreatments = treatments.filter((item) => item.encounter_id === encounter.id);
    const encounterVaccines = vaccinations.filter((item) => item.encounter_id === encounter.id);
    const escape = (value: string | null | undefined) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
    const windowRef = window.open("", "_blank", "width=850,height=950");
    if (!windowRef) { setMessage("Allow pop-ups to print or save client instructions."); return; }
    const treatmentRows = encounterTreatments.map((item) => `<li><strong>${escape(item.name)}</strong>${item.dose ? ` · ${escape(item.dose)}` : ""}${item.route ? ` · ${escape(item.route)}` : ""}${item.notes ? `<small>${escape(item.notes)}</small>` : ""}</li>`).join("");
    const vaccineRows = encounterVaccines.map((item) => `<li><strong>${escape(item.vaccine_name)}</strong> · administered ${item.administered_on ? new Date(item.administered_on + "T00:00:00").toLocaleDateString() : "today"} · next due ${new Date(item.expires_on + "T00:00:00").toLocaleDateString()}${item.lot_number ? `<small>Lot: ${escape(item.lot_number)}</small>` : ""}</li>`).join("");
    windowRef.document.write(`<!doctype html><html><head><title>${escape(selectedPet.PetName)} care instructions</title><style>body{font:15px Arial,sans-serif;max-width:760px;margin:36px auto;color:#173f55;line-height:1.5}header{border-bottom:5px solid #00b4d8;padding-bottom:18px}h1{margin:4px 0}h2{font-size:18px;margin-top:26px;border-bottom:1px solid #dbe6eb;padding-bottom:6px}.meta{color:#617580}.instructions{white-space:pre-wrap;background:#f4fafb;border-left:5px solid #00b4d8;padding:16px}ul{padding-left:22px}li{margin:9px 0}small{display:block;color:#617580}.footer{margin-top:30px;padding-top:14px;border-top:1px solid #dbe6eb;color:#617580}@media print{body{margin:.35in}}</style></head><body><header><small>${escape(businessName).toUpperCase()}</small><h1>Visit &amp; Home-Care Instructions</h1><div class="meta">${escape(selectedPet.PetName)} · ${escape(owner ? `${owner.FirstName} ${owner.LastName}` : "Pet parent")} · ${new Date(encounter.created_at).toLocaleDateString()}</div></header>${encounter.diagnoses.length ? `<h2>Assessment</h2><p>${encounter.diagnoses.map(escape).join(", ")}</p>` : ""}${treatmentRows ? `<h2>Treatments provided today</h2><ul>${treatmentRows}</ul>` : ""}${vaccineRows ? `<h2>Vaccinations administered</h2><ul>${vaccineRows}</ul>` : ""}<h2>Home-care instructions</h2><div class="instructions">${escape(encounter.client_instructions || "No specific home-care instructions were recorded.")}</div>${encounter.follow_up_on ? `<h2>Follow-up</h2><p>Please return on or around <strong>${new Date(encounter.follow_up_on + "T00:00:00").toLocaleDateString()}</strong>, or sooner if you have concerns.</p>` : ""}<p class="footer">Contact ${escape(businessName)} if symptoms worsen or you have questions about today’s care.</p><script>window.onload=()=>window.print()</script></body></html>`);
    windowRef.document.close();
  }

  if (loading) return <p>Loading veterinary records…</p>;
  return <>
    <header className="dashboard-header vet-header"><div><p className="eyebrow">Veterinary module</p><h2>Clinical workspace</h2><p>Today&apos;s patients, SOAP encounters, and protected medical records.</p></div>{!readOnly && selectedPet && <button className="primary-button" onClick={() => startEncounter()}>+ New encounter</button>}</header>
    {message && <p className={message.toLowerCase().includes("saved") || message.toLowerCase().includes("finalized") || message.toLowerCase().includes("added") ? "pet-success" : "error-message"} role="status">{message}</p>}
    <section className="vet-summary">
      <button type="button" disabled={todayPatientCount===0} aria-pressed={summaryView==="today"} onClick={()=>setSummaryView(current=>current==="today"?null:"today")}><span>Veterinary patients today</span><strong>{todayPatientCount}</strong><small>View scheduled patient charts</small></button>
      <button type="button" disabled={draftEncounters.length===0} aria-pressed={summaryView==="drafts"} onClick={()=>setSummaryView(current=>current==="drafts"?null:"drafts")}><span>Open drafts</span><strong>{draftEncounters.length}</strong><small>Open notes waiting for finalization</small></button>
      <button type="button" disabled={activeAlerts.length===0} aria-pressed={summaryView==="alerts"} onClick={()=>setSummaryView(current=>current==="alerts"?null:"alerts")}><span>Active alerts</span><strong>{activeAlerts.length}</strong><small>Find allergies, handling, and medical alerts</small></button>
      <button type="button" disabled={followUpEncounters.length===0} aria-pressed={summaryView==="followups"} onClick={()=>setSummaryView(current=>current==="followups"?null:"followups")}><span>Upcoming follow-ups</span><strong>{followUpEncounters.length}</strong><small>Open rechecks and recommended care</small></button>
    </section>
    {summaryView&&<section className="dashboard-panel vet-summary-results"><div className="panel-heading"><div><p className="eyebrow">Quick access</p><h3>{summaryView==="today"?"Veterinary patients today":summaryView==="drafts"?"Open encounter drafts":summaryView==="alerts"?"Active medical alerts":"Upcoming follow-ups"}</h3></div><button className="secondary-button" onClick={()=>setSummaryView(null)}>Close</button></div><div>
      {summaryView==="today"&&todayAppointments.flatMap(appointment=>petsForAppointment(appointment.id).map(pet=><button key={`${appointment.id}-${pet.id}`} onClick={()=>openSummaryRecord(pet.id)}><span><strong>{pet.PetName}</strong><small>{ownerFor(pet.id)?`${ownerFor(pet.id)!.FirstName} ${ownerFor(pet.id)!.LastName}`:"No owner linked"}</small></span><b>{new Date(appointment.start_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</b></button>))}
      {summaryView==="drafts"&&draftEncounters.map(encounter=>{const pet=pets.find(item=>item.id===encounter.pet_id);return <button key={encounter.id} onClick={()=>openSummaryRecord(encounter.pet_id,encounter.id)}><span><strong>{pet?.PetName??"Patient"}</strong><small>{encounter.chief_complaint??encounter.visit_type.replaceAll("_"," ")}</small></span><b>Open draft</b></button>})}
      {summaryView==="alerts"&&activeAlerts.map(alert=>{const pet=pets.find(item=>item.id===alert.pet_id);return <button key={alert.id} onClick={()=>openSummaryRecord(alert.pet_id)}><span><strong>{pet?.PetName??"Patient"}</strong><small>{alert.alert_type}: {alert.description}</small></span><b>{alert.severity}</b></button>})}
      {summaryView==="followups"&&followUpEncounters.map(encounter=>{const pet=pets.find(item=>item.id===encounter.pet_id);return <button key={encounter.id} onClick={()=>openSummaryRecord(encounter.pet_id,encounter.id)}><span><strong>{pet?.PetName??"Patient"}</strong><small>{encounter.chief_complaint??encounter.visit_type.replaceAll("_"," ")}</small></span><b>{new Date(encounter.follow_up_on!+"T00:00:00").toLocaleDateString()}</b></button>})}
    </div></section>}

    <section className="dashboard-panel vet-today">
      <div className="panel-heading"><div><p className="eyebrow">Clinical board</p><h3>Today&apos;s patients</h3></div><span>{todayPatientCount} scheduled</span></div>
      <div className="vet-today-list">{todayAppointments.length === 0 ? <p className="settings-help">No veterinary appointments are scheduled today.</p> : todayAppointments.flatMap((appointment) => {
        const linkedPets = petsForAppointment(appointment.id), owner = clients.find((client) => client.id === appointment.client_id);
        return (linkedPets.length ? linkedPets : [null]).map((pet, index) => <article key={`${appointment.id}-${pet?.id ?? index}`}><time>{new Date(appointment.start_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time><div><strong>{pet?.PetName ?? "Patient not linked"}</strong><span>{owner ? `${owner.FirstName} ${owner.LastName}` : "Owner unavailable"}</span></div><span className={`vet-visit-status ${appointment.status}`}>{appointment.status.replaceAll("_", " ")}</span>{!readOnly && pet && <button className="secondary-button" onClick={() => startEncounter(appointment, pet)}>Open {pet.PetName}&apos;s chart</button>}</article>);
      })}</div>
    </section>

    <div className="vet-workspace">
      <aside className="dashboard-panel vet-patient-list">
        <div><p className="eyebrow">Patients</p><h3>Medical charts</h3></div>
        <input type="search" placeholder="Search patient or owner" value={search} onChange={(event) => setSearch(event.target.value)} />
        <div>{filteredPets.map((pet) => { const owner = ownerFor(pet.id), activeAlerts = alerts.filter((item) => item.pet_id === pet.id && item.is_active).length;
          return <button key={pet.id} className={pet.id === selectedPetId ? "selected" : ""} onClick={() => choosePet(pet.id)}><span className="vet-patient-avatar">{pet.PetName.slice(0, 1).toUpperCase()}</span><span><strong>{pet.PetName}</strong><small>{owner ? `${owner.FirstName} ${owner.LastName}` : "No owner linked"}</small></span>{activeAlerts > 0 && <b>{activeAlerts}</b>}</button>;
        })}</div>
      </aside>

      <main className="vet-chart">
        {!selectedPet ? <section className="dashboard-panel empty-state"><h3>No patient selected</h3><p>Add a pet or choose a chart to begin.</p></section> : <>
          <section className="dashboard-panel vet-chart-header" id="vet-chart-header">
            <ProfilePhoto businessId={businessId} entity="pets" table="PET" recordId={selectedPet.id} photoPath={selectedPet.profile_photo_path} initials={selectedPet.PetName.slice(0, 1).toUpperCase()} label={selectedPet.PetName} compact />
            <div><p className="eyebrow">Patient chart</p><h2>{selectedPet.PetName}</h2><p>{[selectedPet.species, selectedPet.PetBreed, age(selectedPet)].filter(Boolean).join(" · ")}</p></div>
            <div><strong>{ownerFor(selectedPet.id) ? `${ownerFor(selectedPet.id)!.FirstName} ${ownerFor(selectedPet.id)!.LastName}` : "No owner linked"}</strong><span>{ownerFor(selectedPet.id)?.PhoneNumber ?? "No phone"}</span><span>{ownerFor(selectedPet.id)?.EmailAddress ?? "No email"}</span></div>
            <button className="secondary-button vet-print" onClick={() => window.print()}>Print chart</button>
          </section>

          {selectedAlerts.length > 0 && <section className="vet-alert-strip">{selectedAlerts.map((alert) => <article className={alert.severity} key={alert.id}><div><strong>{alert.alert_type}: {alert.description}</strong><span>{alert.severity}</span></div>{!readOnly && <button onClick={() => void resolveAlert(alert.id)}>Resolve</button>}</article>)}</section>}

          <details className="dashboard-panel vet-section" open={!selectedProfile}>
            <summary><div><p className="eyebrow">Demographics</p><h3>Patient details</h3></div><span>{selectedProfile ? "On file" : "Needs review"}</span></summary>
            <form className="vet-profile-form" onSubmit={saveProfile}>
              <label>Sex<select disabled={readOnly} value={profileForm.sex} onChange={(event) => setProfileForm({ ...profileForm, sex: event.target.value })}><option value="unknown">Unknown</option><option value="female">Female</option><option value="male">Male</option></select></label>
              <label>Reproductive status<select disabled={readOnly} value={profileForm.reproductive_status} onChange={(event) => setProfileForm({ ...profileForm, reproductive_status: event.target.value })}><option value="unknown">Unknown</option><option value="intact">Intact</option><option value="spayed">Spayed</option><option value="neutered">Neutered</option></select></label>
              <label>Color / markings<input disabled={readOnly} value={profileForm.color_markings} onChange={(event) => setProfileForm({ ...profileForm, color_markings: event.target.value })} /></label>
              <label>Microchip number<input disabled={readOnly} value={profileForm.microchip_number} onChange={(event) => setProfileForm({ ...profileForm, microchip_number: event.target.value })} /></label>
              {!readOnly && <button className="primary-button" disabled={saving}>Save patient details</button>}
            </form>
          </details>

          <div className="vet-two-column">
            <section className="dashboard-panel vet-section">
              <div className="panel-heading"><div><p className="eyebrow">Safety</p><h3>Medical alerts</h3></div><strong>{selectedAlerts.length} active</strong></div>
              {!readOnly && <form className="vet-mini-form" onSubmit={addAlert}><div><select value={alertForm.alert_type} onChange={(event) => setAlertForm({ ...alertForm, alert_type: event.target.value })}><option value="allergy">Allergy</option><option value="medication">Medication</option><option value="handling">Handling</option><option value="medical">Medical</option><option value="other">Other</option></select><select value={alertForm.severity} onChange={(event) => setAlertForm({ ...alertForm, severity: event.target.value })}><option value="information">Information</option><option value="important">Important</option><option value="critical">Critical</option></select></div><input required placeholder="Alert description" value={alertForm.description} onChange={(event) => setAlertForm({ ...alertForm, description: event.target.value })} /><button className="secondary-button">Add alert</button></form>}
              {selectedAlerts.length === 0 && <p className="settings-help">No active medical alerts.</p>}
            </section>
            <section className="dashboard-panel vet-section">
              <div className="panel-heading"><div><p className="eyebrow">Longitudinal record</p><h3>Problem list</h3></div><strong>{selectedProblems.filter((item) => item.status !== "resolved").length} open</strong></div>
              {!readOnly && <form className="vet-mini-form" onSubmit={addProblem}><input required placeholder="Problem or condition" value={problemForm.name} onChange={(event) => setProblemForm({ ...problemForm, name: event.target.value })} /><div><input type="date" value={problemForm.onset_on} onChange={(event) => setProblemForm({ ...problemForm, onset_on: event.target.value })} /><input placeholder="Notes" value={problemForm.notes} onChange={(event) => setProblemForm({ ...problemForm, notes: event.target.value })} /></div><button className="secondary-button">Add problem</button></form>}
              <div className="vet-problem-list">{selectedProblems.map((problem) => <article key={problem.id}><div><strong>{problem.name}</strong><span>{problem.status}{problem.onset_on ? ` · since ${new Date(problem.onset_on + "T00:00:00").toLocaleDateString()}` : ""}</span></div>{!readOnly && <select value={problem.status} onChange={(event) => void changeProblem(problem, event.target.value)}><option value="active">Active</option><option value="monitoring">Monitoring</option><option value="resolved">Resolved</option></select>}</article>)}</div>
            </section>
          </div>

          <VeterinaryMedications businessId={businessId} petId={selectedPet.id} petName={selectedPet.PetName} ownerName={ownerFor(selectedPet.id) ? `${ownerFor(selectedPet.id)!.FirstName} ${ownerFor(selectedPet.id)!.LastName}` : "Pet parent"} encounters={selectedEncounters} readOnly={readOnly} />

          {showEncounterForm && !readOnly && <section className="dashboard-panel vet-encounter-form">
            <div className="panel-heading"><div><p className="eyebrow">{editingEncounterId ? "Draft medical record" : "New medical record"}</p><h3>{editingEncounterId ? "Continue encounter" : "Clinical encounter"}</h3><p className="vet-encounter-patient">Patient: <strong>{pets.find((pet) => pet.id === encounterPetId)?.PetName ?? "Select a patient"}</strong> · This record will remain attached to this patient.</p></div><button className="secondary-button" type="button" onClick={() => { setShowEncounterForm(false); setEditingEncounterId(null); setEncounterPetId(null); }}>Close</button></div>
            <form onSubmit={saveEncounter}>
              <div className="vet-form-grid"><label>Visit type<select value={encounterForm.visit_type} onChange={(event) => setEncounterForm({ ...encounterForm, visit_type: event.target.value })}><option value="wellness">Wellness exam</option><option value="sick">Sick visit</option><option value="urgent">Urgent visit</option><option value="recheck">Recheck</option><option value="vaccine">Vaccine visit</option><option value="surgery">Procedure / surgery</option><option value="other">Other</option></select></label><label>Linked appointment<select value={encounterForm.appointment_id} onChange={(event) => setEncounterForm({ ...encounterForm, appointment_id: event.target.value })}><option value="">Not linked</option>{appointments.filter((item) => appointmentPets.some((link) => link.appointment_id === item.id && link.pet_id === selectedPetId)).map((item) => <option value={item.id} key={item.id}>{new Date(item.start_at).toLocaleString()}</option>)}</select></label><label className="full">Chief complaint<input value={encounterForm.chief_complaint} onChange={(event) => setEncounterForm({ ...encounterForm, chief_complaint: event.target.value })} placeholder="Reason for today's visit" /></label></div>
              <fieldset><legend>Vitals</legend><div className="vet-vitals"><label>Weight (kg)<input type="number" min="0.01" step="0.01" value={encounterForm.weight_kg} onChange={(event) => setEncounterForm({ ...encounterForm, weight_kg: event.target.value })} /></label><label>Temperature °F<input type="number" min="80" max="115" step="0.1" value={encounterForm.temperature_f} onChange={(event) => setEncounterForm({ ...encounterForm, temperature_f: event.target.value })} /></label><label>Pulse / min<input type="number" min="0" max="400" value={encounterForm.pulse_bpm} onChange={(event) => setEncounterForm({ ...encounterForm, pulse_bpm: event.target.value })} /></label><label>Respiration / min<input type="number" min="0" max="300" value={encounterForm.respiration_bpm} onChange={(event) => setEncounterForm({ ...encounterForm, respiration_bpm: event.target.value })} /></label><label>Body condition (1–9)<input type="number" min="1" max="9" step="0.5" value={encounterForm.body_condition_score} onChange={(event) => setEncounterForm({ ...encounterForm, body_condition_score: event.target.value })} /></label><label>Pain score (0–10)<input type="number" min="0" max="10" value={encounterForm.pain_score} onChange={(event) => setEncounterForm({ ...encounterForm, pain_score: event.target.value })} /></label></div></fieldset>
              <div className="vet-soap-grid"><label><span><b>S</b> Subjective</span><textarea rows={6} value={encounterForm.subjective} onChange={(event) => setEncounterForm({ ...encounterForm, subjective: event.target.value })} placeholder="History, symptoms, diet, behavior, medications, owner observations…" /></label><label><span><b>O</b> Objective</span><textarea rows={6} value={encounterForm.objective} onChange={(event) => setEncounterForm({ ...encounterForm, objective: event.target.value })} placeholder="Physical examination and measurable findings…" /></label><label><span><b>A</b> Assessment</span><textarea rows={6} value={encounterForm.assessment} onChange={(event) => setEncounterForm({ ...encounterForm, assessment: event.target.value })} placeholder="Clinical assessment and differential diagnoses…" /></label><label><span><b>P</b> Plan</span><textarea rows={6} value={encounterForm.plan} onChange={(event) => setEncounterForm({ ...encounterForm, plan: event.target.value })} placeholder="Diagnostics, treatments, prevention, monitoring, and follow-up…" /></label></div>
              <div className="vet-form-grid"><label className="full">Diagnoses<input value={encounterForm.diagnoses} onChange={(event) => setEncounterForm({ ...encounterForm, diagnoses: event.target.value })} placeholder="Separate multiple diagnoses with commas" /></label><label>Follow-up date<input type="date" value={encounterForm.follow_up_on} onChange={(event) => setEncounterForm({ ...encounterForm, follow_up_on: event.target.value })} /></label><label className="full">Client instructions<textarea rows={4} value={encounterForm.client_instructions} onChange={(event) => setEncounterForm({ ...encounterForm, client_instructions: event.target.value })} placeholder="Home care, monitoring, return precautions, and next steps…" /></label></div>
              <button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save draft encounter"}</button>
            </form>
          </section>}

          <section className="dashboard-panel vet-history">
            <div className="panel-heading"><div><p className="eyebrow">Medical timeline</p><h3>Clinical encounters</h3></div><strong>{selectedEncounters.length} records</strong></div>
            {selectedEncounters.length === 0 ? <div className="empty-state"><h3>No encounters yet</h3><p>Start the first clinical record for {selectedPet.PetName}.</p></div> : selectedEncounters.map((encounter) => <article className={`vet-encounter-card ${encounter.status}`} id={`vet-encounter-${encounter.id}`} key={encounter.id}>
              <header><div><span className={`vet-record-status ${encounter.status}`}>{encounter.status}</span><h3>{encounter.visit_type.replaceAll("_", " ")}</h3><p>{new Date(encounter.created_at).toLocaleString()} {encounter.chief_complaint ? `· ${encounter.chief_complaint}` : ""}</p></div><div className="vet-record-actions">
                {encounter.status !== "entered_in_error" && <button className="secondary-button" onClick={() => printClientInstructions(encounter)}>Take-home instructions</button>}
                {encounter.status !== "entered_in_error" && ownerFor(encounter.pet_id) && <button className="secondary-button" onClick={() => setPlanFor(planFor === encounter.id ? null : encounter.id)}>{planFor === encounter.id ? "Close treatment plan" : "Estimate & treatment plan"}</button>}
                {encounter.status === "draft" && !readOnly && <>
                  <button className="secondary-button" onClick={() => { setTreatmentFor(encounter.id); setVaccineFor(null); }}>+ Treatment</button>
                  <button className="secondary-button" onClick={() => { setVaccineFor(encounter.id); setTreatmentFor(null); }}>+ Vaccine</button>
                  <button className="secondary-button" onClick={() => editEncounter(encounter)}>Edit draft</button>
                  <button className="primary-button" disabled={saving} onClick={() => void finalizeEncounter(encounter)}>Finalize & lock</button>
                </>}
                {(["finalized", "amended"].includes(encounter.status)) && !readOnly && <><button className="secondary-button" onClick={() => setAmendmentFor(encounter.id)}>Add amendment</button><button className="secondary-button correction-button" onClick={() => { setCorrectionFor(encounter.id); setCorrectionForm({ pet_id: "", reason: "" }); }}>Wrong patient?</button></>}
              </div></header>
              {encounter.status === "entered_in_error" && <div className="vet-entered-in-error"><strong>Entered in error — do not use for clinical care</strong><p>{encounter.entered_in_error_reason}</p>{encounter.entered_in_error_at && <small>Corrected {new Date(encounter.entered_in_error_at).toLocaleString()} · Original preserved for audit</small>}</div>}
              <div className="vet-vital-readout">{encounter.weight_kg != null && <span>Weight <b>{encounter.weight_kg} kg</b></span>}{encounter.temperature_f != null && <span>Temp <b>{encounter.temperature_f} °F</b></span>}{encounter.pulse_bpm != null && <span>Pulse <b>{encounter.pulse_bpm}</b></span>}{encounter.respiration_bpm != null && <span>Resp <b>{encounter.respiration_bpm}</b></span>}{encounter.body_condition_score != null && <span>BCS <b>{encounter.body_condition_score}/9</b></span>}{encounter.pain_score != null && <span>Pain <b>{encounter.pain_score}/10</b></span>}</div>
              <div className="vet-soap-readout"><section><b>S</b><div>{encounter.subjective || "Not recorded"}</div></section><section><b>O</b><div>{encounter.objective || "Not recorded"}</div></section><section><b>A</b><div>{encounter.assessment || "Not recorded"}</div></section><section><b>P</b><div>{encounter.plan || "Not recorded"}</div></section></div>
              {encounter.diagnoses.length > 0 && <div className="vet-diagnoses">{encounter.diagnoses.map((diagnosis) => <span key={diagnosis}>{diagnosis}</span>)}</div>}
              {planFor === encounter.id && ownerFor(encounter.pet_id) && <VeterinaryTreatmentPlan businessId={businessId} encounterId={encounter.id} petId={encounter.pet_id} petName={selectedPet.PetName} clientId={ownerFor(encounter.pet_id)!.id} clientName={`${ownerFor(encounter.pet_id)!.FirstName} ${ownerFor(encounter.pet_id)!.LastName}`} readOnly={readOnly} onOpenInvoice={onOpenInvoice} />}
              {treatments.some((item) => item.encounter_id === encounter.id) && <section className="vet-care-delivered"><strong>Treatments provided</strong><div>{treatments.filter((item) => item.encounter_id === encounter.id).map((item) => <article key={item.id}><div><b>{item.name}</b><span>{item.treatment_type.replaceAll("_", " ")}</span></div><p>{[item.dose, item.route, item.administration_site, item.quantity].filter(Boolean).join(" · ")}</p>{item.notes && <small>{item.notes}</small>}</article>)}</div></section>}
              {vaccinations.some((item) => item.encounter_id === encounter.id) && <section className="vet-care-delivered vaccines"><strong>Vaccinations administered</strong><div>{vaccinations.filter((item) => item.encounter_id === encounter.id).map((item) => <article key={item.id}><div><b>{item.vaccine_name}</b><span>Due {new Date(item.expires_on + "T00:00:00").toLocaleDateString()}</span></div><p>{[item.administration_site, item.lot_number ? `Lot ${item.lot_number}` : null, item.provider].filter(Boolean).join(" · ")}</p></article>)}</div></section>}
              {encounter.client_instructions && <div className="vet-instructions"><strong>Client instructions</strong><p>{encounter.client_instructions}</p></div>}
              {treatmentFor === encounter.id && <form className="vet-clinical-entry-form" onSubmit={addTreatment}><div className="panel-heading"><div><p className="eyebrow">Care delivered</p><h4>Add treatment or procedure</h4></div><button type="button" onClick={() => setTreatmentFor(null)}>×</button></div><div className="vet-form-grid"><label>Type<select value={treatmentForm.treatment_type} onChange={(event) => setTreatmentForm({ ...treatmentForm, treatment_type: event.target.value })}><option value="treatment">Treatment</option><option value="procedure">Procedure</option><option value="injection">Injection</option><option value="diagnostic">Diagnostic</option><option value="supportive_care">Supportive care</option><option value="other">Other</option></select></label><label>Name<input required value={treatmentForm.name} onChange={(event) => setTreatmentForm({ ...treatmentForm, name: event.target.value })} placeholder="Fluid therapy, nail trim, ear cleaning…" /></label><label>Dose / amount<input value={treatmentForm.dose} onChange={(event) => setTreatmentForm({ ...treatmentForm, dose: event.target.value })} placeholder="250 mL" /></label><label>Route<input value={treatmentForm.route} onChange={(event) => setTreatmentForm({ ...treatmentForm, route: event.target.value })} placeholder="SQ, IM, IV, topical…" /></label><label>Site<input value={treatmentForm.administration_site} onChange={(event) => setTreatmentForm({ ...treatmentForm, administration_site: event.target.value })} placeholder="Right shoulder" /></label><label>Quantity<input value={treatmentForm.quantity} onChange={(event) => setTreatmentForm({ ...treatmentForm, quantity: event.target.value })} /></label><label className="full">Notes<textarea rows={3} value={treatmentForm.notes} onChange={(event) => setTreatmentForm({ ...treatmentForm, notes: event.target.value })} /></label></div><button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Add to encounter"}</button></form>}
              {vaccineFor === encounter.id && <form className="vet-clinical-entry-form" onSubmit={addAdministeredVaccine}><div className="panel-heading"><div><p className="eyebrow">Preventive care</p><h4>Record administered vaccine</h4></div><button type="button" onClick={() => setVaccineFor(null)}>×</button></div><div className="vet-form-grid"><label>Configured vaccine<select value={vaccineForm.requirement_id} onChange={(event) => setVaccineForm({ ...vaccineForm, requirement_id: event.target.value, vaccine_name: "" })}><option value="">Other vaccine</option>{vaccineRequirements.filter((item) => item.species.toLowerCase() === "all" || item.species.toLowerCase() === selectedPet.species.toLowerCase()).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{!vaccineForm.requirement_id && <label>Vaccine name<input required value={vaccineForm.vaccine_name} onChange={(event) => setVaccineForm({ ...vaccineForm, vaccine_name: event.target.value })} /></label>}<label>Administered<input required type="date" value={vaccineForm.administered_on} onChange={(event) => setVaccineForm({ ...vaccineForm, administered_on: event.target.value })} /></label><label>Next due / expires<input required type="date" value={vaccineForm.expires_on} onChange={(event) => setVaccineForm({ ...vaccineForm, expires_on: event.target.value })} /></label><label>Manufacturer / provider<input value={vaccineForm.provider} onChange={(event) => setVaccineForm({ ...vaccineForm, provider: event.target.value })} placeholder={businessName} /></label><label>Lot / serial number<input value={vaccineForm.lot_number} onChange={(event) => setVaccineForm({ ...vaccineForm, lot_number: event.target.value })} /></label><label>Administration site<input value={vaccineForm.administration_site} onChange={(event) => setVaccineForm({ ...vaccineForm, administration_site: event.target.value })} placeholder="Right rear limb" /></label></div><button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Record vaccination"}</button></form>}
              {correctionFor === encounter.id && <form className="vet-correction-form" onSubmit={correctEncounterPatient}><div><p className="eyebrow">Medical record correction</p><h4>Move a mistaken record safely</h4><p>The original will be marked entered in error. A copy will open as a draft under the correct patient for review.</p></div><label>Correct patient<select required value={correctionForm.pet_id} onChange={(event) => setCorrectionForm({ ...correctionForm, pet_id: event.target.value })}><option value="">Select the correct patient</option>{pets.filter((pet) => pet.id !== encounter.pet_id).map((pet) => <option key={pet.id} value={pet.id}>{pet.PetName} · {ownerFor(pet.id) ? `${ownerFor(pet.id)!.FirstName} ${ownerFor(pet.id)!.LastName}` : "No owner"}</option>)}</select></label><label>Reason for correction<textarea required rows={3} value={correctionForm.reason} onChange={(event) => setCorrectionForm({ ...correctionForm, reason: event.target.value })} placeholder="Record was accidentally entered under Oliver instead of Gary." /></label><div><button type="button" className="secondary-button" onClick={() => setCorrectionFor(null)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Correcting…" : "Mark error & create corrected draft"}</button></div></form>}
              {encounter.finalized_at && <small>Finalized {new Date(encounter.finalized_at).toLocaleString()} · Original record locked</small>}
              {amendments.filter((item) => item.encounter_id === encounter.id).map((amendment) => <aside className="vet-amendment" key={amendment.id}><strong>Amendment · {new Date(amendment.created_at).toLocaleString()}</strong><span>Reason: {amendment.reason}</span><p>{amendment.amendment_text}</p></aside>)}
              {amendmentFor === encounter.id && <form className="vet-amendment-form" onSubmit={addAmendment}><label>Reason<input required value={amendmentForm.reason} onChange={(event) => setAmendmentForm({ ...amendmentForm, reason: event.target.value })} placeholder="Why is this amendment necessary?" /></label><label>Amendment<textarea required rows={4} value={amendmentForm.text} onChange={(event) => setAmendmentForm({ ...amendmentForm, text: event.target.value })} /></label><div><button type="button" className="secondary-button" onClick={() => setAmendmentFor(null)}>Cancel</button><button className="primary-button" disabled={saving}>Save amendment</button></div></form>}
            </article>)}
          </section>
          {selectedErrorEncounters.length > 0 && <details className="dashboard-panel vet-error-history"><summary>{selectedErrorEncounters.length} corrected record{selectedErrorEncounters.length === 1 ? "" : "s"} retained for audit</summary><p>These records are excluded from this patient&apos;s medical timeline and printed chart.</p>{selectedErrorEncounters.map((encounter) => <article key={encounter.id}><strong>Entered in error {encounter.entered_in_error_at ? new Date(encounter.entered_in_error_at).toLocaleString() : ""}</strong><span>{encounter.entered_in_error_reason}</span></article>)}</details>}
        </>}
      </main>
    </div>
  </>;
}
