import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import "./HouseholdCheckout.css";

export type CheckoutCandidate = {
  id: string; start_at: string; status: string; client_name: string; pet_names: string;
  services: { name: string; price: number }[]; amount: number;
  invoice_id: string | null; invoice_status: string | null;
};
type Props = {
  appointmentId: string; startAt: string; issueNow?: boolean;
  onClose: () => void; onComplete: (invoiceId: string) => void;
};
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const excludedStatuses = new Set(["cancelled", "canceled", "void", "no_show", "requested"]);

export default function HouseholdCheckout({ appointmentId, startAt, issueNow = true, onClose, onComplete }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [candidates, setCandidates] = useState<CheckoutCandidate[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  useEffect(() => {
    let active = true;
    const start = new Date(startAt);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    void (async () => {
      try {
        const { data, error: loadError } = await supabase.rpc("get_household_checkout", {
          p_appointment_id: appointmentId, p_day_start: start.toISOString(), p_day_end: end.toISOString(),
        });
        if (loadError) throw loadError;
        if (active) {
          const rows = (data ?? []) as CheckoutCandidate[];
          setCandidates(rows);
          setSelected(rows.filter(row => !row.invoice_id && !excludedStatuses.has(row.status) && row.services.length > 0).map(row => row.id));
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : (cause as { message?: string })?.message || "Unable to load checkout.");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [appointmentId, startAt]);
  const anchor = candidates.find(row => row.id === appointmentId);
  const total = candidates.filter(row => selected.includes(row.id)).reduce((sum, row) => sum + Number(row.amount), 0);
  async function submit() {
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      let invoiceId = anchor?.invoice_id;
      if (!invoiceId) {
        const { data, error: createError } = await supabase.rpc("create_invoice_from_appointments", { p_appointment_ids: selected });
        if (createError) throw createError;
        if (!data) throw new Error("The invoice could not be created.");
        invoiceId = String(data);
      }
      const { data: invoice, error: statusError } = await supabase.from("invoice").select("status").eq("id", invoiceId).single();
      if (statusError) throw statusError;
      if (issueNow && invoice?.status === "draft") {
        const { error: issueError } = await supabase.rpc("issue_invoice", { p_invoice_id: invoiceId });
        if (issueError) throw issueError;
      }
      onComplete(invoiceId);
    } catch (cause) {
      setError((cause as { message?: string })?.message || "Unable to open the invoice. Retry to reopen the same invoice.");
    } finally { submitting.current = false; setSaving(false); }
  }
  return <dialog ref={dialog} className="household-checkout" aria-labelledby="checkout-heading"
    onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}>
    <header><div><p className="eyebrow">Household checkout</p><h2 id="checkout-heading">{anchor?.client_name || "Review appointments"}</h2></div>
      <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancel</button></header>
    {loading ? <p role="status">Loading this owner's appointments…</p> : <>
      <p>{new Date(startAt).toLocaleDateString()} · Select the appointments to include on one invoice. Payment is taken on the invoice screen.</p>
      {anchor?.invoice_id ? <p>This appointment already belongs to an invoice ({anchor.invoice_status?.replaceAll("_", " ")}). Open it to review all included services.</p> :
        <div className="household-checkout-list">{candidates.map(row => {
          const unavailable = Boolean(row.invoice_id) || excludedStatuses.has(row.status) || row.services.length === 0;
          return <label key={row.id} className={unavailable ? "unavailable" : ""}>
            <input type="checkbox" checked={selected.includes(row.id)} disabled={saving || unavailable}
              onChange={event => setSelected(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))} />
            <span><strong>{row.pet_names}</strong><small>{new Date(row.start_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {row.status.replaceAll("_", " ")}</small>
              {row.services.map((service, index) => <span className="checkout-service" key={index}>{service.name} · {money(Number(service.price))}</span>)}
              {row.invoice_id && <small>Already invoiced · {row.invoice_status?.replaceAll("_", " ")}</small>}
              {!row.services.length && <small>No services added</small>}
            </span><strong>{money(Number(row.amount))}</strong>
          </label>;
        })}</div>}
      {!anchor?.invoice_id && <p className="checkout-total">{selected.length} appointment(s) · Service subtotal <strong>{money(total)}</strong></p>}
      {error && <p role="alert">{error}</p>}
      <button type="button" className="primary-button" disabled={saving || !anchor || (!anchor.invoice_id && selected.length === 0)} onClick={() => void submit()}>
        {saving ? "Opening invoice…" : anchor?.invoice_id ? "Open existing invoice" : issueNow ? "Create one invoice & continue" : "Create one draft invoice"}
      </button>
    </>}
  </dialog>;
}
