import {useCallback,useEffect,useState} from "react";
import {refreshSession} from "../auth/d25Firebase";
import {BROWSER_BUDGET_KEY,BROWSER_EXECUTION_LIMIT,parseBudget,spendBudget,
 remainingTimeLabel,type BrowserBudget} from "./execution-budget-policy";

type BudgetReply={limit:number;remaining:number;retryAt:number;allowed:boolean};
const licenseBase=String(import.meta.env.VITE_D25_API_BASE||"").replace(/\/$/,"");
const isDesktop=()=>typeof window!=="undefined"&&"__TAURI_INTERNALS__" in window;
const useNetwork=()=>!isDesktop()&&typeof location!=="undefined"&&
 !["localhost","127.0.0.1","::1"].includes(location.hostname);

function validBudget(data:any,schema:string):data is BudgetReply {
 return data?.schema===schema&&
  Number.isInteger(data.limit)&&data.limit===BROWSER_EXECUTION_LIMIT&&
  Number.isInteger(data.remaining)&&data.remaining>=0&&data.remaining<=data.limit&&
  Number.isFinite(data.retryAt)&&data.retryAt>=0&&
  typeof data.allowed==="boolean";
}
async function desktopResponse(command:"d25_quota_status"|"d25_quota_reserve"):Promise<BudgetReply>{
 if(!/^https:\/\/[a-zA-Z0-9.-]+(?:\/[a-zA-Z0-9/_-]+)?$/.test(licenseBase))
  throw Error("Cloudflare D25 license endpoint is not configured.");
 const user=await refreshSession();
 if(!user?.emailVerified)throw Error("Verified Firebase login is required.");
 const reserve=command==="d25_quota_reserve";
 const url=licenseBase+"/quota/"+(reserve?"reserve":"status");
 const response=await fetch(url,{method:reserve?"POST":"GET",cache:"no-store",
  headers:{"Authorization":"Bearer "+user.idToken,
   "Accept":"application/json",...(reserve?{"Content-Type":"application/json"}:{})},
  ...(reserve?{body:JSON.stringify({requestId:crypto.randomUUID()})}:{}),
  signal:AbortSignal.timeout(20000)
 });
 if(response.status===401||response.status===403)throw Error("Active Firebase license required.");
 if(response.status===429)return desktopResponse("d25_quota_status");
 if(!response.ok)throw Error("Cloudflare license server refused authorization.");
 const data=await response.json();
 if(!validBudget(data,"D25-Desktop-Quota/v1"))
  throw Error("Unexpected D25 server quota response.");
 return data;
}

async function remoteResponse(method:"GET"|"POST"):Promise<BudgetReply|null>{
 const res=await fetch("/api/usage",{method,cache:"no-store",
  headers:{"Accept":"application/json",...(method==="POST"?{"Content-Type":"application/json"}:{})},
  ...(method==="POST"?{body:"{}"}:{})});
 if(res.status!==200&&res.status!==429)return null;
 const data=await res.json();
 return validBudget(data,"MAH-Quantum-Workspace-Credits/v1")?data:null;
}
export function useExecutionBudget(){
 const [budget,setBudget]=useState<BrowserBudget>(()=>{
  try{return parseBudget(localStorage.getItem(BROWSER_BUDGET_KEY),Date.now());}
  catch{return parseBudget(null,Date.now());}
 });
 const [remote,setRemote]=useState<BudgetReply|null>(null);
 const [desktopBudget,setDesktopBudget]=useState<BudgetReply|null>(null);
 const [desktopError,setDesktopError]=useState("");
 const [networkFallback,setNetworkFallback]=useState(false);
 const [now,setNow]=useState(Date.now());
 const [error,setError]=useState("");
 const refresh=useCallback(()=>{
  try{setBudget(parseBudget(localStorage.getItem(BROWSER_BUDGET_KEY),Date.now()));setError("");}
  catch{setError("Execution allowance storage is unavailable or invalid.");}
  setNow(Date.now());
 },[]);
 useEffect(()=>{
  if(isDesktop()){
   let active=true;
   const poll=()=>{void desktopResponse("d25_quota_status").then(result=>{
    if(active){setDesktopBudget(result);setDesktopError("");setNow(Date.now());}
   }).catch(()=>{
    if(active){setDesktopBudget(null);setDesktopError("Cloudflare license authorization unavailable. Computations are blocked.");}
   });};
   poll();
   const pollTimer=setInterval(poll,5000);
   const clock=setInterval(()=>setNow(Date.now()),1000);
   return()=>{active=false;clearInterval(pollTimer);clearInterval(clock);};
  }
  refresh();
  const timer=setInterval(refresh,1000);
  const onStorage=(event:StorageEvent)=>{
   if(event.key===BROWSER_BUDGET_KEY||event.key===null)refresh();
  };
  window.addEventListener("storage",onStorage);
  if(useNetwork()){
   // Browser JavaScript does not retrieve or persist a network address.
   void remoteResponse("GET").then(result=>{
    if(result){setRemote(result);setNetworkFallback(false);}
    else setNetworkFallback(true);
   }).catch(()=>setNetworkFallback(true));
  }
  return()=>{clearInterval(timer);window.removeEventListener("storage",onStorage);};
 },[refresh]);
 const reserve=useCallback(async():Promise<{ok:boolean;message:string}>=>{
  if(isDesktop()){
   try{
    const result=await desktopResponse("d25_quota_reserve");
    setDesktopBudget(result);setDesktopError("");setNow(Date.now());
    if(result.allowed)return{ok:true,message:""};
    return{ok:false,message:"Desktop execution allowance used. Retry in "+
      remainingTimeLabel(result.retryAt,Date.now())+"."};
   }catch{
    const message="Cloudflare license authorization unavailable. Computations are blocked.";
    setDesktopError(message);setDesktopBudget(null);
    return{ok:false,message};
   }
  }
  if(useNetwork()){
   try{
    const network=await remoteResponse("POST");
    if(network){
     setRemote(network);setNetworkFallback(false);setNow(Date.now());
     if(network.allowed)return{ok:true,message:""};
     return{ok:false,message:"Network execution allowance used. Retry in "+
      remainingTimeLabel(network.retryAt,Date.now())+"."};
    }
   }catch{/* Clearly marked local fallback below. */}
   setNetworkFallback(true);setRemote(null);
  }
  // Browser-only fallback remains a non-security control for the hosted web app.
  const commit=()=>{
   const at=Date.now(),current=parseBudget(localStorage.getItem(BROWSER_BUDGET_KEY),at);
   const outcome=spendBudget(current,at);
   if(outcome.ok)localStorage.setItem(BROWSER_BUDGET_KEY,JSON.stringify(outcome.budget));
   return outcome;
  };
  try{
   const result=navigator.locks?
    await navigator.locks.request(BROWSER_BUDGET_KEY,commit):commit();
   setBudget(result.budget);setNow(Date.now());setError("");
   if(result.ok)return{ok:true,message:""};
   return{ok:false,message:"Local execution allowance used. Retry in "+
    remainingTimeLabel(result.retryAt,Date.now())+"."};
  }catch{
   setError("Execution allowance storage is unavailable or invalid.");
   return{ok:false,message:"Unable to verify local execution allowance. Enable browser site storage and reload."};
  }
 },[]);
 if(isDesktop()){
  const waitingForQuota=desktopBudget===null;
  const cooldown=!!desktopBudget&&desktopBudget.remaining===0&&desktopBudget.retryAt>now;
  const remaining=desktopBudget?.remaining===0&&desktopBudget.retryAt>0&&now>=desktopBudget.retryAt?
   BROWSER_EXECUTION_LIMIT:desktopBudget?.remaining??0;
  const status=desktopError||(
   waitingForQuota?"Checking paid online execution allowance…":
   cooldown?"Online execution allowance used · renews in "+remainingTimeLabel(desktopBudget!.retryAt,now):
   remaining+"/"+BROWSER_EXECUTION_LIMIT+" paid local-compute launches available · 5-hour cooldown after all credits"
  );
  return{reserve,waiting:waitingForQuota||!!desktopError||cooldown,status,remaining};
 }
 const server=remote!==null&&!networkFallback;
 const remoteWaiting=!!remote&&remote.retryAt>now&&remote.remaining===0;
 const localWaiting=budget.cooldownUntil>now;
 const waiting=server?remoteWaiting:localWaiting;
 const remaining=server?(remote!.retryAt>0&&now>=remote!.retryAt?BROWSER_EXECUTION_LIMIT:remote!.remaining):
  (localWaiting?0:budget.remaining);
 const prefix=server?"Network allowance":"Local browser allowance";
 const status=error||(
  waiting?`${prefix} used · renews in ${remainingTimeLabel(server?remote!.retryAt:budget.cooldownUntil,now)}`:
   `${remaining}/${BROWSER_EXECUTION_LIMIT} execution credits available · ${networkFallback?"browser-only fallback (network quota unavailable)":"5-hour cooldown after all credits"}`
 );
 return{reserve,waiting,status,remaining};
}
