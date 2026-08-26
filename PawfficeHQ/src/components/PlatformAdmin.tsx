import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import Dashboard from "./Dashboard";
import "./StaffEarnings.css";

type PlatformOverview = {
  total_businesses: number;
  active_businesses_30_days: number;
  total_staff: number;
  total_clients: number;
  total_pets: number;
  total_appointments: number;
};

type PlatformBusiness = {
  business_id: string;
  business_name: string;
  staff_count: number;
  client_count: number;
  pet_count: number;
  appointment_count: number;
  last_appointment_at: string | null;
};

type ModuleAccessRequest = {
  id: string;
  business_id: string;
  module_key: "pet_sitting" | "boarding_daycare" | "veterinary";
  request_type: string;
  message: string | null;
  created_at: string;
};
type ComplimentaryAccess={business_id:string;access_override_plan:"basic"|"pro"|null;access_override_expires_at:string|null;access_override_reason:string|null};
type ComplimentaryModule={business_id:string;module_key:"pet_sitting"|"boarding_daycare"|"veterinary"};

const emptyOverview: PlatformOverview = {
  total_businesses: 0,
  active_businesses_30_days: 0,
  total_staff: 0,
  total_clients: 0,
  total_pets: 0,
  total_appointments: 0,
};

type PlatformAdminProps = {
  onOpenMyBusiness?: () => void;
};

export default function PlatformAdmin({
  onOpenMyBusiness,
}: PlatformAdminProps) {
  const [overview, setOverview] = useState<PlatformOverview>(emptyOverview);
  const [businesses, setBusinesses] = useState<PlatformBusiness[]>([]);
  const [moduleRequests, setModuleRequests] = useState<ModuleAccessRequest[]>([]);
  const [complimentaryAccess,setComplimentaryAccess]=useState<ComplimentaryAccess[]>([]);
  const [complimentaryModules,setComplimentaryModules]=useState<ComplimentaryModule[]>([]);
  const [complimentaryCandidate,setComplimentaryCandidate]=useState<PlatformBusiness|null>(null);
  const [complimentaryPlan,setComplimentaryPlan]=useState<"basic"|"pro">("pro");
  const [complimentaryDuration,setComplimentaryDuration]=useState("90");
  const [complimentaryExpires,setComplimentaryExpires]=useState("");
  const [complimentaryReason,setComplimentaryReason]=useState("Beta tester");
  const [complimentarySelectedModules,setComplimentarySelectedModules]=useState<string[]>(["pet_sitting","boarding_daycare"]);
  const [savingComplimentary,setSavingComplimentary]=useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [supportCandidate, setSupportCandidate] =
    useState<PlatformBusiness | null>(null);
  const [supportBusiness, setSupportBusiness] =
    useState<PlatformBusiness | null>(null);
  const [supportReason, setSupportReason] = useState("");
  const [supportSessionId, setSupportSessionId] = useState<string | null>(null);
  const [startingSupport, setStartingSupport] = useState(false);

  useEffect(() => {
    async function loadPlatformAdmin() {
      setLoading(true);
      setMessage("");

      const [overviewResult, businessesResult, requestsResult, complimentaryResult, complimentaryModulesResult] = await Promise.all([
        supabase.rpc("get_platform_overview").single(),
        supabase.rpc("get_platform_businesses"),
        supabase.from("module_access_request").select("id, business_id, module_key, request_type, message, created_at").eq("status","pending").order("created_at"),
        supabase.from("business_subscription").select("business_id, access_override_plan, access_override_expires_at, access_override_reason"),
        supabase.from("complimentary_module_access").select("business_id, module_key"),
      ]);

      const error = overviewResult.error || businessesResult.error || requestsResult.error || complimentaryResult.error || complimentaryModulesResult.error;

      if (error) {
        console.error(error);
        setMessage(error.message);
      } else {
        setOverview(
          (overviewResult.data as PlatformOverview | null) ?? emptyOverview,
        );
        setBusinesses(businessesResult.data ?? []);
        setModuleRequests((requestsResult.data as ModuleAccessRequest[] | null) ?? []);
        setComplimentaryAccess((complimentaryResult.data as ComplimentaryAccess[]|null)??[]);
        setComplimentaryModules((complimentaryModulesResult.data as ComplimentaryModule[]|null)??[]);
      }

      setLoading(false);
    }

    void loadPlatformAdmin();
  }, []);

  function activeComplimentary(businessId:string){const item=complimentaryAccess.find(row=>row.business_id===businessId);return Boolean(item?.access_override_reason&&(!item.access_override_expires_at||new Date(item.access_override_expires_at)>new Date()))}
  function openComplimentary(business:PlatformBusiness){const existing=complimentaryAccess.find(item=>item.business_id===business.business_id);setComplimentaryCandidate(business);setComplimentaryPlan(existing?.access_override_plan??"pro");setComplimentaryDuration(existing?.access_override_expires_at?"custom":"90");setComplimentaryExpires(existing?.access_override_expires_at?.slice(0,10)??"");setComplimentaryReason(existing?.access_override_reason??"Beta tester");setComplimentarySelectedModules(complimentaryModules.filter(item=>item.business_id===business.business_id).map(item=>item.module_key))}
  async function saveComplimentary(){
    if(!complimentaryCandidate||complimentaryReason.trim().length<3){setMessage("Enter a reason for complimentary access.");return}
    setSavingComplimentary(true);
    const now=new Date();
    const expires=complimentaryDuration==="never"?null:complimentaryDuration==="custom"?(complimentaryExpires?new Date(`${complimentaryExpires}T23:59:59`).toISOString():null):new Date(now.getTime()+Number(complimentaryDuration)*86400000).toISOString();
    if(complimentaryDuration==="custom"&&!expires){setMessage("Choose a custom expiration date.");setSavingComplimentary(false);return}
    const result=await supabase.rpc("grant_complimentary_access",{p_business_id:complimentaryCandidate.business_id,p_plan:complimentaryPlan,p_expires_at:expires,p_reason:complimentaryReason.trim(),p_modules:complimentarySelectedModules});
    if(result.error){setMessage(result.error.message);setSavingComplimentary(false);return}
    setComplimentaryAccess(current=>[...current.filter(item=>item.business_id!==complimentaryCandidate.business_id),{business_id:complimentaryCandidate.business_id,access_override_plan:complimentaryPlan,access_override_expires_at:expires,access_override_reason:complimentaryReason.trim()}]);
    setComplimentaryModules(current=>[...current.filter(item=>item.business_id!==complimentaryCandidate.business_id),...complimentarySelectedModules.map(module_key=>({business_id:complimentaryCandidate.business_id,module_key:module_key as ComplimentaryModule["module_key"]}))]);
    setMessage(`Complimentary ${complimentaryPlan} access granted to ${complimentaryCandidate.business_name}.`);
    setComplimentaryCandidate(null);
    setSavingComplimentary(false);
  }
  async function revokeComplimentary(){
    if(!complimentaryCandidate)return;
    setSavingComplimentary(true);
    const cleared=await supabase.rpc("revoke_complimentary_access",{p_business_id:complimentaryCandidate.business_id});
    if(cleared.error)setMessage(cleared.error.message);else{
      setComplimentaryAccess(current=>current.filter(item=>item.business_id!==complimentaryCandidate.business_id));
      setComplimentaryModules(current=>current.filter(item=>item.business_id!==complimentaryCandidate.business_id));
      setMessage(`Complimentary access revoked for ${complimentaryCandidate.business_name}.`);
      setComplimentaryCandidate(null);
    }
    setSavingComplimentary(false);
  }

  function moduleName(key: ModuleAccessRequest["module_key"]) {
    return key === "pet_sitting" ? "Pet sitting" : key === "boarding_daycare" ? "Boarding & daycare" : "Veterinary";
  }

  async function reviewModuleRequest(request: ModuleAccessRequest, approve: boolean) {
    setMessage("");
    if (approve) {
      const entitlement = await supabase.from("business_module_entitlement").upsert({ business_id: request.business_id, module_key: request.module_key, status: "active", source: "manual", granted_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "business_id,module_key" });
      if (entitlement.error) { setMessage(entitlement.error.message); return; }
    }
    const reviewed = await supabase.from("module_access_request").update({ status: approve ? "approved" : "denied", reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", request.id);
    if (reviewed.error) setMessage(reviewed.error.message);
    else {
      setModuleRequests(current => current.filter(item => item.id !== request.id));
      setMessage(`${moduleName(request.module_key)} request ${approve ? "approved" : "denied"}.`);
    }
  }

  const filteredBusinesses = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return businesses;

    return businesses.filter((business) =>
      business.business_name.toLowerCase().includes(query),
    );
  }, [businesses, search]);

  async function startSupportSession() {
    if (!supportCandidate || supportReason.trim().length < 5) {
      setMessage("Please enter a short reason for accessing this business.");
      return;
    }

    setStartingSupport(true);
    setMessage("");

    const { data: userResult, error: userError } =
      await supabase.auth.getUser();

    if (userError || !userResult.user) {
      setMessage(
        userError?.message ?? "Unable to identify the signed-in user.",
      );
      setStartingSupport(false);
      return;
    }

    const { data, error } = await supabase
      .from("support_session")
      .insert({
        platform_admin_id: userResult.user.id,
        business_id: supportCandidate.business_id,
        reason: supportReason.trim(),
        read_only: true,
      })
      .select("id")
      .single();

    if (error) {
      console.error(error);
      setMessage(error.message);
      setStartingSupport(false);
      return;
    }

    setSupportSessionId(data.id);
    setSupportBusiness(supportCandidate);
    setSupportCandidate(null);
    setSupportReason("");
    setStartingSupport(false);
  }

  async function endSupportSession() {
    if (supportSessionId) {
      const { error } = await supabase
        .from("support_session")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", supportSessionId);

      if (error) {
        console.error(error);
        setMessage(error.message);
        return;
      }
    }

    setSupportSessionId(null);
    setSupportBusiness(null);
  }

  if (supportBusiness) {
    return (
      <div>
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 100,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 20,
            padding: "12px 24px",
            background: "#f4c95d",
            color: "#20332e",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
          }}
        >
          <div>
            <strong>Read-only support view</strong>
            <span style={{ marginLeft: 10 }}>
              Viewing {supportBusiness.business_name}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void endSupportSession()}
            style={{
              border: "1px solid #20332e",
              borderRadius: 7,
              padding: "8px 14px",
              background: "#ffffff",
              color: "#20332e",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Exit support view
          </button>
        </div>

        <Dashboard
          businessId={supportBusiness.business_id}
          firstName="Support"
          readOnly
        />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f4f7f6" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "22px 34px",
          background: "#00b4d8",
          color: "white",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Pawffice HQ Platform Admin</h1>
          <p style={{ margin: "5px 0 0", opacity: 0.8 }}>
            Software operations and customer support
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {onOpenMyBusiness && (
            <button
              type="button"
              onClick={onOpenMyBusiness}
              style={{
                border: "1px solid rgba(255,255,255,0.5)",
                borderRadius: 7,
                padding: "10px 16px",
                background: "white",
                color: "#0077b6",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              My business dashboard
            </button>
          )}
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            style={{
              border: "1px solid rgba(255,255,255,0.5)",
              borderRadius: 7,
              padding: "10px 16px",
              background: "transparent",
              color: "white",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1500, margin: "0 auto", padding: 34 }}>
        <div style={{ marginBottom: 28 }}>
          <p className="eyebrow">Platform overview</p>
          <h2 style={{ marginTop: 5, fontSize: 36 }}>
            Your software at a glance
          </h2>
        </div>

        {message && (
          <p className="error-message" role="alert">
            {message}
          </p>
        )}

        <section className="summary-grid" style={{ marginBottom: 32 }}>
          <article className="summary-card">
            <span>Total businesses</span>
            <strong>{loading ? "—" : overview.total_businesses}</strong>
          </article>
          <article className="summary-card">
            <span>Active businesses · 30 days</span>
            <strong>
              {loading ? "—" : overview.active_businesses_30_days}
            </strong>
          </article>
          <article className="summary-card">
            <span>Total staff accounts</span>
            <strong>{loading ? "—" : overview.total_staff}</strong>
          </article>
          <article className="summary-card">
            <span>Total appointments</span>
            <strong>{loading ? "—" : overview.total_appointments}</strong>
          </article>
          <article className="summary-card">
            <span>Total clients</span>
            <strong>{loading ? "—" : overview.total_clients}</strong>
          </article>
          <article className="summary-card">
            <span>Total pets</span>
            <strong>{loading ? "—" : overview.total_pets}</strong>
          </article>
        </section>

        <section className="dashboard-panel" style={{ marginBottom: 32 }}>
          <div className="panel-heading"><div><p className="eyebrow">Module access</p><h3>Pending upgrade requests</h3></div><strong>{moduleRequests.length} pending</strong></div>
          {moduleRequests.length === 0 ? <div className="empty-state"><p>No module requests need review.</p></div> : <div style={{display:"grid",gap:12}}>{moduleRequests.map(request => {
            const business = businesses.find(item => item.business_id === request.business_id);
            return <article key={request.id} style={{border:"1px solid #d7e0dd",borderRadius:12,padding:16,display:"flex",justifyContent:"space-between",gap:20,alignItems:"center",flexWrap:"wrap"}}><div><strong>{business?.business_name ?? "Unknown business"}</strong><p style={{margin:"5px 0"}}>{moduleName(request.module_key)} · {request.request_type.replaceAll("_"," ")}</p><small>{new Date(request.created_at).toLocaleString()}</small>{request.message&&<p>{request.message}</p>}</div><div style={{display:"flex",gap:8}}><button className="secondary-button" onClick={()=>void reviewModuleRequest(request,false)}>Deny</button><button className="primary-button" onClick={()=>void reviewModuleRequest(request,true)}>Approve access</button></div></article>
          })}</div>}
        </section>

        <section className="dashboard-panel">
          <div
            className="panel-heading"
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 20,
            }}
          >
            <div>
              <p className="eyebrow">Customers</p>
              <h3>Businesses using Pawffice HQ</h3>
            </div>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search businesses"
              style={{ maxWidth: 320 }}
            />
          </div>

          {loading ? (
            <p>Loading businesses...</p>
          ) : filteredBusinesses.length === 0 ? (
            <div className="empty-state">
              <h3>No businesses found</h3>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#58716b" }}>
                    <th style={{ padding: "12px 10px" }}>Business</th>
                    <th style={{ padding: "12px 10px" }}>Staff</th>
                    <th style={{ padding: "12px 10px" }}>Clients</th>
                    <th style={{ padding: "12px 10px" }}>Pets</th>
                    <th style={{ padding: "12px 10px" }}>Appointments</th>
                    <th style={{ padding: "12px 10px" }}>Last appointment</th>
                    <th style={{ padding: "12px 10px" }} />
                  </tr>
                </thead>
                <tbody>
                  {filteredBusinesses.map((business) => (
                    <tr
                      key={business.business_id}
                      style={{ borderTop: "1px solid #d7e0dd" }}
                    >
                      <td style={{ padding: "16px 10px" }}>
                        <strong>{business.business_name}</strong>{activeComplimentary(business.business_id)&&<span style={{display:"block",marginTop:5,color:"#087341",fontWeight:800,fontSize:12}}>Complimentary access</span>}
                      </td>
                      <td style={{ padding: "16px 10px" }}>
                        {business.staff_count}
                      </td>
                      <td style={{ padding: "16px 10px" }}>
                        {business.client_count}
                      </td>
                      <td style={{ padding: "16px 10px" }}>
                        {business.pet_count}
                      </td>
                      <td style={{ padding: "16px 10px" }}>
                        {business.appointment_count}
                      </td>
                      <td style={{ padding: "16px 10px" }}>
                        {business.last_appointment_at
                          ? new Date(
                              business.last_appointment_at,
                            ).toLocaleDateString()
                          : "None"}
                      </td>
                      <td style={{ padding: "16px 10px", textAlign: "right" }}>
                        <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap"}}><button type="button" className="secondary-button" onClick={()=>openComplimentary(business)}>{activeComplimentary(business.business_id)?"Manage complimentary":"Grant free access"}</button><button
                          type="button"
                          className="primary-button"
                          onClick={() => {
                            setMessage("");
                            setSupportCandidate(business);
                          }}
                        >
                          Support view
                        </button></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {complimentaryCandidate&&<div className="earnings-modal-backdrop" onClick={()=>setComplimentaryCandidate(null)}><section className="earnings-ledger" onClick={event=>event.stopPropagation()}><header><div><p className="eyebrow">Complimentary access</p><h3>{complimentaryCandidate.business_name}</h3><p>Bypass subscription billing for testing or a complimentary customer.</p></div><button onClick={()=>setComplimentaryCandidate(null)}>Close</button></header><div style={{display:"grid",gap:16,marginTop:20}}><label>Tester plan<select value={complimentaryPlan} onChange={event=>setComplimentaryPlan(event.target.value as "basic"|"pro")}><option value="pro">Pro · 1,000 SMS segments</option><option value="basic">Basic · 250 SMS segments</option></select></label><label>Duration<select value={complimentaryDuration} onChange={event=>setComplimentaryDuration(event.target.value)}><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option><option value="custom">Custom expiration</option><option value="never">Never expires</option></select></label>{complimentaryDuration==="custom"&&<label>Expiration date<input type="date" value={complimentaryExpires} onChange={event=>setComplimentaryExpires(event.target.value)}/></label>}<label>Reason<input value={complimentaryReason} onChange={event=>setComplimentaryReason(event.target.value)} placeholder="Beta tester"/></label><fieldset style={{border:"1px solid #d7e0dd",borderRadius:10,padding:14}}><legend>Complimentary add-on modules</legend>{[["pet_sitting","Pet sitting"],["boarding_daycare","Boarding & daycare"],["veterinary","Veterinary"]].map(([key,label])=><label key={key} style={{display:"flex",gap:8,alignItems:"center",marginTop:8}}><input type="checkbox" checked={complimentarySelectedModules.includes(key)} onChange={event=>setComplimentarySelectedModules(current=>event.target.checked?[...current,key]:current.filter(item=>item!==key))}/>{label}</label>)}</fieldset><div style={{display:"flex",gap:10,justifyContent:"space-between",flexWrap:"wrap"}}>{activeComplimentary(complimentaryCandidate.business_id)&&<button className="secondary-button" disabled={savingComplimentary} onClick={()=>void revokeComplimentary()}>Revoke access</button>}<button className="primary-button" disabled={savingComplimentary} onClick={()=>void saveComplimentary()}>{savingComplimentary?"Saving…":"Grant complimentary access"}</button></div></div></section></div>}

      {supportCandidate && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            display: "grid",
            placeItems: "center",
            padding: 20,
            background: "rgba(18, 44, 38, 0.58)",
          }}
        >
          <section
            className="dashboard-panel"
            style={{ width: "min(560px, 100%)", margin: 0 }}
          >
            <p className="eyebrow">Audited support access</p>
            <h2>View {supportCandidate.business_name}?</h2>
            <p>
              This opens a read-only view of the business and records your
              reason and session times.
            </p>
            <label>
              Support reason
              <textarea
                value={supportReason}
                onChange={(event) => setSupportReason(event.target.value)}
                placeholder="Example: Investigating calendar display issue"
                rows={4}
                autoFocus
              />
            </label>
            <div className="form-actions" style={{ marginTop: 20 }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setSupportCandidate(null);
                  setSupportReason("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={startingSupport}
                onClick={() => void startSupportSession()}
              >
                {startingSupport ? "Opening..." : "Enter support view"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
