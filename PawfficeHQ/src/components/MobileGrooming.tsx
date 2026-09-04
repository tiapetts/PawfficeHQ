import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import "./MobileGrooming.css";

type Props = { businessId: string; readOnly?: boolean };
type Settings = { business_id: string; is_enabled: boolean; base_address: string | null; vehicle_name: string | null; travel_buffer_minutes: number; mileage_rate: number };
type Client = { id: number; FirstName: string; LastName: string; StreetAddress: string | null; AptNumber: string | null; ClientCity: string | null; ClientState: string | null; ClientZip: string | null };
type Appointment = { id: string; client_id: number; start_at: string; end_at: string; status: string };
type Log = { id: string; log_date: string; entry_type: "mileage"|"fuel"; vehicle_name: string|null; start_odometer: number|null; end_odometer: number|null; business_miles: number; fuel_gallons: number|null; fuel_cost: number|null; notes: string|null };

const defaults: Settings = { business_id: "", is_enabled: false, base_address: "", vehicle_name: "", travel_buffer_minutes: 15, mileage_rate: 0 };
const addressFor = (client?: Client) => client ? [client.StreetAddress, client.AptNumber, client.ClientCity, client.ClientState, client.ClientZip].filter(Boolean).join(", ") : "";
const mapsUrl = (address: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;

export default function MobileGrooming({ businessId, readOnly=false }: Props) {
  const [settings,setSettings]=useState<Settings>({...defaults,business_id:businessId});
  const [clients,setClients]=useState<Client[]>([]),[appointments,setAppointments]=useState<Appointment[]>([]),[logs,setLogs]=useState<Log[]>([]);
  const [date,setDate]=useState(()=>new Date().toISOString().slice(0,10));
  const [entryType,setEntryType]=useState<"mileage"|"fuel">("mileage"),[start,setStart]=useState(""),[end,setEnd]=useState(""),[gallons,setGallons]=useState(""),[cost,setCost]=useState(""),[notes,setNotes]=useState("");
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState("");

  async function load() {
    setLoading(true);
    const [s,c,a,l]=await Promise.all([
      supabase.from("mobile_grooming_settings").select("*").eq("business_id",businessId).maybeSingle(),
      supabase.from("CLIENT").select("id, FirstName, LastName, StreetAddress, AptNumber, ClientCity, ClientState, ClientZip").eq("business_id",businessId).is("archived_at",null),
      supabase.from("appointment").select("id, client_id, start_at, end_at, status").eq("business_id",businessId).gte("start_at",`${date}T00:00:00`).lt("start_at",`${date}T23:59:59`).not("status","in",'("cancelled","void")').order("start_at"),
      supabase.from("mobile_grooming_travel_log").select("*").eq("business_id",businessId).order("log_date",{ascending:false}).limit(100),
    ]);
    const error=s.error||c.error||a.error||l.error;
    if(error)setMessage(error.message); else {setSettings(s.data?{...defaults,...s.data}:{...defaults,business_id:businessId});setClients(c.data??[]);setAppointments(a.data??[]);setLogs((l.data as Log[]|null)??[]);}
    setLoading(false);
  }
  // `load` intentionally refreshes whenever the selected route date changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(()=>{void load()},[businessId,date]);

  const stops=useMemo(()=>appointments.map(appointment=>{const client=clients.find(item=>item.id===appointment.client_id);return {appointment,client,address:addressFor(client)}}),[appointments,clients]);
  const monthLogs=useMemo(()=>logs.filter(log=>log.log_date.startsWith(date.slice(0,7))),[logs,date]);
  const miles=monthLogs.reduce((sum,log)=>sum+Number(log.business_miles||0),0), fuel=monthLogs.reduce((sum,log)=>sum+Number(log.fuel_cost||0),0);
  const routeUrl=useMemo(()=>{const addresses=stops.map(stop=>stop.address).filter(Boolean);if(!addresses.length)return "";const origin=settings.base_address?.trim();const destination=origin||addresses[addresses.length-1];const waypoints=(origin?[...addresses]:addresses.slice(0,-1)).join("|");return `https://www.google.com/maps/dir/?api=1${origin?`&origin=${encodeURIComponent(origin)}`:""}&destination=${encodeURIComponent(destination)}${waypoints?`&waypoints=${encodeURIComponent(waypoints)}`:""}&travelmode=driving`;},[stops,settings.base_address]);

  async function saveSettings(){setSaving(true);setMessage("");const {error}=await supabase.from("mobile_grooming_settings").upsert({...settings,business_id:businessId,updated_at:new Date().toISOString()},{onConflict:"business_id"});setSaving(false);setMessage(error?error.message:"Mobile grooming settings saved.");}
  async function addLog(event:FormEvent){event.preventDefault();setSaving(true);setMessage("");const {error}=await supabase.from("mobile_grooming_travel_log").insert({business_id:businessId,log_date:date,entry_type:entryType,vehicle_name:settings.vehicle_name?.trim()||null,start_odometer:entryType==="mileage"?Number(start):null,end_odometer:entryType==="mileage"?Number(end):null,fuel_gallons:entryType==="fuel"?Number(gallons):null,fuel_cost:entryType==="fuel"?Number(cost):null,notes:notes.trim()||null});setSaving(false);if(error){setMessage(error.message);return}setStart("");setEnd("");setGallons("");setCost("");setNotes("");setMessage("Travel entry saved.");await load();}
  async function removeLog(id:string){if(readOnly)return;const {error}=await supabase.from("mobile_grooming_travel_log").delete().eq("id",id).eq("business_id",businessId);if(error)setMessage(error.message);else setLogs(current=>current.filter(log=>log.id!==id));}

  if(loading)return <p>Loading mobile grooming…</p>;
  return <>
    <header className="dashboard-header"><div><p className="eyebrow">Grooming on the go</p><h2>Mobile grooming</h2><p>Plan today’s stops, navigate to clients, and track vehicle expenses.</p></div><label className="mobile-grooming-date">Route date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label></header>
    {message&&<p className="settings-success">{message}</p>}
    <section className="dashboard-panel mobile-settings"><div><p className="eyebrow">Configuration</p><h3>Mobile operation</h3></div><div className="mobile-settings-grid"><label className="mobile-toggle"><input type="checkbox" disabled={readOnly} checked={settings.is_enabled} onChange={e=>setSettings({...settings,is_enabled:e.target.checked})}/><span>Enable mobile grooming for this business</span></label><label>Route starting address<input disabled={readOnly} placeholder="Business, home, or van starting point" value={settings.base_address??""} onChange={e=>setSettings({...settings,base_address:e.target.value})}/></label><label>Vehicle name<input disabled={readOnly} placeholder="Grooming Van 1" value={settings.vehicle_name??""} onChange={e=>setSettings({...settings,vehicle_name:e.target.value})}/></label><label>Travel buffer (minutes)<input type="number" min="0" max="180" disabled={readOnly} value={settings.travel_buffer_minutes} onChange={e=>setSettings({...settings,travel_buffer_minutes:Number(e.target.value)})}/></label><label>Mileage reimbursement rate<input type="number" min="0" step="0.001" disabled={readOnly} value={settings.mileage_rate} onChange={e=>setSettings({...settings,mileage_rate:Number(e.target.value)})}/></label></div>{!readOnly&&<button type="button" className="primary-button" disabled={saving} onClick={()=>void saveSettings()}>Save mobile settings</button>}</section>
    {!settings.is_enabled?<section className="dashboard-panel mobile-empty"><h3>Mobile grooming is turned off</h3><p>Enable it above when this business is ready to schedule work on the road.</p></section>:<>
      <section className="dashboard-panel mobile-route-panel"><div className="mobile-route-heading"><div><p className="eyebrow">Daily route</p><h3>{new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}</h3><p>{stops.length} stops · {settings.travel_buffer_minutes} minute travel buffer</p></div>{routeUrl&&<a className="primary-button" href={routeUrl} target="_blank" rel="noreferrer">Open full route in Google Maps</a>}</div><div className="mobile-stop-list">{stops.length===0?<p>No appointments scheduled for this date.</p>:stops.map((stop,index)=><article key={stop.appointment.id} className="mobile-stop"><span className="stop-number">{index+1}</span><div><strong>{new Date(stop.appointment.start_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})} · {stop.client?`${stop.client.FirstName} ${stop.client.LastName}`:"Unknown client"}</strong>{stop.address?<a href={mapsUrl(stop.address)} target="_blank" rel="noreferrer">{stop.address}</a>:<em>Address missing — update the client profile</em>}</div>{stop.address&&<a className="secondary-button" href={mapsUrl(stop.address)} target="_blank" rel="noreferrer">Navigate</a>}</article>)}</div></section>
      <section className="mobile-finance-grid"><div className="dashboard-panel"><p className="eyebrow">This month</p><h3>Mileage & fuel</h3><dl className="mobile-totals"><div><dt>Business miles</dt><dd>{miles.toFixed(1)}</dd></div><div><dt>Mileage value</dt><dd>${(miles*Number(settings.mileage_rate||0)).toFixed(2)}</dd></div><div><dt>Fuel spending</dt><dd>${fuel.toFixed(2)}</dd></div></dl></div><form className="dashboard-panel mobile-log-form" onSubmit={addLog}><p className="eyebrow">Vehicle log</p><h3>Add travel entry</h3><label>Entry type<select disabled={readOnly} value={entryType} onChange={e=>setEntryType(e.target.value as "mileage"|"fuel")}><option value="mileage">Mileage</option><option value="fuel">Fuel purchase</option></select></label>{entryType==="mileage"?<div className="mobile-pair"><label>Starting odometer<input required type="number" step="0.1" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Ending odometer<input required type="number" step="0.1" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>:<div className="mobile-pair"><label>Gallons<input required type="number" min="0.001" step="0.001" value={gallons} onChange={e=>setGallons(e.target.value)}/></label><label>Total cost<input required type="number" min="0" step="0.01" value={cost} onChange={e=>setCost(e.target.value)}/></label></div>}<label>Notes<input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional"/></label>{!readOnly&&<button className="primary-button" disabled={saving}>Save entry</button>}</form></section>
      <section className="dashboard-panel mobile-history-panel"><p className="eyebrow">History</p><h3>Recent vehicle activity</h3><div className="mobile-log-list">{logs.length===0?<p>No mileage or fuel entries yet.</p>:logs.map(log=><article key={log.id}><div><strong>{new Date(`${log.log_date}T12:00:00`).toLocaleDateString()} · {log.entry_type==="mileage"?`${Number(log.business_miles).toFixed(1)} miles`:`${Number(log.fuel_gallons).toFixed(3)} gal · $${Number(log.fuel_cost).toFixed(2)}`}</strong><span>{log.vehicle_name||"Vehicle not specified"}{log.notes?` · ${log.notes}`:""}</span></div>{!readOnly&&<button type="button" className="text-button" onClick={()=>void removeLog(log.id)}>Delete</button>}</article>)}</div></section>
    </>}
  </>;
}
