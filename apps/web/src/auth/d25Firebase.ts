/**
 * D25 password-based accounts are stored/verified by FIREBASE AUTHENTICATION.
 * Never place user passwords in Firestore, app settings, server logs or analytics.
 * Only a Firebase refresh token is retained for this window's session.
 * This direct REST adapter avoids adding unaudited desktop npm dependencies.
 */
const AUTH_KEY="d25-firebase-refresh-token-v1";
const firebaseKey=import.meta.env.VITE_D25_FIREBASE_API_KEY as string|undefined;
const rawBase=(import.meta.env.VITE_D25_API_BASE as string|undefined)||"";
let session:FirebaseSession|null=null;
export interface FirebaseSession {
 uid:string;email:string;emailVerified:boolean;idToken:string;
 refreshToken:string;expiresAtMs:number;
}
export interface AccountStatus {
 schema:"D25-Account-Subscription/v1";
 uid:string;email:string;active:boolean;paidThroughMs:number;
 subscriptionStatus:string;cancellationRequested:boolean;
 checkoutUrl:string|null;monthlyAmountPaise:number;maxCycles:number;
}
export function configured(){
 return !!firebaseKey&&!!rawBase&&
  /^https:\/\/[a-zA-Z0-9.-]+\/[a-zA-Z0-9/_-]+\/?$/.test(rawBase);
}
function cfg(){
 if(!configured())throw Error("D25 Firebase test account service has not been configured.");
 return firebaseKey!;
}
function apiBase(){cfg();return rawBase.replace(/\/$/,"");}
function firebaseError(code:string){
 const errors:Record<string,string>={
  EMAIL_EXISTS:"An account with this email already exists.",
  INVALID_EMAIL:"Enter a valid email address.",
  INVALID_PASSWORD:"Invalid email or password.",
  INVALID_LOGIN_CREDENTIALS:"Invalid email or password.",
  EMAIL_NOT_FOUND:"Invalid email or password.",
  USER_DISABLED:"This account is disabled. Contact support.",
  TOO_MANY_ATTEMPTS_TRY_LATER:"Too many attempts. Please try again later.",
  WEAK_PASSWORD:"Use a stronger password.",
  TOKEN_EXPIRED:"Your session expired. Please sign in again."
 };
 return errors[code]||"Unable to complete authentication. Please retry.";
}
async function authRequest(endpoint:string,input:unknown){
 const response=await fetch("https://identitytoolkit.googleapis.com/v1/accounts:"+endpoint+"?key="+
  encodeURIComponent(cfg()),{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify(input),signal:AbortSignal.timeout(20000)});
 const data=await response.json();
 if(!response.ok)throw Error(firebaseError(String(data?.error?.message||"")));
 return data;
}
async function enrich(s:FirebaseSession):Promise<FirebaseSession>{
 const data=await authRequest("lookup",{idToken:s.idToken});
 const user=Array.isArray(data?.users)?data.users[0]:null;
 if(!user||user.localId!==s.uid)throw Error("Unable to verify your Firebase account.");
 return {...s,email:String(user.email||s.email),emailVerified:user.emailVerified===true};
}
function remember(s:FirebaseSession):FirebaseSession{
 session=s;
 try{sessionStorage.setItem(AUTH_KEY,s.refreshToken);}catch{/* sign-in still works for current view */}
 return s;
}
export async function createAccount(email:string,password:string){
 const out=await authRequest("signUp",{email:email.trim(),password,returnSecureToken:true});
 const state:FirebaseSession={uid:out.localId,email:out.email,emailVerified:false,
  idToken:out.idToken,refreshToken:out.refreshToken,
  expiresAtMs:Date.now()+Math.max(300,Number(out.expiresIn)||3600)*1000};
 await authRequest("sendOobCode",{requestType:"VERIFY_EMAIL",idToken:out.idToken});
 return remember(await enrich(state));
}
export async function signIn(email:string,password:string){
 const out=await authRequest("signInWithPassword",{email:email.trim(),password,returnSecureToken:true});
 const state:FirebaseSession={uid:out.localId,email:out.email,emailVerified:false,
  idToken:out.idToken,refreshToken:out.refreshToken,
  expiresAtMs:Date.now()+Math.max(300,Number(out.expiresIn)||3600)*1000};
 return remember(await enrich(state));
}
export async function refreshSession(force=false):Promise<FirebaseSession|null>{
 const token=session?.refreshToken||(()=>{try{return sessionStorage.getItem(AUTH_KEY)}catch{return null}})();
 if(!token)return null;
 if(session&&!force&&session.expiresAtMs>Date.now()+120000)return session;
 try{
  const res=await fetch("https://securetoken.googleapis.com/v1/token?key="+
   encodeURIComponent(cfg()),{method:"POST",
   headers:{"Content-Type":"application/x-www-form-urlencoded"},
   body:new URLSearchParams({grant_type:"refresh_token",refresh_token:token}),
   signal:AbortSignal.timeout(20000)});
  const data=await res.json();
  if(!res.ok)throw Error("Session renewal failed.");
  const result:FirebaseSession={uid:String(data.user_id),email:session?.email||"",
   emailVerified:false,idToken:String(data.id_token),refreshToken:String(data.refresh_token),
   expiresAtMs:Date.now()+Math.max(300,Number(data.expires_in)||3600)*1000};
  return remember(await enrich(result));
 }catch{
  clearSession();
  return null;
 }
}
export async function sendVerificationEmail(){
 const state=await refreshSession();
 if(!state)throw Error("Sign in again to verify your email.");
 await authRequest("sendOobCode",{requestType:"VERIFY_EMAIL",idToken:state.idToken});
}
export async function sendPasswordReset(email:string){
 await authRequest("sendOobCode",{requestType:"PASSWORD_RESET",email:email.trim()});
}
export function clearSession(){
 session=null;
 try{sessionStorage.removeItem(AUTH_KEY);}catch{}
}
export async function billingRequest<T>(method:"GET"|"POST",route:string,body?:unknown):Promise<T>{
 const state=await refreshSession();
 if(!state||!state.emailVerified)throw Error("Sign in and verify your email first.");
 const res=await fetch(apiBase()+"/"+route,{
  method,headers:{"Authorization":"Bearer "+state.idToken,
   "Accept":"application/json",...(method==="POST"?{"Content-Type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),cache:"no-store",signal:AbortSignal.timeout(25000)
 });
 const data=await res.json().catch(()=>null);
 if(!res.ok)throw Error(res.status===401||res.status===403?
  "Account authorization failed. Sign in again.":
  res.status===503?"Billing service is unavailable. No subscription was started.":
  String(data?.error||"Unable to complete request.").slice(0,180));
 return data as T;
}
