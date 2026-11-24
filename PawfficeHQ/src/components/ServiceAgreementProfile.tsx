import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import "./ServiceAgreement.css";

type Template = { id: string; title: string; active_version_id: string | null };
type Request = { id: string; template_id: string; version_id: string; status: string; signed_at: string | null; created_at: string };
type Signature = { request_id: string; signed_at: string; signer_name: string };

export default function ServiceAgreementProfile({ businessId, clientId }: { businessId: string; clientId: number }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteError, setInviteError] = useState("");
  async function openSignedDocument(requestId: string) {
    setInviteError("");
    const {data,error:failure}=await supabase.functions.invoke("service-agreement-invite",{body:{action:"signed_document",business_id:businessId,request_id:requestId}});
    if(failure||data?.error||!data?.url){setInviteError(data?.error??failure?.message??"Unable to open document");return;}
    window.open(data.url,"_blank","noopener,noreferrer");
  }
  async function createInvitation(templateId: string) {
    setBusy(true); setInviteUrl(""); setInviteError("");
    try {
      const { data, error } = await supabase.functions.invoke("service-agreement-invite", { body: { action: "create", business_id: businessId, client_id: clientId, template_id: templateId } });
      if (error || data?.error || !data?.token) throw new Error(data?.error ?? error?.message ?? "Unable to create link");
      setInviteUrl(`${window.location.origin}/?agreement_token=${encodeURIComponent(data.token)}`);
    } catch (cause) { setInviteError(cause instanceof Error ? cause.message : "Unable to create link"); }
    finally { setBusy(false); }
  }
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
  return <section className="dashboard-panel agreement-profile" aria-label="Service agreements">
    <h3>Service agreements</h3>
    {loading ? <p role="status">Checking agreement status…</p> : error ? <p role="status">{error}</p> :
      templates.length === 0 ? <p>No service agreement has been published for this business yet.</p> :
      templates.map(template => {
        const latest = requests.find(r => r.template_id === template.id);
        const signed = requests.find(r => r.template_id === template.id && r.version_id === template.active_version_id && r.status === "signed" && signatures.some(s => s.request_id === r.id));
        const prior = requests.some(r => r.template_id === template.id && r.status === "signed");
        const status = signed ? "Signed" : latest?.status === "sent" || latest?.status === "viewed" ? "Pending signature" : prior ? "Outdated agreement" : "Not signed";
        const statusType = !template.active_version_id ? "unpublished" : signed ? "signed" : status === "Pending signature" ? "pending" : status === "Outdated agreement" ? "outdated" : "unsigned";
        return <article key={template.id} className="agreement-item">
          <div className="agreement-item-header"><strong className="agreement-title">{template.title}</strong><span className={`agreement-status agreement-status--${statusType}`}>{template.active_version_id ? status : "Not published"}</span></div>
          {signed && <><p className="agreement-meta">Signed {new Date(signed.signed_at ?? signed.created_at).toLocaleDateString()}</p><div className="agreement-actions"><button type="button" className="agreement-button agreement-button--secondary" onClick={() => void openSignedDocument(signed.id)}>View signed PDF</button></div></>}
          {template.active_version_id && !signed && <button type="button" className="agreement-button agreement-button--primary" disabled={busy} onClick={() => void createInvitation(template.id)}>{busy ? "Creating link…" : "Create signing link"}</button>}
          <p className="agreement-note">Signing links expire after seven days. Share links privately; automatic email and SMS delivery are not available yet.</p>
        </article>;
      })}
    {inviteUrl && <div className="agreement-link-box"><label>Private signing link (share securely)<input readOnly value={inviteUrl} onFocus={e => e.target.select()} /></label><div className="agreement-actions"><button type="button" className="agreement-button agreement-button--secondary" onClick={() => void navigator.clipboard.writeText(inviteUrl)}>Copy link</button></div></div>}
    {inviteError && <p role="alert">{inviteError}</p>}
  </section>;
}
