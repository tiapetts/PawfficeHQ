import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

type Template = { id: string; title: string; active_version_id: string | null };
export default function ServiceAgreementSettings({ businessId, readOnly = false }: { businessId: string; readOnly?: boolean }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [title, setTitle] = useState("Service agreement");
  const [file, setFile] = useState<File | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [requiresRenewal, setRequiresRenewal] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function refresh() {
    const { data, error: loadError } = await supabase.from("service_agreement_template")
      .select("id,title,active_version_id").eq("business_id",businessId).order("created_at",{ascending:false});
    if (loadError) setError(loadError.message);
    else setTemplates(data ?? []);
  }
  useEffect(() => { void refresh(); }, [businessId]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy || readOnly) return;
    setBusy(true); setMessage(""); setError("");
    try {
      const form = new FormData();
      form.set("business_id", businessId);
      form.set("title", title.trim());
      form.set("requires_renewal", String(requiresRenewal));
      if (templateId) form.set("template_id", templateId);
      form.set("file", file);
      const { data, error: uploadError } = await supabase.functions.invoke("upload-service-agreement", { body: form });
      if (uploadError || data?.error) throw new Error(data?.error ?? uploadError?.message ?? "Upload failed");
      setMessage("Agreement published. It is now visible on client profiles.");
      setFile(null);
      const input = document.getElementById("service-agreement-file") as HTMLInputElement | null;
      if (input) input.value = "";
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to publish agreement");
    } finally { setBusy(false); }
  }
  return <section className="dashboard-panel settings-section" aria-label="Service agreement management">
    <div><p className="eyebrow">Client paperwork</p><h3>Service agreements</h3>
      <p className="settings-help">Upload one PDF agreement for the whole client household. Signed copies will be kept separately when digital signing is enabled.</p></div>
    {templates.length > 0 && <div><strong>Published agreements</strong><ul>{templates.map(t => <li key={t.id}>{t.title} — {t.active_version_id ? "Published" : "Draft"}</li>)}</ul></div>}
    <form onSubmit={e => void submit(e)} className="settings-form-grid">
      <label>Agreement to publish
        <select disabled={readOnly || busy} value={templateId} onChange={e => { const id=e.target.value; setTemplateId(id); const t=templates.find(x=>x.id===id); if(t) setTitle(t.title); }}>
          <option value="">New agreement</option>
          {templates.map(t=><option key={t.id} value={t.id}>New version of {t.title}</option>)}
        </select>
      </label>
      <label>Agreement name
        <input required maxLength={160} disabled={readOnly || busy} value={title} onChange={e=>setTitle(e.target.value)} />
      </label>
      <label>PDF file (maximum 10 MB)
        <input id="service-agreement-file" required type="file" accept="application/pdf,.pdf" disabled={readOnly || busy} onChange={e=>setFile(e.target.files?.[0] ?? null)} />
      </label>
      <label><input type="checkbox" checked={requiresRenewal} disabled={readOnly || busy} onChange={e=>setRequiresRenewal(e.target.checked)} /> Require existing clients to sign a new version</label>
      <div><button type="submit" className="primary-button" disabled={readOnly || busy || !file || !title.trim()}>{busy ? "Uploading…" : "Publish agreement"}</button></div>
    </form>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
    <p className="settings-help">Sending links and collecting signatures are coming next. Publishing does not send anything to clients.</p>
  </section>;
}
