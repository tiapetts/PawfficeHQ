import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import "./PetSittingReports.css";
import "./PetSittingReportsSearch.css";

type Booking = { id: string; client_id: number };
type Visit = { id: string; booking_id: string; staff_id: string | null; scheduled_start: string; status: string; arrived_at: string | null; departed_at: string | null; checklist: Record<string, boolean>; internal_notes: string | null; parent_update: string | null; photo_path: string | null };
type Link = { booking_id: string; pet_id: number };
type Pet = { id: number; PetName: string };
type Client = { id: number; FirstName: string; LastName: string };
type Staff = { id: string; first_name: string; last_name: string };

export default function PetSittingReports({ businessId }: { businessId: string }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const [b, v, l, p, c, s] = await Promise.all([
        supabase.from("pet_sitting_booking").select("id, client_id").eq("business_id", businessId),
        supabase.from("pet_sitting_visit").select("id, booking_id, staff_id, scheduled_start, status, arrived_at, departed_at, checklist, internal_notes, parent_update, photo_path").order("scheduled_start", { ascending: false }),
        supabase.from("pet_sitting_booking_pet").select("booking_id, pet_id"),
        supabase.from("PET").select("id, PetName").eq("business_id", businessId),
        supabase.from("CLIENT").select("id, FirstName, LastName").eq("business_id", businessId),
        supabase.from("STAFF").select("id, first_name, last_name").eq("business_id", businessId),
      ]);
      const error = b.error || v.error || l.error || p.error || c.error || s.error;
      if (error) setMessage(error.message);
      else {
        setBookings(b.data ?? []);
        setVisits(v.data ?? []);
        setLinks(l.data ?? []);
        setPets(p.data ?? []);
        setClients(c.data ?? []);
        setStaff(s.data ?? []);
      }
    }
    void load();
  }, [businessId]);

  const petNames = (bookingId: string) => links.filter((link) => link.booking_id === bookingId).map((link) => pets.find((pet) => pet.id === link.pet_id)?.PetName).filter(Boolean).join(", ");
  const clientName = (bookingId: string) => {
    const booking = bookings.find((item) => item.id === bookingId);
    const client = clients.find((item) => item.id === booking?.client_id);
    return client ? `${client.FirstName} ${client.LastName}` : "Unknown client";
  };
  const staffName = (id: string | null) => {
    const person = staff.find((item) => item.id === id);
    return person ? `${person.first_name} ${person.last_name}` : "Unassigned";
  };

  async function openPhoto(path: string) {
    const result = await supabase.storage.from("pet-sitting-photos").createSignedUrl(path, 60);
    if (result.error) setMessage(result.error.message);
    else window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const query = search.trim().toLocaleLowerCase();
  const statusFiltered = visits.filter((visit) => filter === "all" || visit.status === filter);
  const shown = statusFiltered.filter((visit) => {
    if (!query) return true;
    const searchable = [petNames(visit.booking_id), clientName(visit.booking_id), staffName(visit.staff_id), visit.status.replaceAll("_", " "), new Date(visit.scheduled_start).toLocaleString(), visit.parent_update, visit.internal_notes].filter(Boolean).join(" ").toLocaleLowerCase();
    return searchable.includes(query);
  });

  return <>
    <header className="dashboard-header"><div><p className="eyebrow">Pet sitting</p><h2>Visit reports</h2></div></header>
    {message && <p className="error-message">{message}</p>}
    <div className="sitting-report-tools">
      <label className="sitting-report-search"><span>Search reports</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pet, client, sitter, date, or notes" /></label>
      <strong className="sitting-report-count">{shown.length} {shown.length === 1 ? "report" : "reports"}</strong>
    </div>
    <div className="record-list-filter">
      <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All ({visits.length})</button>
      <button className={filter === "completed" ? "active" : ""} onClick={() => setFilter("completed")}>Completed ({visits.filter((visit) => visit.status === "completed").length})</button>
      <button className={filter === "in_progress" ? "active" : ""} onClick={() => setFilter("in_progress")}>In progress ({visits.filter((visit) => visit.status === "in_progress").length})</button>
    </div>
    <section className="sitting-report-list">
      {shown.length === 0 ? <div className="dashboard-panel empty-state">
        <h3>{visits.length === 0 ? "No visit reports yet" : "No matching visit reports"}</h3>
        <p>{visits.length === 0 ? "Visit logs will appear after sitters begin recording visits." : "Try another pet, client, sitter, date, status, or note."}</p>
        {search && <button className="secondary-button" onClick={() => setSearch("")}>Clear search</button>}
      </div> : shown.map((visit) => <article className="sitting-report-card" key={visit.id}>
        <div className="sitting-report-heading"><div><span className={`sitting-status ${visit.status}`}>{visit.status.replace("_", " ")}</span><h3>{petNames(visit.booking_id) || "Pet-sitting visit"}</h3><p>{clientName(visit.booking_id)} · {new Date(visit.scheduled_start).toLocaleString()}</p></div><strong>{staffName(visit.staff_id)}</strong></div>
        <div className="sitting-report-times"><span><strong>Arrived</strong>{visit.arrived_at ? new Date(visit.arrived_at).toLocaleString() : "Not recorded"}</span><span><strong>Departed</strong>{visit.departed_at ? new Date(visit.departed_at).toLocaleString() : "Not recorded"}</span></div>
        <div className="sitting-report-checklist">{Object.entries(visit.checklist ?? {}).map(([item, done]) => <span className={done ? "done" : ""} key={item}>{done ? "✓" : "○"} {item}</span>)}</div>
        {visit.parent_update && <section><p className="eyebrow">Parent update</p><p>{visit.parent_update}</p></section>}
        {visit.internal_notes && <section className="internal-log"><p className="eyebrow">Internal visit log</p><p>{visit.internal_notes}</p></section>}
        {visit.photo_path && <button className="secondary-button" onClick={() => void openPhoto(visit.photo_path!)}>View visit photo</button>}
      </article>)}
    </section>
  </>;
}
