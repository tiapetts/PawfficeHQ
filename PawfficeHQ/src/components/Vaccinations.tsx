import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import "./Vaccinations.css";

type Props = { businessId: string; readOnly?: boolean };
type Pet = { id: number; PetName: string; species: string };
type Requirement = { id: string; name: string; species: string; proof_required: boolean; alert_days_before: number; is_active: boolean };
type RecordRow = { id: string; pet_id: number; requirement_id: string | null; vaccine_name: string; administered_on: string | null; expires_on: string; provider: string | null; lot_number: string | null; proof_path: string | null; notes: string | null };

const emptyRequirement = { name: "", species: "All", proof_required: true, alert_days_before: "30" };
const emptyRecord = { pet_id: "", requirement_id: "", vaccine_name: "", administered_on: "", expires_on: "", provider: "", lot_number: "", notes: "" };

export function vaccinationState(
  record: { expires_on: string } | undefined,
  requirement: { alert_days_before: number },
) {
  if (!record) return "missing" as const;
  const days = Math.ceil((new Date(`${record.expires_on}T23:59:59`).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "expired" as const;
  if (days <= requirement.alert_days_before) return "warning" as const;
  return "current" as const;
}

export default function Vaccinations({ businessId, readOnly = false }: Props) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [requirementForm, setRequirementForm] = useState(emptyRequirement);
  const [recordForm, setRecordForm] = useState(emptyRecord);
  const [proof, setProof] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadData() {
    const [petResult, requirementResult, recordResult] = await Promise.all([
      supabase.from("PET").select("id, PetName, species").eq("business_id", businessId).is("archived_at", null).order("PetName"),
      supabase.from("vaccine_requirement").select("id, name, species, proof_required, alert_days_before, is_active").eq("business_id", businessId).order("name"),
      supabase.from("pet_vaccination").select("id, pet_id, requirement_id, vaccine_name, administered_on, expires_on, provider, lot_number, proof_path, notes").eq("business_id", businessId).order("expires_on"),
    ]);
    const error = petResult.error || requirementResult.error || recordResult.error;
    if (error) setMessage(error.message);
    else {
      setPets((petResult.data as Pet[]) ?? []);
      setRequirements((requirementResult.data as Requirement[]) ?? []);
      setRecords((recordResult.data as RecordRow[]) ?? []);
    }
  }
  useEffect(() => { void loadData(); }, [businessId]);

  const alerts = useMemo(() => pets.flatMap((pet) => requirements.filter((r) => r.is_active && (r.species === "All" || r.species === pet.species)).map((requirement) => {
    const record = records.filter((item) => item.pet_id === pet.id && (item.requirement_id === requirement.id || item.vaccine_name.toLowerCase() === requirement.name.toLowerCase())).sort((a,b) => b.expires_on.localeCompare(a.expires_on))[0];
    return { pet, requirement, record, state: vaccinationState(record, requirement) };
  })), [pets, requirements, records]);

  async function addRequirement(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage("");
    const { error } = await supabase.from("vaccine_requirement").insert({ business_id: businessId, name: requirementForm.name.trim(), species: requirementForm.species, proof_required: requirementForm.proof_required, alert_days_before: Number(requirementForm.alert_days_before) });
    setSaving(false); if (error) return setMessage(error.message);
    setRequirementForm(emptyRequirement); setMessage("Vaccine requirement added."); await loadData();
  }
  async function toggleRequirement(requirement: Requirement) {
    const { error } = await supabase.from("vaccine_requirement").update({ is_active: !requirement.is_active }).eq("id", requirement.id).eq("business_id", businessId);
    if (error) setMessage(error.message); else await loadData();
  }
  async function addRecord(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage("");
    const requirement = requirements.find((item) => item.id === recordForm.requirement_id);
    let proofPath: string | null = null;
    if (proof) {
      const safeName = proof.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      proofPath = `${businessId}/${recordForm.pet_id}/${crypto.randomUUID()}-${safeName}`;
      const upload = await supabase.storage.from("vaccination-proofs").upload(proofPath, proof, { contentType: proof.type });
      if (upload.error) { setSaving(false); return setMessage(upload.error.message); }
    }
    const { error } = await supabase.from("pet_vaccination").insert({ business_id: businessId, pet_id: Number(recordForm.pet_id), requirement_id: recordForm.requirement_id || null, vaccine_name: requirement?.name ?? recordForm.vaccine_name.trim(), administered_on: recordForm.administered_on || null, expires_on: recordForm.expires_on, provider: recordForm.provider.trim() || null, lot_number: recordForm.lot_number.trim() || null, notes: recordForm.notes.trim() || null, proof_path: proofPath });
    setSaving(false);
    if (error) { if (proofPath) await supabase.storage.from("vaccination-proofs").remove([proofPath]); return setMessage(error.message); }
    setRecordForm(emptyRecord); setProof(null); setMessage("Vaccination record saved."); await loadData();
  }
  async function openProof(path: string) {
    const { data, error } = await supabase.storage.from("vaccination-proofs").createSignedUrl(path, 60);
    if (error) setMessage(error.message); else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return <>
    <header className="dashboard-header"><div><p className="eyebrow">Health & compliance</p><h2>Vaccinations</h2></div></header>
    {message && <p className="pet-success" role="status">{message}</p>}
    <div className="vaccination-layout">
      <section className="dashboard-panel">
        <div className="panel-heading"><div><p className="eyebrow">Business rules</p><h3>Required vaccines</h3></div></div>
        {!readOnly && <form className="vaccination-form" onSubmit={addRequirement}>
          <label className="full-width">Vaccine name<input required value={requirementForm.name} onChange={(e)=>setRequirementForm({...requirementForm,name:e.target.value})} placeholder="Rabies" /></label>
          <label>Species<select value={requirementForm.species} onChange={(e)=>setRequirementForm({...requirementForm,species:e.target.value})}>{["All","Dog","Cat","Bird","Rabbit","Reptile","Other"].map(x=><option key={x}>{x}</option>)}</select></label>
          <label>Alert before expiration<input type="number" min="0" max="365" value={requirementForm.alert_days_before} onChange={(e)=>setRequirementForm({...requirementForm,alert_days_before:e.target.value})} /></label>
          <label className="full-width"><span><input type="checkbox" checked={requirementForm.proof_required} onChange={(e)=>setRequirementForm({...requirementForm,proof_required:e.target.checked})} /> Require uploaded proof</span></label>
          <button className="primary-button full-width" disabled={saving}>Add requirement</button>
        </form>}
        <div>{requirements.map(r=><div className="requirement-row" key={r.id}><div><strong>{r.name}</strong><p>{r.species} · {r.alert_days_before}-day alert · {r.proof_required ? "Proof required" : "Proof optional"}</p></div>{!readOnly&&<button className="secondary-button" onClick={()=>void toggleRequirement(r)}>{r.is_active?"Disable":"Enable"}</button>}</div>)}</div>
      </section>
      <section className="dashboard-panel">
        <div className="panel-heading"><div><p className="eyebrow">Pet records</p><h3>Add vaccination proof</h3></div></div>
        {!readOnly && <form className="vaccination-form" onSubmit={addRecord}>
          <label>Pet<select required value={recordForm.pet_id} onChange={(e)=>setRecordForm({...recordForm,pet_id:e.target.value})}><option value="">Select pet</option>{pets.map(p=><option key={p.id} value={p.id}>{p.PetName}</option>)}</select></label>
          <label>Required vaccine<select value={recordForm.requirement_id} onChange={(e)=>setRecordForm({...recordForm,requirement_id:e.target.value,vaccine_name:""})}><option value="">Other vaccine</option>{requirements.filter(r=>r.is_active).map(r=><option key={r.id} value={r.id}>{r.name} ({r.species})</option>)}</select></label>
          {!recordForm.requirement_id && <label className="full-width">Vaccine name<input required value={recordForm.vaccine_name} onChange={(e)=>setRecordForm({...recordForm,vaccine_name:e.target.value})}/></label>}
          <label>Administered<input type="date" value={recordForm.administered_on} onChange={(e)=>setRecordForm({...recordForm,administered_on:e.target.value})}/></label>
          <label>Expires<input required type="date" value={recordForm.expires_on} onChange={(e)=>setRecordForm({...recordForm,expires_on:e.target.value})}/></label>
          <label>Veterinarian/provider<input value={recordForm.provider} onChange={(e)=>setRecordForm({...recordForm,provider:e.target.value})}/></label>
          <label>Lot number<input value={recordForm.lot_number} onChange={(e)=>setRecordForm({...recordForm,lot_number:e.target.value})}/></label>
          <label className="full-width">Proof (JPG, PNG, WebP or PDF; 10 MB)<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e)=>setProof(e.target.files?.[0]??null)}/></label>
          <label className="full-width">Notes<textarea value={recordForm.notes} onChange={(e)=>setRecordForm({...recordForm,notes:e.target.value})}/></label>
          <button className="primary-button full-width" disabled={saving}>{saving?"Saving…":"Save vaccination"}</button>
        </form>}
      </section>
    </div>
    <section className="dashboard-panel" style={{marginTop:22}}><div className="panel-heading"><div><p className="eyebrow">Compliance</p><h3>Pet vaccine status</h3></div><strong>{alerts.filter(a=>a.state!=="current").length} alerts</strong></div>
      <div className="vaccination-list">{alerts.length===0?<div className="empty-state"><h3>No requirements configured</h3><p>Add the vaccines that matter to your business.</p></div>:alerts.map(({pet,requirement,record,state})=><article className="vaccination-item" key={`${pet.id}-${requirement.id}`}><span className={`vaccination-status ${state}`}>{state}</span><h4>{pet.PetName} · {requirement.name}</h4><p>{record?`Expires ${new Date(record.expires_on+"T00:00:00").toLocaleDateString()}`:"No vaccination record on file"}</p>{record?.provider&&<p>Provider: {record.provider}</p>}{record?.proof_path&&<button className="proof-link secondary-button" onClick={()=>void openProof(record.proof_path!)}>View proof</button>}</article>)}</div>
    </section>
  </>;
}
