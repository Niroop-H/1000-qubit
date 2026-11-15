import {type ChangeEvent,useState} from "react";
import {refreshSession} from "../auth/d25Firebase";
const endpoint=String(import.meta.env.VITE_D25_COMPUTE_API_BASE??"").trim();
const isValidEndpoint=()=>/^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9_-]+$/.test(endpoint);
type JobResult={schema:string;remaining:number;resetAtMs:number;
 result:{status:string;elapsedMs:number;
  analysis?:{logicalQubits?:number;method?:string;limitations?:string};
  samples?:{completedShots:number;counts:Record<string,number>;frequencies?:Record<string,number>};
  result?:{classical?:{optimum?:number};[key:string]:unknown}}};
const CIRCUITS={
 bell:"OPENQASM 2.0;\nqreg q[2];\ncreg c[2];\nh q[0];\ncx q[0],q[1];"
};
const OPTIMIZATION=JSON.stringify({
 name:"Synthetic three-node operations graph",
 nodes:["A","B","C"],
 edges:[{source:0,target:1,weight:2},{source:1,target:2,weight:3}]
},null,2);
const safeRecord=(x:unknown):x is Record<string,number>=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&
 Object.keys(x).length<=4096&&Object.values(x).every(n=>typeof n==="number"&&Number.isFinite(n));
export default function ProtectedWorkbench(){
 const [mode,setMode]=useState<"circuit"|"optimization">("circuit");
 const [source,setSource]=useState(CIRCUITS.bell);
 const [graph,setGraph]=useState(OPTIMIZATION);
 const [shots,setShots]=useState(64);
 const [seed,setSeed]=useState(2026);
 const [busy,setBusy]=useState(false);
 const [result,setResult]=useState<JobResult|null>(null);
 const [error,setError]=useState("");
 const [quota,setQuota]=useState<{remaining:number;resetAtMs:number}|null>(null);
 const [lastJob,setLastJob]=useState("");
 async function execute(){
  if(busy)return;
  setError("");setResult(null);
  if(!isValidEndpoint()){setError("MAH Quantum protected compute service has not been configured. Execution is disabled.");return;}
  if(!Number.isInteger(shots)||shots<1||shots>(mode==="circuit"?256:1024)||
   (mode==="optimization"&&shots<128)||!Number.isInteger(seed)||seed<0||seed>4294967295){
   setError("Select a supported integer shot count and seed.");return;
  }
  let job;
  try{
   if(mode==="circuit"){
    if(new TextEncoder().encode(source).length>100*1024)throw Error("Circuit source exceeds 100 KiB.");
    job={schema:"MAH-Quantum-Industry-Job/v1",jobId:"d25-"+crypto.randomUUID(),
     kind:"circuit",operation:"execute",source,shots,seed};
   }else{
    if(new TextEncoder().encode(graph).length>48*1024)throw Error("Graph exceeds 48 KiB.");
    job={schema:"MAH-Quantum-Industry-Job/v1",jobId:"d25-"+crypto.randomUUID(),
     kind:"optimization",operation:"execute",graph:JSON.parse(graph),shots,seed};
   }
  }catch(e){setError(e instanceof Error?e.message:"Invalid job.");return;}
  setBusy(true);
  try{
   const user=await refreshSession();
   if(!user?.emailVerified)throw Error("A verified Firebase session is required.");
   const request={schema:"D25-Compute-Request/v1",requestId:crypto.randomUUID(),job};
   const response=await fetch(endpoint,{
    method:"POST",headers:{"Authorization":"Bearer "+user.idToken,
     "Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify(request),cache:"no-store",signal:AbortSignal.timeout(125000)
   });
   const data=await response.json().catch(()=>null);
   if(response.status===429){
    setQuota({remaining:0,resetAtMs:Number(data?.retryAtMs||0)});
    throw Error("The 20-launch allowance is exhausted. Five-hour cooldown applies.");
   }
   if(response.status===403)throw Error("An active paid subscription is required for protected computing.");
   if(!response.ok)throw Error("Secure compute server rejected the request ("+response.status+"). "+
    (typeof data?.error==="string"?data.error:"Try later."));
   if(data?.schema!=="D25-Protected-Compute-Result/v1"||
       data?.result?.schema!=="MAH-Quantum-Industry-Result/v1"||
       typeof data?.result?.status!=="string")
    throw Error("Unexpected server result schema. No result will be displayed.");
   setQuota({remaining:data.remaining,resetAtMs:data.resetAtMs});
   setResult(data);setLastJob(job.jobId);
  }catch(e){setError(e instanceof Error?e.message:"Protected execution unavailable.");}
  finally{setBusy(false);}
 }
 function download(){
  if(!result)return;
  const blob=new Blob([JSON.stringify({schema:result.schema,jobId:lastJob,serverResult:result.result},null,2)],
   {type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="d25-protected-result.json";a.click();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
 }
 const counts=safeRecord(result?.result?.samples?.counts)?result!.result.samples!.counts:{};
 const entries=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,40);
 const max=Math.max(1,...entries.map(x=>x[1]));
 return <div className="d25-secure">
  <header className="d25-secure-header">
   <div><p className="d25-overline">DEVASHRI S INDUSTRIES · A DIVISION OF MAH QUANTUM</p>
    <h1>D25 <span>Quantum Workspace</span></h1>
    <p>Authenticated scientific execution · Confidential solver runs on MAH Quantum infrastructure</p></div>
   <div className="d25-service-status">{isValidEndpoint()?"PROTECTED SERVER MODE":"SERVER NOT CONFIGURED"}</div>
  </header>
  <div className="d25-secure-layout">
   <section className="d25-secure-card">
    <h2>Scientific compute</h2>
    <p className="d25-secure-description">Supported ideal classical simulation families only; this is not unrestricted universal quantum computation or physical hardware control.</p>
    <div className="d25-secure-tabs">
     <button aria-pressed={mode==="circuit"} onClick={()=>{setMode("circuit");setShots(64);setResult(null);}}>Quantum circuit</button>
     <button aria-pressed={mode==="optimization"} onClick={()=>{setMode("optimization");setShots(256);setResult(null);}}>MaxCut QAOA</button>
    </div>
    {mode==="circuit"?<>
     <label htmlFor="d25-qasm">OpenQASM 2.0 / supported subset</label>
     <textarea id="d25-qasm" spellCheck={false} rows={15} maxLength={100000}
      value={source} onChange={(e:ChangeEvent<HTMLTextAreaElement>)=>setSource(e.target.value)}/>
     <div className="d25-samples">
      <button onClick={()=>setSource(CIRCUITS.bell)}>Bell state · 2 qubits</button>
      <button onClick={()=>setSource("OPENQASM 2.0;\nqreg q[1000];\ncreg c[1000];\nh q[0];\n")}>
       1,000-qubit separable reference</button>
     </div>
    </>:<>
     <label htmlFor="d25-graph">Weighted MaxCut model · JSON</label>
     <textarea id="d25-graph" spellCheck={false} rows={15} maxLength={48000}
      value={graph} onChange={e=>setGraph(e.target.value)}/>
    </>}
    <div className="d25-secure-controls">
     <label>Shots <input inputMode="numeric" type="number" min={mode==="circuit"?1:128}
      max={mode==="circuit"?256:1024} value={shots} onChange={e=>setShots(Number(e.target.value))}/></label>
     <label>Seed <input inputMode="numeric" type="number" min="0" max="4294967295"
      value={seed} onChange={e=>setSeed(Number(e.target.value))}/></label>
    </div>
    <button className="d25-execute" disabled={busy||!isValidEndpoint()} onClick={()=>void execute()}>
     {busy?"Executing on protected compute…":"Execute on MAH Quantum servers"}
    </button>
    <p className="d25-quota">
     {quota?"Remaining execution launches: "+quota.remaining+" / 20":
      "20 server-enforced execution launches; five-hour cooldown after exhaustion."}
     {quota?.resetAtMs&&quota.remaining===0?" Renew after "+new Date(quota.resetAtMs).toLocaleString():""}
    </p>
    {error&&<p role="alert" className="d25-secure-error">{error}</p>}
   </section>
   <section className="d25-secure-card d25-results">
    <h2>Verified result</h2>
    {!result&&<p className="d25-secure-description">No computation has completed in this session. Results appear only after a server-authorized execution.</p>}
    {result&&<>
     <div className="d25-result-metadata">
      <p><strong>{result.result.status}</strong> · Job {lastJob}</p>
      <p>Backend: {result.result.analysis?.method||"bounded MaxCut"} · {result.result.elapsedMs?.toFixed(2)} ms</p>
      {Number.isInteger(result.result.analysis?.logicalQubits)&&
       <p>Logical qubits: {result.result.analysis!.logicalQubits}</p>}
     </div>
     {entries.length>0&&<div className="d25-histogram" aria-label="Measured bitstring counts">
      {entries.map(([key,value])=><div className="d25-histogram-line" key={key}>
       <span>{key.length>25?key.slice(0,12)+"…"+key.slice(-10):key}</span>
       <div><b style={{width:(value/max*100)+"%"}} /></div><strong>{value}</strong>
      </div>)}
     </div>}
     {result.result.result&&<pre className="d25-secure-json">{JSON.stringify(result.result.result,null,2)}</pre>}
     {result.result.analysis?.limitations&&<p className="d25-secure-description">{result.result.analysis.limitations}</p>}
     <button onClick={download}>Export JSON result</button>
    </>}
   </section>
  </div>
  <footer>© 2026 MAH Quantum · D25 Quantum Workspace by Devashri S Industries, a division of MAH Quantum</footer>
 </div>;
}
