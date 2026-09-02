import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import "./StaffEarnings.css";

type Props = { businessId: string; readOnly?: boolean };
type Staff = { id: string; first_name: string; last_name: string; job_title: string | null; is_active: boolean };
type Appointment = { id: string; start_at: string; status: string };
type AppointmentService = { appointment_id: string; staff_id: string | null; price_at_booking: number };
type Invoice = { id: string; appointment_id: string | null; invoice_number: string };
type Payment = { id: string; invoice_id: string; amount: number; tip_amount: number; method: string; status: string; paid_at: string | null; created_at: string };
type Refund = { payment_id: string; amount: number; status: string };
type Allocation = { id: string; payment_id: string; staff_id: string; amount: number };
type Range = "today" | "week" | "month" | "custom";
type LedgerRow = { paymentId: string; appointmentId: string; date: string; invoiceNumber: string; method: string; service: number; tip: number; refund: number };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const paidStatuses = new Set(["succeeded", "partially_refunded", "refunded"]);

function localDate(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export default function StaffEarnings({ businessId, readOnly = false }: Props) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<AppointmentService[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [range, setRange] = useState<Range>("month");
  const [customStart, setCustomStart] = useState(localDate(new Date()));
  const [customEnd, setCustomEnd] = useState(localDate(new Date()));
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [savingPayment, setSavingPayment] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");
    const [staffResult, appointmentResult, serviceResult, invoiceResult, paymentResult, refundResult, allocationResult] = await Promise.all([
      supabase.from("STAFF").select("id, first_name, last_name, job_title, is_active").eq("business_id", businessId).order("last_name"),
      supabase.from("appointment").select("id, start_at, status").eq("business_id", businessId),
      supabase.from("appointment_service").select("appointment_id, staff_id, price_at_booking"),
      supabase.from("invoice").select("id, appointment_id, invoice_number").eq("business_id", businessId),
      supabase.from("payment").select("id, invoice_id, amount, tip_amount, method, status, paid_at, created_at").eq("business_id", businessId),
      supabase.from("refund").select("payment_id, amount, status").eq("business_id", businessId),
      supabase.from("staff_tip_allocation").select("id, payment_id, staff_id, amount").eq("business_id", businessId),
    ]);
    const error = staffResult.error || appointmentResult.error || serviceResult.error || invoiceResult.error || paymentResult.error || refundResult.error || allocationResult.error;
    if (error) setMessage(error.message);
    else {
      setStaff((staffResult.data as Staff[]) ?? []);
      setAppointments((appointmentResult.data as Appointment[]) ?? []);
      setServices((serviceResult.data as AppointmentService[]) ?? []);
      setInvoices((invoiceResult.data as Invoice[]) ?? []);
      setPayments((paymentResult.data as Payment[]) ?? []);
      setRefunds((refundResult.data as Refund[]) ?? []);
      setAllocations((allocationResult.data as Allocation[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [businessId]);

  const bounds = useMemo(() => {
    const now = new Date();
    let start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let end = new Date(start.getTime() + 86_400_000);
    if (range === "week") {
      const day = (start.getDay() + 6) % 7;
      start = new Date(start.getTime() - day * 86_400_000);
      end = new Date(start.getTime() + 7 * 86_400_000);
    } else if (range === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    } else if (range === "custom") {
      start = new Date(`${customStart}T00:00:00`);
      end = new Date(`${customEnd}T23:59:59.999`);
    }
    return { start, end };
  }, [range, customStart, customEnd]);

  const report = useMemo(() => {
    const rows = new Map<string, LedgerRow[]>();
    staff.forEach(member => rows.set(member.id, []));
    let unallocatedTips = 0;
    const pending: Payment[] = [];
    payments.filter(payment => paidStatuses.has(payment.status)).forEach(payment => {
      const paidDate = new Date(payment.paid_at ?? payment.created_at);
      if (paidDate < bounds.start || paidDate > bounds.end) return;
      const invoice = invoices.find(item => item.id === payment.invoice_id);
      if (!invoice?.appointment_id) return;
      const appointment = appointments.find(item => item.id === invoice.appointment_id);
      if (!appointment) return;
      const assigned = services.filter(item => item.appointment_id === appointment.id && item.staff_id);
      const staffIds = [...new Set(assigned.map(item => item.staff_id as string))];
      if (!staffIds.length) return;
      const totalBooked = assigned.reduce((sum, item) => sum + Number(item.price_at_booking || 0), 0);
      const refunded = refunds.filter(item => item.payment_id === payment.id && item.status === "succeeded").reduce((sum, item) => sum + Number(item.amount), 0);
      const netService = Math.max(Number(payment.amount) - refunded, 0);
      const saved = allocations.filter(item => item.payment_id === payment.id);
      if (Number(payment.tip_amount) > 0 && staffIds.length > 1 && saved.length === 0) {
        unallocatedTips += Number(payment.tip_amount);
        pending.push(payment);
      }
      staffIds.forEach(staffId => {
        const staffBooked = assigned.filter(item => item.staff_id === staffId).reduce((sum, item) => sum + Number(item.price_at_booking || 0), 0);
        const share = totalBooked > 0 ? staffBooked / totalBooked : 1 / staffIds.length;
        const allocatedTip = saved.length > 0
          ? Number(saved.find(item => item.staff_id === staffId)?.amount ?? 0)
          : staffIds.length === 1 ? Number(payment.tip_amount) : 0;
        rows.get(staffId)?.push({
          paymentId: payment.id,
          appointmentId: appointment.id,
          date: payment.paid_at ?? payment.created_at,
          invoiceNumber: invoice.invoice_number,
          method: payment.method,
          service: netService * share,
          tip: allocatedTip,
          refund: refunded * share,
        });
      });
    });
    return { rows, unallocatedTips, pending };
  }, [staff, appointments, services, invoices, payments, refunds, allocations, bounds]);

  function staffForPayment(payment: Payment) {
    const invoice = invoices.find(item => item.id === payment.invoice_id);
    return [...new Set(services.filter(item => item.appointment_id === invoice?.appointment_id && item.staff_id).map(item => item.staff_id as string))];
  }

  function draftValue(payment: Payment, staffId: string) {
    const current = drafts[payment.id]?.[staffId];
    if (current !== undefined) return current;
    const ids = staffForPayment(payment);
    return (Number(payment.tip_amount) / Math.max(ids.length, 1)).toFixed(2);
  }

  async function saveAllocation(payment: Payment) {
    const staffIds = staffForPayment(payment);
    const entries = staffIds.map(staffId => ({ staffId, amount: Number(draftValue(payment, staffId)) }));
    const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
    if (entries.some(entry => !Number.isFinite(entry.amount) || entry.amount < 0) || Math.abs(total - Number(payment.tip_amount)) > 0.009) {
      setMessage(`Tip allocations must add up to ${money.format(Number(payment.tip_amount))}.`);
      return;
    }
    setSavingPayment(payment.id);
    const removed = await supabase.from("staff_tip_allocation").delete().eq("payment_id", payment.id).eq("business_id", businessId);
    if (removed.error) { setMessage(removed.error.message); setSavingPayment(null); return; }
    const inserted = await supabase.from("staff_tip_allocation").insert(entries.map(entry => ({ business_id: businessId, payment_id: payment.id, staff_id: entry.staffId, amount: entry.amount })));
    if (inserted.error) setMessage(inserted.error.message);
    else { setMessage("Tip allocation saved."); await load(); }
    setSavingPayment(null);
  }

  const totals = staff.map(member => {
    const rows = report.rows.get(member.id) ?? [];
    return {
      member,
      rows,
      service: rows.reduce((sum, row) => sum + row.service, 0),
      tips: rows.reduce((sum, row) => sum + row.tip, 0),
      refunds: rows.reduce((sum, row) => sum + row.refund, 0),
      appointments: new Set(rows.map(row => row.appointmentId)).size,
    };
  });
  const selected = totals.find(item => item.member.id === selectedStaff);

  return <div className="staff-earnings">
    <header className="dashboard-header"><div><p className="eyebrow">Grooming</p><h2>Staff earnings</h2><p>Collected service revenue, tips, and refunds by employee.</p></div></header>
    {message && <p className="settings-success-message">{message}</p>}
    <section className="earnings-toolbar">
      <div className="earnings-range">{(["today","week","month","custom"] as Range[]).map(value => <button key={value} className={range === value ? "active" : ""} onClick={() => setRange(value)}>{value === "week" ? "This week" : value === "month" ? "This month" : value[0].toUpperCase() + value.slice(1)}</button>)}</div>
      {range === "custom" && <div className="earnings-dates"><label>From<input type="date" value={customStart} onChange={event => setCustomStart(event.target.value)} /></label><label>Through<input type="date" value={customEnd} onChange={event => setCustomEnd(event.target.value)} /></label></div>}
    </section>
    {loading ? <p>Calculating staff earnings…</p> : <>
      <section className="earnings-summary">
        <button type="button" className="clickable-summary-card" onClick={() => document.querySelector(".earnings-card-grid")?.scrollIntoView({ behavior: "smooth", block: "start" })}><span>Net service revenue</span><strong>{money.format(totals.reduce((sum, item) => sum + item.service, 0))}</strong><small>Open staff ledgers →</small></button>
        <button type="button" className="clickable-summary-card" onClick={() => document.querySelector(".earnings-card-grid")?.scrollIntoView({ behavior: "smooth", block: "start" })}><span>Allocated tips</span><strong>{money.format(totals.reduce((sum, item) => sum + item.tips, 0))}</strong><small>Open staff ledgers →</small></button>
        <button type="button" className="clickable-summary-card" onClick={() => document.querySelector(".tip-allocation-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })} disabled={report.pending.length === 0}><span>Unallocated tips</span><strong>{money.format(report.unallocatedTips)}</strong><small>{report.pending.length ? "Review allocations →" : "Nothing needs allocation"}</small></button>
        <button type="button" className="clickable-summary-card" onClick={() => document.querySelector(".earnings-card-grid")?.scrollIntoView({ behavior: "smooth", block: "start" })}><span>Net collected</span><strong>{money.format(totals.reduce((sum, item) => sum + item.service + item.tips, 0))}</strong><small>Open staff ledgers →</small></button>
      </section>
      <section className="earnings-card-grid">{totals.map(item => <button className="earnings-staff-card" key={item.member.id} onClick={() => setSelectedStaff(item.member.id)}><div><span>{item.member.is_active ? "Active" : "Inactive"}</span><h3>{item.member.first_name} {item.member.last_name}</h3><p>{item.member.job_title || "Staff member"}</p></div><dl><div><dt>Net services</dt><dd>{money.format(item.service)}</dd></div><div><dt>Tips</dt><dd>{money.format(item.tips)}</dd></div><div><dt>Refunds</dt><dd>{money.format(item.refunds)}</dd></div><div><dt>Total</dt><dd>{money.format(item.service + item.tips)}</dd></div><div><dt>Appointments</dt><dd>{item.appointments}</dd></div></dl><small>View earnings ledger →</small></button>)}</section>
      {report.pending.length > 0 && <section className="tip-allocation-panel"><div><p className="eyebrow">Needs attention</p><h3>Allocate shared tips</h3><p>These appointments had more than one assigned employee.</p></div>{report.pending.map(payment => <article key={payment.id}><div><strong>{money.format(Number(payment.tip_amount))} tip</strong><span>{new Date(payment.paid_at ?? payment.created_at).toLocaleDateString()} · {payment.method.replaceAll("_", " ")}</span></div><div className="tip-allocation-inputs">{staffForPayment(payment).map(staffId => { const member = staff.find(item => item.id === staffId); return <label key={staffId}>{member?.first_name} {member?.last_name}<input type="number" min="0" step="0.01" value={draftValue(payment, staffId)} onChange={event => setDrafts(current => ({ ...current, [payment.id]: { ...current[payment.id], [staffId]: event.target.value } }))} /></label>})}</div>{!readOnly && <button className="primary-button" disabled={savingPayment === payment.id} onClick={() => void saveAllocation(payment)}>{savingPayment === payment.id ? "Saving…" : "Save tip split"}</button>}</article>)}</section>}
      {selected && <div className="earnings-modal-backdrop" onClick={() => setSelectedStaff(null)}><section className="earnings-ledger" onClick={event => event.stopPropagation()}><header><div><p className="eyebrow">Earnings ledger</p><h3>{selected.member.first_name} {selected.member.last_name}</h3></div><button onClick={() => setSelectedStaff(null)}>Close</button></header>{selected.rows.length === 0 ? <p>No collected earnings in this period.</p> : <div className="earnings-ledger-list">{selected.rows.sort((a,b) => b.date.localeCompare(a.date)).map(row => <article key={`${row.paymentId}-${row.appointmentId}`}><div><strong>{new Date(row.date).toLocaleDateString()}</strong><span>{row.invoiceNumber} · {row.method.replaceAll("_", " ")}</span></div><div><span>Services {money.format(row.service)}</span><span>Tips {money.format(row.tip)}</span>{row.refund > 0 && <span>Refunded {money.format(row.refund)}</span>}<strong>{money.format(row.service + row.tip)}</strong></div></article>)}</div>}</section></div>}
    </>}
  </div>;
}
