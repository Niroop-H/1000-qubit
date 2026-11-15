import {type FormEvent,type ReactNode,useCallback,useEffect,useState} from "react";
import {
 billingRequest,clearSession,configured,createAccount,refreshSession,
 sendPasswordReset,sendVerificationEmail,signIn,
 type FirebaseSession,type AccountStatus
} from "./auth/d25Firebase";
import "./d25-account.css";

const PRICE_PAISE=50000;
const TERMS="d25-monthly-v1";
type Checkout={schema:string;checkoutUrl:string;existing:boolean};
export default function D25AccountGate({children}:{children:ReactNode}){
 const [user,setUser]=useState<FirebaseSession|null>(null);
 const [status,setStatus]=useState<AccountStatus|null>(null);
 const [loading,setLoading]=useState(true);
 const [working,setWorking]=useState(false);
 const [mode,setMode]=useState<"signin"|"signup">("signin");
 const [email,setEmail]=useState("");
 const [password,setPassword]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [consent,setConsent]=useState(false);
 const [checkout,setCheckout]=useState("");
 const refreshAccount=useCallback(async()=>{
  const result=await billingRequest<AccountStatus>("GET","status");
  if(result.schema!=="D25-Account-Subscription/v1"||
   typeof result.active!=="boolean"||!Number.isFinite(result.paidThroughMs))
   throw Error("The subscription service returned an invalid response.");
  setStatus(result);
  if(result.checkoutUrl)setCheckout(result.checkoutUrl);
 },[]);
 useEffect(()=>{
  let active=true;
  const boot=async()=>{
   if(!configured()){if(active)setLoading(false);return;}
   const restored=await refreshSession();
   if(!active)return;
   setUser(restored);
   if(restored?.emailVerified){
    try{await refreshAccount();}
    catch{if(active)setError("Unable to confirm license status. Access is unavailable.");}
   }
   if(active)setLoading(false);
  };
  void boot();
  return()=>{active=false;};
 },[refreshAccount]);
 // The account check always fails closed. Browser storage does not grant access.
 useEffect(()=>{
  if(!user?.emailVerified)return;
  let alive=true;
  const poll=()=>{void refreshAccount().catch(()=>{
   if(alive){setStatus(null);setError("Unable to verify your subscription. Retry when connected.");}
  });};
  const timer=setInterval(poll,300000);
  const onVisible=()=>{if(document.visibilityState==="visible")poll();};
  document.addEventListener("visibilitychange",onVisible);
  return()=>{alive=false;clearInterval(timer);document.removeEventListener("visibilitychange",onVisible);};
 },[user?.emailVerified,refreshAccount]);
 const task=async(fn:()=>Promise<void>)=>{
  setWorking(true);setError("");setNotice("");
  try{await fn();}
  catch(e){setError(e instanceof Error?e.message:"The request did not complete.");}
  finally{setWorking(false);}
 };
 const submit=(e:FormEvent)=>{
  e.preventDefault();
  void task(async()=>{
   if(!email||!password)throw Error("Enter your email and password.");
   const account=mode==="signup"?
    await createAccount(email,password):await signIn(email,password);
   setPassword("");setUser(account);setStatus(null);
   if(account.emailVerified){await refreshAccount();}
   else{setNotice("Check your inbox and verify your email, then select Check verification.");}
  });
 };
 const checkVerification=()=>void task(async()=>{
  const updated=await refreshSession(true);
  if(!updated)throw Error("Your session expired. Sign in again.");
  setUser(updated);
  if(updated.emailVerified){await refreshAccount();setNotice("Email verification confirmed.");}
  else setNotice("Email is not yet verified. Open your verification email first.");
 });
 const logout=()=>{clearSession();setUser(null);setStatus(null);setCheckout("");setConsent(false);
  setEmail("");setPassword("");setError("");setNotice("");};
 const startSubscription=()=>void task(async()=>{
  if(!consent)throw Error("Accept the recurring billing terms before proceeding.");
  const created=await billingRequest<Checkout>("POST","start",{
   confirmRecurring:true,pricePaise:PRICE_PAISE,termsVersion:TERMS
  });
  if(created.schema!=="D25-Checkout-Link/v1"||
    typeof created.checkoutUrl!=="string"||!created.checkoutUrl.startsWith("https://rzp.io/"))
   throw Error("A verified Razorpay subscription link was not provided.");
  setCheckout(created.checkoutUrl);
  setNotice("Razorpay TEST subscription link prepared. Authorize in the external browser; then refresh access status.");
 });
 const cancel=()=>void task(async()=>{
  if(!window.confirm("Stop future monthly renewals? Any paid access stays available through its recorded paid-through date."))return;
  const response=await billingRequest<{scheduled:boolean}>("POST","cancel",{});
  if(!response.scheduled)throw Error("Razorpay did not confirm cancellation scheduling.");
  await refreshAccount();
  setNotice("Cancellation scheduled with Razorpay. Existing paid access continues until expiry.");
 });
 const reset=()=>void task(async()=>{
  if(!email.trim())throw Error("Enter your email address first.");
  await sendPasswordReset(email);
  setNotice("If this address has an account, Firebase will send password-reset instructions.");
 });
 const resend=()=>void task(async()=>{
  await sendVerificationEmail();
  setNotice("Verification email requested. Follow the email link then return to this window.");
 });
 const copyCheckout=()=>void task(async()=>{
  if(!checkout)throw Error("No checkout link is available.");
  await navigator.clipboard.writeText(checkout);
  setNotice("Razorpay authorization link copied. Open it in your normal browser.");
 });
 if(!configured())return <main className="d25-auth-page"><div className="d25-auth-panel">
  <span className="d25-auth-eyebrow">MAH QUANTUM / DEVASHRI S INDUSTRIES</span>
  <h1>D25 Quantum Workspace</h1>
  <p>This installer was built without a Firebase Web API key or the Cloudflare licensing
  endpoint. Local Notepad configuration does not update an already built installer.</p>
  <p>For a connected development installer, set GitHub Actions repository variable
  <code>D25_FIREBASE_WEB_API_KEY</code> to your public Firebase Web API key and
  rebuild the D25 Windows installer. Never upload a Firebase service-account key or
  Razorpay merchant secret.</p>
  <p className="d25-auth-note">No payment has been requested. Live billing is disabled.</p>
 </div></main>;
 if(loading)return <main className="d25-auth-page"><div className="d25-auth-panel" role="status">
  Checking Firebase session and subscription…</div></main>;
 if(user?.emailVerified&&status?.active)return <>
  <div className="d25-account-bar"><span><strong>D25 Quantum Workspace</strong> · Licensed to {user.email}
   {status.paidThroughMs>0?" · Paid until "+new Date(status.paidThroughMs).toLocaleDateString():""}</span>
   <button type="button" onClick={()=>void task(async()=>{await refreshAccount();setNotice("License refreshed.");})}>Refresh license</button>
   {!status.cancellationRequested&&
    <button type="button" onClick={cancel} disabled={working}>Cancel renewal</button>}
   <button type="button" onClick={logout}>Sign out</button></div>
  {notice&&<div className="d25-license-notice" role="status">{notice}</div>}
  {error&&<div className="d25-license-notice" role="alert">{error}</div>}
  {children}
 </>;
 return <main className="d25-auth-page"><section className="d25-auth-panel">
  <span className="d25-auth-eyebrow">DEVASHRI S INDUSTRIES · A DIVISION OF MAH QUANTUM</span>
  <h1>D25 <span>Quantum</span> Workspace</h1>
  <p className="d25-auth-lead">Sign in to your Firebase account and manage your subscription.</p>
  {!user?<form onSubmit={submit} className="d25-auth-form">
   <div className="d25-auth-tabs">
    <button type="button" className={mode==="signin"?"active":""} onClick={()=>{setMode("signin");setError("");}}>Sign in</button>
    <button type="button" className={mode==="signup"?"active":""} onClick={()=>{setMode("signup");setError("");}}>Create account</button>
   </div>
   <label>Email address<input type="email" autoComplete="email" required
    value={email} onChange={e=>setEmail(e.target.value)} maxLength={250}/></label>
   <label>Password<input type="password" autoComplete={mode==="signup"?"new-password":"current-password"}
    required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} /></label>
   <button type="submit" className="d25-auth-primary" disabled={working}>
    {working?"Processing…":mode==="signup"?"Create secure account":"Sign in"}
   </button>
   {mode==="signin"&&<button type="button" className="d25-auth-link" onClick={reset} disabled={working}>Reset password</button>}
   <p className="d25-auth-note">Firebase Authentication manages your password securely. We never store plaintext passwords in Firestore.</p>
  </form>:!user.emailVerified?<div className="d25-auth-form">
   <h2>Verify your email</h2><p>We have not confirmed <strong>{user.email}</strong>. Complete the email-verification link from Firebase.</p>
   <button type="button" className="d25-auth-primary" disabled={working} onClick={checkVerification}>Check verification</button>
   <button type="button" className="d25-auth-link" disabled={working} onClick={resend}>Resend verification email</button>
   <button type="button" className="d25-auth-link" onClick={logout}>Use another account</button>
  </div>:<div className="d25-auth-form">
   <h2>Secure monthly subscription</h2>
   <p className="d25-subscription-price">₹500 <small>/ user / month</small></p>
   <p>Recurring subscription: <strong>₹500 every month, for up to 12 billing cycles</strong>.
   Renewals can be cancelled; paid access continues through its covered period.
   Test payments do not collect real money.</p>
   <p className="d25-auth-note">Account: {user.email} · Subscription: {status?.subscriptionStatus||"not yet active"}</p>
   {status&&status.paidThroughMs>0&&<p className="d25-auth-note">Previously paid through: {new Date(status.paidThroughMs).toLocaleDateString()}.</p>}
   <label className="d25-auth-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
    <span>I authorize a Razorpay TEST subscription of ₹500 per month for up to 12 billing cycles, with the option to cancel future renewals.</span></label>
   <button type="button" className="d25-auth-primary" disabled={working||!consent} onClick={startSubscription}>
    {working?"Processing…":"Prepare Razorpay test subscription"}
   </button>
   {checkout&&<div className="d25-checkout-link">
    <a href={checkout} target="_blank" rel="noopener noreferrer">Open Razorpay authorization link</a>
    <button type="button" className="d25-auth-link" onClick={copyCheckout}>Copy external-browser link</button>
   </div>}
   <button type="button" className="d25-auth-link" disabled={working} onClick={()=>void task(refreshAccount)}>
    I have paid or authorized — check license
   </button>
   <button type="button" className="d25-auth-link" onClick={logout}>Sign out</button>
  </div>}
  {error&&<p role="alert" className="d25-auth-error">{error}</p>}
  {notice&&<p role="status" className="d25-auth-notice">{notice}</p>}
  <footer className="d25-auth-footer">D25 Quantum Workspace · By Devashri S Industries, a division of MAH Quantum · © 2026 MAH Quantum.</footer>
 </section></main>;
}
