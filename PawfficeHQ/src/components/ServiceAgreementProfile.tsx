import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Template = { id: string; title: string; active_version_id: string | null };
type Request = { id: string; template_id: string; version_id: string; status: string; signed_at: string | null; created_at: string };
type Signature = { request_id: string; signed_at: string; signer_name: string };

export default function ServiceAgreementProfile({ businessId, clientId }: { businessId: string; clientId: number }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      const [t, r, s] = await Promise.all([
        supabase.from("service_agreement_template").select("id,title,active_version_id").eq("business_id",businessId),
        supabase.from("service_agreement_request").select("id,template_id,version_id,status,signed_at,created_at").eq("business_id",businessId).eq("client_id",clientId).order("created_at",{ascending:false}),
        supabase.from("service_agreement_signature").select("request_id,signed_at,signer_name").eq("business_id",businessId).eq("client_id",clientId),
      ]);
      if (!active) return;
      if (t.error || r.error || s.error) setError("Service agreements are not available yet. The database setup may still be pending.");
      else {
        setTemplates(t.data ?? []);
        setRequests(r.data ?? []);
        setSignatures(s.data ?? []);
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [businessId,clientId]);
  return <section className="dashboard-panel" aria-label="Service agreements">
    <h3>Service agreements</h3>
    {loading ? <p role="status">Checking agreement status…</p> : error ? <p role="status">{error}</p> :
      templates.length === 0 ? <p>No service agreement has been published for this business yet.</p> :
      templates.map(template => {
        const latest = requests.find(r => r.template_id === template.id);
        const signed = requests.find(r => r.template_id === template.id && r.version_id === template.active_version_id && r.status === "signed" && signatures.some(s => s.request_id === r.id));
        const prior = requests.some(r => r.template_id === template.id && r.status === "signed");
        const status = signed ? "Signed" : latest?.status === "sent" || latest?.status === "viewed" ? "Pending signature" : prior ? "Outdated agreement" : "Not signed";
        return <article key={template.id} style={{ padding: "12px 0", borderTop: "1px solid var(--border-color, #ddd)" }}>
          <strong>{template.title}</strong>
          <p><strong>Status:</strong> {template.active_version_id ? status : "Not published"}</p>
          {signed && <p>Signed {new Date(signed.signed_at ?? signed.created_at).toLocaleDateString()}</p>}
          <p style={{ fontSize: "0.9em" }}>Agreement sending and signing will become available after secure delivery and signing are implemented.</p>
        </article>;
      })}
  </section>;
}
