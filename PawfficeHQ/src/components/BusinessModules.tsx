import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import "./BusinessModules.css";

type Props={businessId:string;readOnly?:boolean;onChanged?:(enabled:ModuleKey[])=>void};
type ModuleKey="grooming"|"pet_sitting"|"boarding_daycare"|"veterinary";
type ModuleRow={module_key:ModuleKey;is_enabled:boolean};
const definitions:Array<{key:ModuleKey;name:string;description:string;icon:string}>=[
 {key:"grooming",name:"Grooming",description:"Appointments, grooming notes, before-and-after photos, and report cards.",icon:"✂️"},
 {key:"pet_sitting",name:"Pet sitting",description:"Home visits, access instructions, care checklists, medications, and visit updates.",icon:"🏠"},
 {key:"boarding_daycare",name:"Boarding & daycare",description:"Reservations, kennels, feeding plans, belongings, and daily care logs.",icon:"🛏️"},
 {key:"veterinary",name:"Veterinary",description:"Encounters, medical notes, vaccinations, prescriptions, and protected clinical access.",icon:"🩺"},
];
export default function BusinessModules({businessId,readOnly=false,onChanged}:Props){
 const [rows,setRows]=useState<ModuleRow[]>([]),[message,setMessage]=useState(""),[saving,setSaving]=useState<ModuleKey|null>(null);
 async function load(){const result=await supabase.from("business_module").select("module_key, is_enabled").eq("business_id",businessId);if(result.error)setMessage(result.error.message);else{const loaded=(result.data as ModuleRow[])??[];setRows(loaded);onChanged?.(loaded.filter(row=>row.is_enabled).map(row=>row.module_key))}}
 useEffect(()=>{void load()},[businessId]);
 async function toggle(key:ModuleKey){const current=rows.find(r=>r.module_key===key)?.is_enabled??false;if(current&&rows.filter(r=>r.is_enabled).length===1){setMessage("Keep at least one service module enabled.");return}setSaving(key);setMessage("");const result=await supabase.from("business_module").update({is_enabled:!current,enabled_at:!current?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq("business_id",businessId).eq("module_key",key);setSaving(null);if(result.error)setMessage(result.error.message);else{setMessage(`${definitions.find(x=>x.key===key)?.name} ${current?"disabled":"enabled"}.`);await load()}}
 return <section className="dashboard-panel settings-section"><div><p className="eyebrow">Service modules</p><h3>What does your business offer?</h3><p className="settings-help">Enable any combination. Shared clients, pets, calendar, payments, messages, vaccines, and reports remain connected across every module.</p></div>{message&&<p className="module-message" role="status">{message}</p>}<div className="module-grid">{definitions.map(module=>{const enabled=rows.find(r=>r.module_key===module.key)?.is_enabled??false;return <article className={`module-card ${enabled?"enabled":""}`} key={module.key}><span className="module-icon" aria-hidden="true">{module.icon}</span><div><h4>{module.name}</h4><p>{module.description}</p></div><label className="module-toggle"><input type="checkbox" disabled={readOnly||saving!==null} checked={enabled} onChange={()=>void toggle(module.key)}/><span>{saving===module.key?"Saving…":enabled?"Enabled":"Disabled"}</span></label></article>})}</div></section>;
}
