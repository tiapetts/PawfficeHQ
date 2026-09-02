import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import "./RevenueOverview.css";

type Props = { businessId: string; onOpenProjected?: () => void; onOpenEarned?: () => void };
type Appointment = { id: string; start_at: string };
type AppointmentService = { appointment_id: string; price_at_booking: number | null };
type Payment = { amount: number; tip_amount: number | null; status: string; paid_at: string | null; created_at: string };
type Refund = { amount: number; status: string; refunded_at: string | null; created_at: string };
type DailyRevenue = { date: string; projected: number; earned: number };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dateKey = (value: string | Date) => {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export default function RevenueOverview({ businessId, onOpenProjected, onOpenEarned }: Props) {
  const [daily, setDaily] = useState<DailyRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadRevenue() {
      setLoading(true);
      setError("");
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

      const [appointmentsResult, paymentsResult, refundsResult] = await Promise.all([
        supabase
          .from("appointment")
          .select("id, start_at")
          .eq("business_id", businessId)
          .gte("start_at", monthStart.toISOString())
          .lt("start_at", monthEnd.toISOString())
          .not("status", "in", '("cancelled","canceled","void")'),
        supabase
          .from("payment")
          .select("amount, tip_amount, status, paid_at, created_at")
          .eq("business_id", businessId)
          .in("status", ["succeeded", "partially_refunded", "refunded"])
          .gte("paid_at", monthStart.toISOString())
          .lt("paid_at", monthEnd.toISOString()),
        supabase
          .from("refund")
          .select("amount, status, refunded_at, created_at")
          .eq("business_id", businessId)
          .eq("status", "succeeded")
          .gte("refunded_at", monthStart.toISOString())
          .lt("refunded_at", monthEnd.toISOString()),
      ]);

      const firstError = appointmentsResult.error || paymentsResult.error || refundsResult.error;
      if (firstError) {
        setError(firstError.message);
        setLoading(false);
        return;
      }

      const appointments = (appointmentsResult.data as Appointment[] | null) ?? [];
      const appointmentIds = appointments.map((appointment) => appointment.id);
      let appointmentServices: AppointmentService[] = [];
      if (appointmentIds.length > 0) {
        const result = await supabase
          .from("appointment_service")
          .select("appointment_id, price_at_booking")
          .in("appointment_id", appointmentIds);
        if (result.error) {
          setError(result.error.message);
          setLoading(false);
          return;
        }
        appointmentServices = (result.data as AppointmentService[] | null) ?? [];
      }

      const rows = Array.from({ length: daysInMonth }, (_, index) => {
        const date = new Date(now.getFullYear(), now.getMonth(), index + 1);
        return { date: dateKey(date), projected: 0, earned: 0 };
      });
      const byDate = new Map(rows.map((row) => [row.date, row]));
      const appointmentsById = new Map(appointments.map((appointment) => [appointment.id, appointment]));

      appointmentServices.forEach((service) => {
        const appointment = appointmentsById.get(service.appointment_id);
        if (appointment) byDate.get(dateKey(appointment.start_at))!.projected += Number(service.price_at_booking ?? 0);
      });
      ((paymentsResult.data as Payment[] | null) ?? []).forEach((payment) => {
        const timestamp = payment.paid_at ?? payment.created_at;
        const row = byDate.get(dateKey(timestamp));
        if (row) row.earned += Number(payment.amount) + Number(payment.tip_amount ?? 0);
      });
      ((refundsResult.data as Refund[] | null) ?? []).forEach((refund) => {
        const timestamp = refund.refunded_at ?? refund.created_at;
        const row = byDate.get(dateKey(timestamp));
        if (row) row.earned -= Number(refund.amount);
      });

      setDaily(rows);
      setLoading(false);
    }
    void loadRevenue();
  }, [businessId]);

  const today = dateKey(new Date());
  const todayRow = daily.find((row) => row.date === today);
  const totals = useMemo(() => daily.reduce(
    (sum, row) => ({ projected: sum.projected + row.projected, earned: sum.earned + row.earned }),
    { projected: 0, earned: 0 },
  ), [daily]);
  const activeDays = daily.filter((row) => row.projected !== 0 || row.earned !== 0 || row.date === today);
  const chartMax = Math.max(1, ...activeDays.flatMap((row) => [Math.abs(row.projected), Math.abs(row.earned)]));

  return <>
    <section className="revenue-summary-grid" aria-label="Revenue summary">
      <button type="button" className="revenue-summary-card projected clickable-summary-card" onClick={onOpenProjected}><span>Projected today</span><strong>{loading ? "—" : money.format(todayRow?.projected ?? 0)}</strong><small>Open appointments →</small></button>
      <button type="button" className="revenue-summary-card earned clickable-summary-card" onClick={onOpenEarned}><span>Earned today</span><strong>{loading ? "—" : money.format(todayRow?.earned ?? 0)}</strong><small>Open invoices →</small></button>
      <button type="button" className="revenue-summary-card projected clickable-summary-card" onClick={onOpenProjected}><span>Projected this month</span><strong>{loading ? "—" : money.format(totals.projected)}</strong><small>Open appointments →</small></button>
      <button type="button" className="revenue-summary-card earned clickable-summary-card" onClick={onOpenEarned}><span>Earned this month</span><strong>{loading ? "—" : money.format(totals.earned)}</strong><small>Open invoices →</small></button>
    </section>

    <section className="dashboard-panel revenue-panel">
      <div className="panel-heading revenue-heading"><div><p className="eyebrow">Revenue</p><h3>Projected vs. earned this month</h3></div><div className="revenue-legend"><span className="projected">Projected</span><span className="earned">Earned</span></div></div>
      {error ? <p className="error-message" role="alert">{error}</p> : loading ? <p>Loading revenue…</p> : (
        <div className="revenue-chart">
          {activeDays.map((row) => <div className="revenue-day" key={row.date}>
            <time dateTime={row.date}>{new Date(`${row.date}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })}</time>
            <div className="revenue-bars">
              <div><span className="revenue-bar projected" style={{ width: `${Math.abs(row.projected) / chartMax * 100}%` }} /><b>{money.format(row.projected)}</b></div>
              <div><span className={`revenue-bar earned ${row.earned < 0 ? "negative" : ""}`} style={{ width: `${Math.abs(row.earned) / chartMax * 100}%` }} /><b>{money.format(row.earned)}</b></div>
            </div>
          </div>)}
        </div>
      )}
    </section>
  </>;
}
