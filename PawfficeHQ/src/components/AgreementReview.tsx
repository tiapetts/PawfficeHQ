import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import "./ServiceAgreement.css";
export default function AgreementReview({ token }: { token: string }) {
 const [data,setData]=useState<{title:string;pdf_url:string;expires_at:string}|null>(null);
 const [error,setError]=useState("");
 const [signerName,setSignerName]=useState("");
 const [accepted,setAccepted]=useState(false);
 const [busy,setBusy]=useState(false);
 const [signed,setSigned]=useState(false);
 async function sign() {
  setBusy(true);setError("");
  const {data:result,error:failure}=await supabase.functions.invoke("service-agreement-invite",{body:{action:"sign",token,signer_name:signerName,accepted}});
  if(failure||result?.error||!result?.signed)setError(result?.error??failure?.message??"Unable to sign agreement");
  else {setSigned(true);setData(null);}
  setBusy(false);
 }
 useEffect(()=>{let active=true; void (async()=>{
  const {data:response,error:failure}=await supabase.functions.invoke("service-agreement-invite",{body:{action:"view",token}});
  if(!active)return;
  if(failure||response?.error||!response?.pdf_url)setError("This agreement link is invalid or expired.");
  else setData(response);
 })();return()=>{active=false}},[token]);
 return <main className="agreement-review">
  <h1>PawfficeHQ — Agreement review</h1>
  <section className="agreement-review-card">
  {signed ? <p role="status"><strong>Agreement signed successfully.</strong> Your business has received your signed agreement.</p> : !data && !error ? <p>Loading agreement…</p> : <>
   {error && <p role="alert">{error}</p>}
   {data && <>
   <h2>{data.title}</h2>
   <p>Please review the document below. This link expires {new Date(data.expires_at).toLocaleString()}.</p>
   <iframe title="Service agreement PDF" src={data.pdf_url} className="agreement-pdf" />
   <p><a href={data.pdf_url} target="_blank" rel="noreferrer">Open PDF in a new tab</a></p>
   <form onSubmit={e=>{e.preventDefault();void sign()}} className="agreement-review-form">
    <h3>Sign this agreement</h3>
    <label>Full legal name <input type="text" required minLength={2} maxLength={160} autoComplete="name" value={signerName} onChange={e=>setSignerName(e.target.value)} /></label>
    <label className="agreement-consent"><input type="checkbox" required checked={accepted} onChange={e=>setAccepted(e.target.checked)} /> I have reviewed the service agreement and agree to sign it electronically. I understand my typed name will be my electronic signature.</label>
    <button type="submit" className="agreement-button agreement-button--primary" disabled={busy||!accepted||signerName.trim().length<2}>{busy?"Signing…":"Sign agreement"}</button>
   </form>
  </>}
  </>}
  </section>
 </main>;
}
