import {type FormEvent,useCallback,useEffect,useRef,useState} from "react";
import "./d25-admin.css";

type D25Session={idToken:string;refreshToken:string;expiresAt:number};
type Month={month:string;transactions:number;grossInr:number;checkoutAccounts:number};
type Overview={schema:string;asOf:string;subscriptionAccounts:number;
 unexpiredPaidRecords:number;mrrUpperBoundInr:number;collectedGrossInr12Months:number;
 charges12Months:number;months:Month[];limitations:string[]};
type User={uid:string;email:string;displayName:string;disabled:boolean;emailVerified:boolean;
 subscriptionStatus:string;subscriptionId:string|null;paidThroughMs:number;
 active:boolean;cancellationRequested:boolean;revoked:boolean};
type Users={users:User[];nextCursor:string|null;note?:string};
type Audit={events:{id:string;atMs:number;actorUid:string;targetUid:string;action:string;state:string}[]};
type Scope="all"|"active";
const KEY="d25-admin-refresh-session-v1";
const projectKey=String(import.meta.env.VITE_D25_FIREBASE_API_KEY??"");
const googleClientId=String(import.meta.env.VITE_D25_GOOGLE_CLIENT_ID??"");
const apiBase=String(import.meta.env.VITE_D25_ADMIN_API_BASE??"").replace(/\/$/,"");
const configured=()=>!!projectKey&&!!googleClientId&&/^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9_-]+$/.test(apiBase);
const money=(value:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(value);
type GoogleIdentity={accounts:{id:{initialize:(opts:{client_id:string;callback:(data:{credential:string})=>void})=>void;
 renderButton:(node:HTMLElement,options:object)=>void}}};
function googleSdk(){return(window as unknown as {google?:GoogleIdentity}).google;}
async function fromGoogle(credential:string):Promise<D25Session>{
 const result=await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key="+encodeURIComponent(projectKey),{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({postBody:new URLSearchParams({id_token:credential,providerId:"google.com"}).toString(),
   requestUri:window.location.origin+"/admin",returnSecureToken:true}),
  signal:AbortSignal.timeout(20000)
 });
 if(!result.ok)throw Error("Google login was not accepted by Firebase. Check the authorized domain and Google provider.");
 const data=await result.json();
 if(!data.idToken||!data.refreshToken||data.providerId!=="google.com")
  throw Error("Firebase did not return a verified Google session.");
 return{idToken:data.idToken,refreshToken:data.refreshToken,
  expiresAt:Date.now()+Number(data.expiresIn||3600)*1000};
}
async function fresh(session:D25Session):Promise<D25Session>{
 if(session.expiresAt>Date.now()+90000)return session;
 const response=await fetch("https://securetoken.googleapis.com/v1/token?key="+encodeURIComponent(projectKey),{
  method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams({grant_type:"refresh_token",refresh_token:session.refreshToken}),
  signal:AbortSignal.timeout(20000)
 });
 if(!response.ok)throw Error("Administrator session expired. Sign in again.");
 const data=await response.json();
 if(!data.id_token||!data.refresh_token)throw Error("Unable to refresh administrator session.");
 return{idToken:data.id_token,refreshToken:data.refresh_token,
  expiresAt:Date.now()+Number(data.expires_in||3600)*1000};
}
function Chart({items,kind,label}:{items:Month[];kind:"grossInr"|"transactions"|"checkoutAccounts";label:string}){
 const values=items.map(x=>x[kind]);
 const maximum=Math.max(1,...values);
 return <div className="d25-chart" role="img" aria-label={label+" per UTC month"}>
  <svg viewBox="0 0 840 280" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
   {Array.from({length:5},(_,i)=><g key={i}>
    <line x1={55} y1={20+i*53} x2={826} y2={20+i*53} stroke="#28425c"/>
    <text x={45} y={24+i*53} fill="#91abc1" textAnchor="end" fontSize="11">
     {kind==="grossInr"?money(Math.round(maximum*(1-i/4))):Math.round(maximum*(1-i/4))}
    </text>
   </g>)}
   {items.map((p,i)=>{
    const x=67+i*63, height=Math.max(0,values[i]/maximum*210), y=232-height;
    return <g key={p.month}>
     <rect x={x} y={y} width="35" height={height} rx="4" fill={kind==="grossInr"?"#e2b66d":kind==="transactions"?"#60badb":"#a6cf7b"}/>
     <text x={x+17} y={255} textAnchor="middle" fill="#b4c6d7" fontSize="12">{p.month.slice(5)}</text>
     <title>{p.month}: {kind==="grossInr"?money(values[i]):values[i]+(kind==="transactions"?" payments":" checkout accounts")}</title>
    </g>;
   })}
  </svg>
  <small>UTC months · {kind==="grossInr"?"Gross recorded captures, before refunds/fees":kind==="transactions"?"Recorded captured transactions":"Accounts that initiated subscription checkout"}</small>
 </div>;
}
export default function D25AdminPortal(){
 const [session,setSession]=useState<D25Session|null>(null);
 const [loading,setLoading]=useState(true);
 const [working,setWorking]=useState(false);
 const [error,setError]=useState("");
 const [overview,setOverview]=useState<Overview|null>(null);
 const [users,setUsers]=useState<Users|null>(null);
 const [audit,setAudit]=useState<Audit|null>(null);
 const [scope,setScope]=useState<Scope>("all");
 const [search,setSearch]=useState("");
 const [searchDraft,setSearchDraft]=useState("");
 const metricsFetchedAt=useRef(0);
 const [cursor,setCursor]=useState("");
 const [notice,setNotice]=useState("");
 const googleButton=useRef<HTMLDivElement>(null);
 const signOut=useCallback(()=>{
  sessionStorage.removeItem(KEY);setSession(null);setOverview(null);setUsers(null);setAudit(null);
  setNotice("");setCursor("");setError("");
 },[]);
 const api=useCallback(async<T,>(route:string,method:"GET"|"POST"="GET",body?:object):Promise<T>=>{
  if(!session)throw Error("Administrator sign-in required.");
  const s=await fresh(session);
  if(s!==session){setSession(s);sessionStorage.setItem(KEY,JSON.stringify(s));}
  const result=await fetch(apiBase+"/"+route,{
   method,headers:{"Authorization":"Bearer "+s.idToken,"Accept":"application/json",
    ...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),cache:"no-store",signal:AbortSignal.timeout(45000)
  });
  const response=await result.json().catch(()=>({}));
  if(result.status===403)throw Error("Administrator authorization denied. A Google account alone does not grant the D25 admin role.");
  if(!result.ok)throw Error(result.status===401?"Admin session expired. Sign in again.":"Administrator API unavailable. No changes are assumed.");
  return response as T;
 },[session]);
 const reload=useCallback(async(forceMetrics=false)=>{
  if(!session)return;
  setWorking(true);setError("");
  try{
   const needsMetrics=forceMetrics||!overview||Date.now()-metricsFetchedAt.current>90000;
   const [summary,list,events]=await Promise.all([
    needsMetrics?api<Overview>("overview"):Promise.resolve(overview!),
    api<Users>("users?scope="+scope+(cursor?"&cursor="+encodeURIComponent(cursor):"")+
      (search?"&search="+encodeURIComponent(search):"")),
    needsMetrics?api<Audit>("audit"):Promise.resolve(audit!)
   ]);
   if(needsMetrics)metricsFetchedAt.current=Date.now();
   if(summary.schema!=="D25-Admin-Overview/v1"||!Array.isArray(summary.months)||
      !Array.isArray(list.users))throw Error("Unexpected admin server response.");
   setOverview(summary);setUsers(list);setAudit(events);
  }catch(e){setOverview(null);setUsers(null);setAudit(null);setError(e instanceof Error?e.message:"Dashboard unavailable.");}
  finally{setWorking(false);}
 },[session,api,scope,cursor,search,overview,audit]);
 useEffect(()=>{
  document.title="D25 Administrator Console | MAH Quantum";
  if(!configured()){setLoading(false);return;}
  try{const s=JSON.parse(sessionStorage.getItem(KEY)||"null");
   if(s?.idToken&&s?.refreshToken&&Number.isFinite(s.expiresAt))setSession(s);
  }catch{sessionStorage.removeItem(KEY);}
  setLoading(false);
 },[]);
 useEffect(()=>{
  if(!session)return;
  void reload();
 },[session?.refreshToken,scope,cursor,search]); // refresh only on identity or filters, not on token renewal
 useEffect(()=>{
  if(!configured()||session||!googleButton.current)return;
  let live=true;
  const button=googleButton.current;
  const initialize=()=>{
   if(!live||!googleSdk()||!button)return;
   button.replaceChildren();
   googleSdk()!.accounts.id.initialize({client_id:googleClientId,callback:async({credential})=>{
    if(!live)return;
    setWorking(true);setError("");
    try{
     const next=await fromGoogle(credential);
     sessionStorage.setItem(KEY,JSON.stringify(next));setSession(next);
    }catch(e){setError(e instanceof Error?e.message:"Google sign-in failed.");}
    finally{setWorking(false);}
   }});
   googleSdk()!.accounts.id.renderButton(button,{theme:"outline",size:"large",text:"signin_with",width:290});
  };
  if(googleSdk())initialize();
  else{
   const script=document.createElement("script");
   script.src="https://accounts.google.com/gsi/client";
   script.async=true;script.defer=true;script.onload=initialize;
   script.onerror=()=>{if(live)setError("Google sign-in could not load. Check the website CSP and authorized origin.");};
   document.head.appendChild(script);
  }
  return()=>{live=false;};
 },[session]);
 async function change(user:User,action:"disableUser"|"enableUser"|"revokeLicense"|"cancelRenewal"){
  const label={disableUser:"DISABLE",enableUser:"ENABLE",revokeLicense:"REVOKE",cancelRenewal:"CANCEL"}[action];
  const answer=window.prompt("Type "+label+" to confirm action for "+user.email+
   ". Payment/mandate cancellation and account access are separate controls.");
  if(answer!==label)return;
  setWorking(true);setError("");setNotice("");
  try{
   const outcome=await api<{success:boolean}>("action","POST",{uid:user.uid,action,confirm:true});
   if(!outcome.success)throw Error("Admin action was not confirmed.");
   setNotice(label+" completed for "+user.email+". An audit entry was recorded.");
   await reload();
  }catch(e){setError(e instanceof Error?e.message:"Action failed. Do not assume success.");}
  finally{setWorking(false);}
 }
 const lookUp=(e:FormEvent)=>{e.preventDefault();setCursor("");setSearch(searchDraft.trim());};
 if(!configured())return <main className="d25-admin"><section className="d25-admin-login">
  <p>D25 / MAH QUANTUM</p><h1>Administrator Console</h1>
  <p>Admin identity configuration is not deployed. Sign-in is disabled until Firebase Google Authentication,
   the authorized Google client and the D25 Admin API are configured.</p>
 </section></main>;
 if(loading)return <main className="d25-admin">Checking administrator configuration…</main>;
 if(!session)return <main className="d25-admin"><section className="d25-admin-login">
  <p className="d25-overline">MAH QUANTUM · DEVASHRI S INDUSTRIES</p>
  <h1>D25 Administrator Console</h1>
  <p>Secure administrative login using Google and Firebase. A verified, explicitly granted administrator role is required.</p>
  <div ref={googleButton} className="d25-google-login" />
  {working&&<p role="status">Authenticating…</p>}
  {error&&<p role="alert" className="d25-admin-error">{error}</p>}
  <small>Unauthorized accounts cannot view subscription, marketing or customer information.</small>
 </section></main>;
 return <main className="d25-admin">
  <header className="d25-admin-header">
   <div><span className="d25-overline">DEVASHRI S INDUSTRIES · A DIVISION OF MAH QUANTUM</span>
    <h1>D25 <span>Admin Center</span></h1>
    <p>Subscription operations, payments and verified business intelligence</p>
   </div>
   <div className="d25-admin-actions"><button disabled={working} onClick={()=>void reload(true)}>Refresh dashboard</button>
    <button onClick={signOut}>Sign out</button></div>
  </header>
  {error&&<p className="d25-admin-error" role="alert">{error}</p>}
  {notice&&<p className="d25-admin-success" role="status">{notice}</p>}
  {overview?<section>
   <div className="d25-metrics">
    <article><small>Subscription accounts</small><strong>{overview.subscriptionAccounts.toLocaleString("en-IN")}</strong><em>Checkout-account documents</em></article>
    <article><small>Unexpired paid records</small><strong>{overview.unexpiredPaidRecords.toLocaleString("en-IN")}</strong><em>May include disabled/revoked users</em></article>
    <article><small>MRR estimate (upper bound)</small><strong>{money(overview.mrrUpperBoundInr)}</strong><em>Not settled revenue</em></article>
    <article><small>Gross captures · 12 months</small><strong>{money(overview.collectedGrossInr12Months)}</strong><em>{overview.charges12Months} recorded payments</em></article>
   </div>
   <div className="d25-admin-charts">
    <article><h2>Captured payment value</h2><Chart items={overview.months} kind="grossInr" label="Gross captured amount"/></article>
    <article><h2>Monthly paid transactions</h2><Chart items={overview.months} kind="transactions" label="Captured transaction count"/></article>
    <article><h2>New checkout accounts</h2><Chart items={overview.months} kind="checkoutAccounts" label="New subscriptions checkout account records"/></article>
   </div>
   <div className="d25-admin-explanation"><strong>Data interpretation</strong>
    {overview.limitations.map(x=><p key={x}>{x}</p>)}
    <p>Acquisition channels, website visits, conversions and advertising spend require a separately consented analytics integration.</p>
   </div>
  </section>:<p role="status">No verified dashboard metrics are available.</p>}
  <section className="d25-admin-section">
   <div className="d25-admin-section-heading"><h2>User and subscription management</h2>
    <div className="d25-admin-filters">
     <button aria-pressed={scope==="all"} onClick={()=>{setScope("all");setCursor("");}}>All registered users</button>
     <button aria-pressed={scope==="active"} onClick={()=>{setScope("active");setCursor("");}}>Active paid users</button>
    </div>
   </div>
   <form className="d25-admin-search" onSubmit={lookUp}>
    <label htmlFor="d25-find-user">Find exact email or Firebase user ID</label>
    <input id="d25-find-user" value={searchDraft} onChange={e=>setSearchDraft(e.target.value)}
     placeholder="user@example.com or Firebase UID" maxLength={200}/>
    <button type="submit">Find</button><button type="button" onClick={()=>{setSearch("");setSearchDraft("");setCursor("");}}>Clear</button>
   </form>
   <div className="d25-admin-table-scroll"><table><thead><tr>
    <th>User</th><th>Subscription</th><th>Paid through</th><th>Account</th><th>Actions</th>
   </tr></thead><tbody>
    {(users?.users||[]).map(u=><tr key={u.uid}>
     <td><strong>{u.email||"Unnamed account"}</strong><small>{u.uid}</small></td>
     <td><span className={u.active?"d25-state-active":"d25-state-idle"}>{u.active?"Active":u.subscriptionStatus}</span>
      {u.cancellationRequested&&<small>Renewal cancellation requested</small>}</td>
     <td>{u.paidThroughMs>0?new Date(u.paidThroughMs).toLocaleDateString("en-IN"):"—"}</td>
     <td>{u.disabled?"Disabled":u.emailVerified?"Verified":"Not verified"}</td>
     <td className="d25-user-controls">
      <button disabled={working} onClick={()=>void change(u,u.disabled?"enableUser":"disableUser")}>{u.disabled?"Enable":"Disable"}</button>
      <button disabled={working||u.revoked||!u.active} onClick={()=>void change(u,"revokeLicense")}>Revoke license</button>
      <button disabled={working||!u.subscriptionId||u.cancellationRequested} onClick={()=>void change(u,"cancelRenewal")}>Cancel renewal</button>
     </td>
    </tr>)}
    {users?.users.length===0&&<tr><td colSpan={5}>No matching accounts found.</td></tr>}
   </tbody></table></div>
   <div className="d25-pagination">
    <span>{users?.users.length||0} users shown (paginated)</span>
    <button disabled={working||!users?.nextCursor} onClick={()=>setCursor(users!.nextCursor!)}>Next 50</button>
    <button disabled={working||!cursor} onClick={()=>setCursor("")}>First page</button>
   </div>
  </section>
  <section className="d25-admin-section">
   <h2>Recent administrative actions</h2>
   <div className="d25-admin-table-scroll"><table><thead><tr><th>Time</th><th>Operation</th><th>Target UID</th><th>Status</th></tr></thead>
    <tbody>{(audit?.events||[]).map(x=><tr key={x.id}>
     <td>{new Date(x.atMs).toLocaleString()}</td><td>{x.action}</td><td>{x.targetUid}</td><td>{x.state}</td>
    </tr>)}{!audit?.events?.length&&<tr><td colSpan={4}>No audit entries yet.</td></tr>}</tbody></table></div>
  </section>
  <footer>© 2026 MAH Quantum · D25 Quantum Workspace · By Devashri S Industries, a division of MAH Quantum</footer>
 </main>;
}
