"use strict";
/**
 * Protected D25 compute ingress. Server compiles the engine independently;
 * neither engine modules nor engine workers are shipped to the desktop.
 * No self-attested license, client address or local counter is ever accepted.
 */
const {getAuth}=require("firebase-admin/auth");
const {getFirestore}=require("firebase-admin/firestore");
const {randomUUID}=require("node:crypto");
const {allowedAccount,quotaNext,validEnvelope,LIMIT}=require("./lib/compute-policy");
const ACCOUNTS="d25Accounts",QUOTAS="d25ComputeQuota",REQUESTS="d25ComputeReservations";
function json(res,status,obj){
 res.set("Cache-Control","no-store, private");
 res.set("X-Content-Type-Options","nosniff");
 return res.status(status).json(obj);
}
function error(code,message){let e=new Error(message);e.httpStatus=code;return e;}
function cors(req,res){
 const origin=typeof req.headers.origin==="string"?req.headers.origin:"";
 const extra=(process.env.D25_COMPUTE_ALLOWED_ORIGINS||"").split(",").map(x=>x.trim()).filter(Boolean);
 const allowed=["http://tauri.localhost","https://tauri.localhost","tauri://localhost",...extra];
 if(origin&&!allowed.includes(origin))return false;
 if(origin){
  res.set("Access-Control-Allow-Origin",origin);
  res.set("Access-Control-Allow-Headers","Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods","POST, OPTIONS");
  res.set("Vary","Origin");
 }
 return true;
}
async function user(req){
 const raw=req.headers.authorization;
 if(typeof raw!=="string"||!/^Bearer [A-Za-z0-9._-]{100,6000}$/.test(raw))
  throw error(401,"Firebase login required.");
 let token;
 try{token=await getAuth().verifyIdToken(raw.slice(7),true);}
 catch{throw error(401,"Firebase session rejected.");}
 if(!token?.uid||token.email_verified!==true)throw error(403,"Verify your email first.");
 const current=await getAuth().getUser(token.uid);
 if(current.disabled||current.emailVerified!==true)throw error(403,"Account is not enabled and verified.");
 return {uid:token.uid};
}
function privateEngine(){
 // This file is generated on the Firebase *server deployment* only.
 // It is deliberately .gitignored and not shipped with any Windows installer.
 // If missing, deny execution rather than falling back to client code.
 try{return require("./private-engine.cjs");}
 catch{throw error(503,"Trusted compute engine is not deployed.");}
}
function httpHandler({onRequest,region="asia-south1"}){
 return onRequest({
  region,invoker:"public",timeoutSeconds:120,memory:"1GiB",
  concurrency:1,maxInstances:2
 },async(req,res)=>{
  if(!cors(req,res))return json(res,403,{error:"origin_not_allowed"});
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="POST")return json(res,405,{error:"method_not_allowed"});
  if(req.headers["content-type"]?.split(";")[0]?.trim()!=="application/json")
   return json(res,415,{error:"use_json"});
  if(Number(req.headers["content-length"]||0)>128*1024||
     !Buffer.isBuffer(req.rawBody)||req.rawBody.length>128*1024)
   return json(res,413,{error:"request_too_large"});
  try{
   const identity=await user(req);
   const body=req.body;
   if(!validEnvelope(body))throw error(400,"Unexpected request schema.");
   const engine=privateEngine();
   let prepared;
   try{prepared=engine.prepareIndustryJob(body.job);}
   catch(e){if(e?.name==="IndustryInputError")throw error(e.status||422,"Unsupported or over-budget quantum job.");throw e;}
   if(prepared.job.operation!=="execute")throw error(422,"This endpoint requires an execution job.");
   const db=getFirestore(),now=Date.now();
   const accountRef=db.collection(ACCOUNTS).doc(identity.uid);
   const quotaRef=db.collection(QUOTAS).doc(identity.uid);
   const requestRef=db.collection(REQUESTS).doc(identity.uid+"_"+body.requestId);
   const reservation=await db.runTransaction(async tx=>{
    const [acc,quota,request]=await Promise.all([
     tx.get(accountRef),tx.get(quotaRef),tx.get(requestRef)
    ]);
    if(request.exists)throw error(409,"Duplicate execution request ID.");
    if(!allowedAccount(acc.data(),now))throw error(403,"Active paid D25 subscription required.");
    const next=quotaNext(quota.exists?quota.data():null,now);
    if(!next.ok)return {ok:false,...next};
    tx.set(quotaRef,{...next.record,updatedAtMs:now});
    tx.create(requestRef,{
     uid:identity.uid,createdAtMs:now,jobId:prepared.job.jobId,
     jobDigest:prepared.digest,chargedCredits:1,state:"reserved"
    });
    return{ok:true,...next};
   });
   res.set("X-Compute-Limit",String(LIMIT));
   res.set("X-Compute-Remaining",String(reservation.remaining));
   if(!reservation.ok){
    res.set("Retry-After",String(Math.max(1,Math.ceil((reservation.retryAtMs-Date.now())/1000))));
    return json(res,429,{error:"execution_quota_exhausted",
     remaining:0,retryAtMs:reservation.retryAtMs});
   }
   // Metering happens before compute, on a durable per-UID transaction.
   // A failed or cancelled computation spends the reserved launch credit.
   let result;
   try{result=engine.executePreparedIndustryJob(prepared);}
   catch(e){
    await requestRef.update({state:"failed",finishedAtMs:Date.now()}).catch(()=>{});
    throw error(500,"The permitted simulation could not complete.");
   }
   await requestRef.update({state:"completed",finishedAtMs:Date.now()}).catch(()=>{});
   return json(res,200,{schema:"D25-Protected-Compute-Result/v1",
    remaining:reservation.remaining,resetAtMs:reservation.retryAtMs,result});
  }catch(e){
   const code=Number.isInteger(e?.httpStatus)?e.httpStatus:500;
   if(code===500)console.error("D25 protected compute failed",e?.name||"Error");
   return json(res,code,{error:code===500?"compute_service_unavailable":
    String(e.message).slice(0,140)});
  }
 });
}
module.exports={httpHandler};