"use strict";
/**
 * D25 authenticated execution policy. Everything here runs on the server.
 * A desktop-only quota, browser flag, IP address, or license string cannot
 * authorize a compute operation.
 */
const LIMIT=20, COOLDOWN_MS=5*60*60*1000;
const SCHEMA="D25-Compute-Request/v1";
const UID=/^[A-Za-z0-9_-]{3,128}$/;
const REQUEST_ID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function allowedAccount(account,nowMs,disabled=false){
 return !disabled&&!!account&&typeof account==="object"&&
  Number.isSafeInteger(account.paidThroughMs)&&account.paidThroughMs>nowMs&&
  account.status!=="revoked"&&account.status!=="refunded"&&
  !account.revokedAtMs;
}
/** Reserve exactly one execution. Reset after the fifth hour, not rolling.
 * Returns an entirely new record; use only in an atomic Firestore transaction.
 */
function quotaNext(input,nowMs){
 if(!Number.isSafeInteger(nowMs)||nowMs<=0)throw Error("Bad clock");
 let used=0,resetAtMs=0;
 if(input!==null&&input!==undefined){
  if(typeof input!=="object"||!Number.isSafeInteger(input.used)||input.used<0||input.used>LIMIT||
     !Number.isSafeInteger(input.resetAtMs)||input.resetAtMs<0)
   throw Error("Corrupt quota record; deny until repaired.");
  used=input.used;resetAtMs=input.resetAtMs;
 }
 if(used===LIMIT&&resetAtMs===0)throw Error("Corrupt exhausted quota record.");
 // If the time hasn't elapsed the same window continues; only a new
 // window may issue more than 20 reservations.
 if(resetAtMs>0&&nowMs>=resetAtMs){used=0;resetAtMs=0;}
 if(used===LIMIT)return{ok:false,remaining:0,retryAtMs:resetAtMs,record:{used,resetAtMs}};
 const nextUsed=used+1;
 const nextReset=nextUsed===LIMIT?nowMs+COOLDOWN_MS:resetAtMs;
 return{ok:true,remaining:LIMIT-nextUsed,retryAtMs:nextReset,record:{used:nextUsed,resetAtMs:nextReset}};
}
function validEnvelope(body){
 if(!body||typeof body!=="object"||Array.isArray(body))return false;
 if(Object.keys(body).sort().join(",")!=="job,requestId,schema")return false;
 if(body.schema!==SCHEMA||typeof body.requestId!=="string"||
    !REQUEST_ID.test(body.requestId))return false;
 return !!body.job&&typeof body.job==="object"&&!Array.isArray(body.job);
}
function validUid(uid){return typeof uid==="string"&&UID.test(uid);}
module.exports={LIMIT,COOLDOWN_MS,SCHEMA,validEnvelope,validUid,allowedAccount,quotaNext};