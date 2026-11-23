import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
  return respond({error:"Unknown action"},400);
 } catch {return respond({error:"Unable to process request"},400);}
});
