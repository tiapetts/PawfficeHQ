import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
export default function AgreementReview({ token }: { token: string }) {
 const [data,setData]=useState<{title:string;pdf_url:string;expires_at:string}|null>(null);
 const [error,setError]=useState("");
 useEffect(()=>{let active=true; void (async()=>{
  const {data:response,error:failure}=await supabase.functions.invoke("service-agreement-invite",{body:{action:"view",token}});
  if(!active)return;
  if(failure||response?.error||!response?.pdf_url)setError("This agreement link is invalid or expired.");
  else setData(response);
 })();return()=>{active=false}},[token]);
 return <main style={{maxWidth:900,margin:"32px auto",padding:24}}>
  <h1>PawfficeHQ — Agreement review</h1>
  {error ? <p role="alert">{error}</p> : !data ? <p>Loading agreement…</p> : <>
   <h2>{data.title}</h2>
   <p>Please review the document below. This link expires {new Date(data.expires_at).toLocaleString()}.</p>
   <iframe title="Service agreement PDF" src={data.pdf_url} style={{width:"100%",height:"70vh",border:"1px solid #ccc"}} />
   <p><a href={data.pdf_url} target="_blank" rel="noreferrer">Open PDF in a new tab</a></p>
   <p><strong>Signing is not available yet.</strong> Reviewing this document does not constitute acceptance or a signature.</p>
  </>}
 </main>;
}
