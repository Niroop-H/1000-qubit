const {describe,it}=require("node:test");
const assert=require("node:assert/strict");
const {createHmac}=require("node:crypto");
const p=require("../lib/commerce-policy.js");
describe("D25 monthly recurring test commerce security rules",()=>{
 it("locks ambiguous provider creation after lease timeout, preventing a second mandate",()=>{
  const now=Date.UTC(2026,10,15);
  assert.equal(p.checkoutLeaseGuard(null,now),"open");
  assert.equal(p.checkoutLeaseGuard({status:"not_subscribed"},now),"open");
  assert.equal(p.checkoutLeaseGuard({status:"creating",leaseUntilMs:now+1000},now),"busy");
  assert.equal(p.checkoutLeaseGuard({status:"creating",leaseUntilMs:now},now),"review");
  assert.equal(p.checkoutLeaseGuard({status:"creating",leaseUntilMs:now-1000},now),"review");
  assert.equal(p.checkoutLeaseGuard({status:"creating"},now),"review");
  assert.equal(p.checkoutLeaseGuard({status:"manual_review",requiresManualReconciliation:true},now),"review");
  assert.equal(p.checkoutLeaseGuard({status:"not_subscribed",requiresManualReconciliation:false},now),"open");
 });
 it("requires a real 500 INR per-month plan",()=>{
  const plan={id:"plan_AbC12345678901",period:"monthly",interval:1,item:{amount:50000,currency:"INR"}};
  assert.equal(p.verifyMonthlyPlan(plan,plan.id),true);
  for(const change of [
   {period:"weekly"},{interval:2},{item:{amount:1,currency:"INR"}},
   {item:{amount:50000,currency:"USD"}}
  ])assert.equal(p.verifyMonthlyPlan({...plan,...change},plan.id),false);
 });
 it("checks Razorpay webhook raw bytes and secret",()=>{
  const raw=Buffer.from('{"event":"subscription.charged"}');
  const key="unit-test-secret-razorpay-not-a-real-key";
  const sig=createHmac("sha256",key).update(raw).digest("hex");
  assert.equal(p.verifyWebhook(raw,sig,key),true);
  assert.equal(p.verifyWebhook(Buffer.from(raw.toString()+" "),sig,key),false);
  assert.equal(p.verifyWebhook(raw,"abcd",key),false);
 });
 it("only permits matching captured 500 INR subscription payments",()=>{
  const paid={id:"pay_123456789",subscription_id:"sub_123456789",status:"captured",amount:50000,currency:"INR"};
  assert.equal(p.isCapturedSubscriptionCharge(paid,"sub_123456789"),true);
  const withoutSubscriptionField={...paid};delete withoutSubscriptionField.subscription_id;
  assert.equal(p.isCapturedSubscriptionCharge(withoutSubscriptionField,"sub_123456789"),true);
  for(const change of [{status:"authorized"},{status:"refunded"},{amount:100},{currency:"USD"},{subscription_id:"sub_other"}])
   assert.equal(p.isCapturedSubscriptionCharge({...paid,...change},"sub_123456789"),false);
 });
 it("requires a valid current month rather than mere mandate authorization",()=>{
  const now=Date.UTC(2026,10,15);
  assert.equal(p.safePeriodEndSeconds({current_end:Math.floor((now+30*86400000)/1000)},now)>0,true);
  for(const bad of [0,Math.floor((now-1000)/1000),Math.floor((now+50*86400000)/1000)])
   assert.equal(p.safePeriodEndSeconds({current_end:bad},now),0);
  assert.equal(p.isEntitled({status:"active",paidThroughMs:now+1000},now),true);
  assert.equal(p.isEntitled({status:"pending",paidThroughMs:0},now),false);
  assert.equal(p.isEntitled({status:"refunded",paidThroughMs:now+1000},now),false);
  assert.equal(p.isEntitled({status:"cancelled",paidThroughMs:now+1000},now),true);
  assert.equal(p.isEntitled({status:"active",paidThroughMs:now+1000,revokedAtMs:now},now),false);
 });
});
