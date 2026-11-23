import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,"0")).join("");
Deno.serve(async request => {
 if (request.method === "OPTIONS") return new Response(null,{headers:cors});
 if (request.method !== "POST") return respond({error:"Method not allowed"},405);
 const url=Deno.env.get("SUPABASE_URL"), key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), anon=Deno.env.get("SUPABASE_ANON_KEY");
 if(!url||!key||!anon) return respond({error:"Service unavailable"},503);
 const db=createClient(url,key,{auth:{persistSession:false}});
 try {
  const body=await request.json();
  if(body.action==="create"){
   const bearer=request.headers.get("Authorization");
   if(!bearer?.startsWith("Bearer ")) return respond({error:"Unauthorized"},401);
   const userDb=createClient(url,anon,{global:{headers:{Authorization:bearer}},auth:{persistSession:false}});
   const {data:{user}}=await userDb.auth.getUser(bearer.slice(7));
   if(!user) return respond({error:"Unauthorized"},401);
   const businessId=String(body.business_id??""),clientId=Number(body.client_id),templateId=String(body.template_id??"");
   if(!/^[0-9a-f-]{36}$/i.test(businessId)||!Number.isSafeInteger(clientId)||clientId<1||!/^[0-9a-f-]{36}$/i.test(templateId))return respond({error:"Invalid request"},400);
   const {data:staff}=await db.from("STAFF").select("id").eq("auth_user_id",user.id).eq("business_id",businessId).eq("is_active",true).maybeSingle();
   if(!staff)return respond({error:"Forbidden"},403);
   const bytes=crypto.getRandomValues(new Uint8Array(32));
   const token=Array.from(bytes).map(b=>b.toString(16).padStart(2,"0")).join("");
   const {error}=await db.rpc("create_agreement_invitation",{p_business_id:businessId,p_client_id:clientId,p_template_id:templateId,p_token_hash:await hash(token)});
   if(error)return respond({error:"Unable to create invitation"},400);
   return respond({token,expires_in_days:7});
  }
  if(body.action==="view"){
   const token=String(body.token??"");
   if(!/^[a-f0-9]{64}$/.test(token))return respond({error:"Invalid or expired link"},404);
   const {data:invitation}=await db.from("service_agreement_request").select("id,status,expires_at,version_id,template_id").eq("token_hash",await hash(token)).maybeSingle();
   if(!invitation||!["sent","viewed"].includes(invitation.status)||!invitation.expires_at||new Date(invitation.expires_at).getTime()<=Date.now())return respond({error:"Invalid or expired link"},404);
   const {data:version}=await db.from("service_agreement_version").select("storage_path").eq("id",invitation.version_id).maybeSingle();
   const {data:template}=await db.from("service_agreement_template").select("title").eq("id",invitation.template_id).maybeSingle();
   if(!version||!template)return respond({error:"Agreement unavailable"},404);
   const {data:signed,error}=await db.storage.from("service-agreements").createSignedUrl(version.storage_path,300);
   if(error||!signed)return respond({error:"Unable to load agreement"},503);
   return respond({title:template.title,pdf_url:signed.signedUrl,expires_at:invitation.expires_at,signing_available:false});
  }
  if(body.action==="signed_document"){
   const bearer=request.headers.get("Authorization");
   if(!bearer?.startsWith("Bearer "))return respond({error:"Unauthorized"},401);
   const userDb=createClient(url,anon,{global:{headers:{Authorization:bearer}},auth:{persistSession:false}});
   const {data:{user}}=await userDb.auth.getUser(bearer.slice(7));
   if(!user)return respond({error:"Unauthorized"},401);
   const businessId=String(body.business_id??""),requestId=String(body.request_id??"");
   const {data:staff}=await db.from("STAFF").select("id").eq("auth_user_id",user.id).eq("business_id",businessId).eq("is_active",true).maybeSingle();
   if(!staff)return respond({error:"Forbidden"},403);
   const {data:signature}=await db.from("service_agreement_signature").select("signed_document_path").eq("business_id",businessId).eq("request_id",requestId).maybeSingle();
   if(!signature)return respond({error:"Signed document not found"},404);
   const {data:link,error:linkError}=await db.storage.from("service-agreements").createSignedUrl(signature.signed_document_path,120);
   if(linkError||!link)return respond({error:"Unable to open document"},503);
   return respond({url:link.signedUrl});
  }
  if(body.action==="sign"){
   const token=String(body.token??""), signer=String(body.signer_name??"").trim(), accepted=body.accepted===true;
   const consent="I have reviewed the service agreement and agree to sign it electronically.";
   if(!/^[a-f0-9]{64}$/.test(token)||signer.length<2||signer.length>160||!accepted)return respond({error:"A valid name and electronic-signature consent are required"},400);
   const tokenHash=await hash(token);
   const {data:invitation}=await db.from("service_agreement_request").select("id,business_id,client_id,status,expires_at,version_id").eq("token_hash",tokenHash).maybeSingle();
   if(!invitation||!["sent","viewed"].includes(invitation.status)||!invitation.expires_at||new Date(invitation.expires_at).getTime()<=Date.now())return respond({error:"Invalid, expired or already signed link"},409);
   const {data:version}=await db.from("service_agreement_version").select("storage_path,file_sha256").eq("id",invitation.version_id).eq("business_id",invitation.business_id).maybeSingle();
   if(!version)return respond({error:"Agreement unavailable"},404);
   const {data:original,error:downloadError}=await db.storage.from("service-agreements").download(version.storage_path);
   if(downloadError||!original)return respond({error:"Unable to load agreement"},503);
   const originalBytes=new Uint8Array(await original.arrayBuffer());
   const originalHash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",originalBytes))).map(b=>b.toString(16).padStart(2,"0")).join("");
   if(version.file_sha256&&version.file_sha256!==originalHash)return respond({error:"Agreement integrity check failed"},409);
   const pdf=await PDFDocument.load(originalBytes,{ignoreEncryption:false});
   const page=pdf.addPage([612,792]);
   const font=await pdf.embedFont(StandardFonts.Helvetica);
   const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
   const signedAt=new Date().toISOString();
   page.drawText("Electronic Signature Certificate",{x:44,y:730,size:18,font:bold,color:rgb(0.08,0.2,0.24)});
   const lines=[
    "This certificate is appended to the agreement reviewed by the signer.",
    "Signer (typed electronic signature):",
    signer,
    "Signed at (UTC): "+signedAt,
    "Agreement SHA-256: "+originalHash,
    "Agreement version ID: "+invitation.version_id,
    "Signing request ID: "+invitation.id,
    "Consent: "+consent
   ];
   let y=680;
   for(const line of lines){
    const chunks=line.match(/.{1,85}/g)??[line];
    for(const chunk of chunks){page.drawText(chunk,{x:44,y,size:line===signer?15:10,font:line===signer?bold:font});y-=20;}
    y-=8;
   }
   const pdfBytes=await pdf.save();
   const pdfHash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",pdfBytes))).map(b=>b.toString(16).padStart(2,"0")).join("");
   const path=`${invitation.business_id}/signed/${invitation.id}-${crypto.randomUUID()}.pdf`;
   const {error:uploadError}=await db.storage.from("service-agreements").upload(path,pdfBytes,{contentType:"application/pdf",upsert:false});
   if(uploadError)return respond({error:"Unable to save signed agreement"},503);
   const audit={signed_at:signedAt,agreement_sha256:originalHash,agreement_version_id:invitation.version_id,signing_request_id:invitation.id,consent_version:1,method:"typed_name"};
   const {error:completeError}=await db.rpc("complete_service_agreement_signature",{p_token_hash:tokenHash,p_signer_name:signer,p_document_path:path,p_document_sha256:pdfHash,p_consent_text:consent,p_audit:audit});
   if(completeError){await db.storage.from("service-agreements").remove([path]);return respond({error:"This signing link may have expired or already been used"},409);}
   return respond({signed:true,signed_at:signedAt});
  }
  return respond({error:"Unknown action"},400);
 } catch {return respond({error:"Unable to process request"},400);}
});
