"use strict";
const {describe,it}=require("node:test");
const assert=require("node:assert/strict");
const {LIMIT,COOLDOWN_MS,validEnvelope,allowedAccount,quotaNext}=require("../lib/compute-policy");
describe("Commercial D25 remote computation security contract",()=>{
 const now=Date.UTC(2026,10,15);
 it("denies non-paying, refunded, revoked and expired customers",()=>{
  const a={status:"active",paidThroughMs:now+1000};
  assert.equal(allowedAccount(a,now),true);
  for(const bad of [null,{...a,paidThroughMs:now},{...a,status:"refunded"},
    {...a,status:"revoked"},{...a,revokedAtMs:now}])
   assert.equal(allowedAccount(bad,now),false);
  assert.equal(allowedAccount(a,now,true),false);
 });
 it("allows exactly 20 server-side reservations and blocks 21st",()=>{
  let rec=null;
  for(let i=0;i<LIMIT;i++){
   const outcome=quotaNext(rec,now+i);
   assert.equal(outcome.ok,true);assert.equal(outcome.remaining,LIMIT-i-1);
   rec=outcome.record;
  }
  assert.equal(rec.resetAtMs,now+LIMIT-1+COOLDOWN_MS);
  assert.equal(quotaNext(rec,now+LIMIT).ok,false);
  assert.equal(quotaNext(rec,rec.resetAtMs-1).ok,false);
  const again=quotaNext(rec,rec.resetAtMs);
  assert.equal(again.ok,true);assert.equal(again.remaining,LIMIT-1);
 });
 it("fails closed on malformed counters",()=>{
  for(const bad of [{used:20,resetAtMs:0},{used:21,resetAtMs:4},
    {used:-1,resetAtMs:0},{used:2.5,resetAtMs:0},{}])
   assert.throws(()=>quotaNext(bad,now));
 });
 it("rejects injected schemas, non-UUID identifiers and extra keys",()=>{
  const good={schema:"D25-Compute-Request/v1",
   requestId:"e9eb5a82-9d5d-42f5-a15b-2c81a6f4332c",job:{kind:"circuit"}};
  assert.equal(validEnvelope(good),true);
  assert.equal(validEnvelope({...good,uid:"admin"}),false);
  assert.equal(validEnvelope({...good,requestId:"duplicate"}),false);
  assert.equal(validEnvelope({...good,schema:"v2"}),false);
 });
});