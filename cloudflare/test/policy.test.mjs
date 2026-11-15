import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {
 MONTHLY_PAISE,validPlan,validCapturedCharge,periodEndMs,activeAccount,
 validateStart,checkoutDecision,quotaStatements,UUID,subscriptionState,ownerAuthorized
} from "../src/policy.mjs";
import {validWebhook,razorpayMode,razorpayEnabled,razorpayCredentialsReady,paymentConfig} from "../src/razorpay.mjs";
describe("D25 Cloudflare ₹500/month license rules",()=>{
 const now=Date.UTC(2026,10,15,12);
 it("requires a real ₹500 one-month Razorpay plan",()=>{
  const plan={id:"plan_AaBb12",period:"monthly",interval:1,item:{amount:50000,currency:"INR"}};
  assert.equal(MONTHLY_PAISE,50000);
  assert.equal(validPlan(plan,plan.id),true);
  for(const mutation of [{period:"yearly"},{interval:2},{item:{amount:50001,currency:"INR"}},
   {item:{amount:50000,currency:"USD"}}])assert.equal(validPlan({...plan,...mutation},plan.id),false);
 });
 it("rejects checkout without an explicit monthly purchase confirmation",()=>{
  const req={confirmRecurring:true,pricePaise:50000,termsVersion:"d25-monthly-v1"};
  assert.equal(validateStart(req),true);
  assert.equal(validateStart({...req,pricePaise:0}),false);
  assert.equal(validateStart({...req,confirmRecurring:false}),false);
  assert.equal(validateStart({...req,role:"admin"}),false);
 });
 it("does not grant access for unpaid/refunded/disabled/revoked accounts",()=>{
  const ok={uid:"user_abc",status:"active",paid_until_ms:now+86400000};
  assert.equal(activeAccount(ok,now),true);
  for(const bad of [{...ok,paid_until_ms:now},{...ok,revoked:1},
   {...ok,disabled:1},{...ok,refunded:1},{...ok,requires_review:1},
   {...ok,status:"revoked"}])assert.equal(activeAccount(bad,now),false);
  assert.equal(subscriptionState({...ok,status:"pending"},now).active,true); // retain verified paid month
 });
 it("requires captured INR charge and a bounded billing cycle",()=>{
  const paid={id:"pay_Xy1234",subscription_id:"sub_ABC123",status:"captured",
   amount:50000,currency:"INR"};
  assert.equal(validCapturedCharge(paid,"sub_ABC123"),true);
  assert.equal(validCapturedCharge({...paid,status:"authorized"},"sub_ABC123"),false);
  assert.equal(validCapturedCharge({...paid,amount:10},"sub_ABC123"),false);
  assert.equal(validCapturedCharge({...paid,currency:"USD"},"sub_ABC123"),false);
  assert.equal(validCapturedCharge({...paid,subscription_id:"sub_other"},"sub_ABC123"),false);
  assert.equal(periodEndMs({current_end:Math.floor((now+30*86400000)/1000)},now)>0,true);
  assert.equal(periodEndMs({current_end:Math.floor((now+100*86400000)/1000)},now),0);
 });
 it("fails closed on checkout timeouts and ambiguous provider creation",()=>{
  assert.equal(checkoutDecision({status:"creating",lease_until_ms:now-1000},now),"review");
  assert.equal(checkoutDecision({status:"manual_review",requires_review:1},now),"review");
  assert.equal(checkoutDecision({status:"creating",lease_until_ms:now+1000},now),"busy");
  assert.equal(checkoutDecision(null,now),"start");
  assert.equal(checkoutDecision({status:"active",paid_until_ms:now+1000},now),"active");
 });
 it("uses D1 atomic batch quota with UUID deduplication and user/entitlement SQL guards",()=>{
  const statements=[];
  const db={prepare(sql){const entry={sql,bind(...params){this.params=params;return this;}};statements.push(entry);return entry;}};
  const requestId="fd436d1c-6762-4fca-84e8-6354ae9eb064";
  assert.equal(UUID.test(requestId),true);
  const result=quotaStatements(db,{uid:"user_abc",requestId,now});
  assert.equal(result.length,2);
  assert.match(result[0].sql,/ON CONFLICT\(uid\) DO UPDATE/);
  assert.match(result[0].sql,/paid_until_ms>\?/);
  assert.match(result[1].sql,/INSERT INTO d25_reservations/);
  assert.equal(result[1].params[0],requestId);
  assert.throws(()=>quotaStatements(db,{uid:"user_abc",requestId:"bad",now}));
 });
 it("exempts exactly one verified Google-owner UID without a payment record",()=>{
  const user={uid:"admin_UID_123",email:"nirooph1@gmail.com",google:true,emailVerified:true};
  const account={uid:user.uid,status:"not_subscribed",paid_until_ms:0,disabled:0,revoked:0,requires_review:0};
  const env={D25_OWNER_GOOGLE_UID:user.uid,D25_OWNER_GOOGLE_EMAIL:user.email};
  assert.equal(ownerAuthorized(user,env,account),true);
  assert.equal(subscriptionState(account,now,{owner:true}).active,true);
  assert.equal(subscriptionState(account,now,{owner:true}).ownerAccess,true);
  assert.equal(subscriptionState(account,now,{owner:false}).active,false);
  for(const bad of [
   {...user,google:false},{...user,uid:"another_UID"},
   {...user,email:"another@example.com"},{...user,emailVerified:false}
  ])assert.equal(ownerAuthorized(bad,env,account),false);
  assert.equal(ownerAuthorized(user,{...env,D25_OWNER_GOOGLE_UID:""},account),false);
  assert.equal(ownerAuthorized(user,{...env,D25_OWNER_GOOGLE_EMAIL:""},account),false);
  assert.equal(ownerAuthorized(user,env,{...account,disabled:1}),false);
  assert.equal(ownerAuthorized(user,env,{...account,revoked:1}),false);
 });
 it("rejects LIVE checkout without separate live secrets and explicit merchant consent",()=>{
  const env={D25_BILLING_MODE:"live",D25_ENABLE_LIVE_CHECKOUT:"true",
   RAZORPAY_LIVE_KEY_ID:"rzp_live_abc123",
   RAZORPAY_LIVE_KEY_SECRET:"testing-public-fixture-never-real",
   RAZORPAY_LIVE_WEBHOOK_SECRET:"testing-public-webhook-fixture-123",
   RAZORPAY_LIVE_PLAN_ID:"plan_AaBb1234"};
  assert.equal(razorpayMode(env),"live");
  assert.equal(paymentConfig(env).mode,"live");
  assert.equal(razorpayCredentialsReady(env),true);
  assert.equal(razorpayEnabled(env),false);
  assert.equal(razorpayEnabled({...env,D25_CONFIRMED_LIVE_CHARGING:"I_CONFIRM_REAL_RECURRING_CHARGES"}),true);
  assert.equal(razorpayEnabled({...env,D25_CONFIRMED_LIVE_CHARGING:"I_CONFIRM_REAL_RECURRING_CHARGES",
   RAZORPAY_LIVE_KEY_ID:"rzp_test_abc123"}),false);
 });
 it("lets subscriptions be cancelled even when new checkouts are disabled",()=>{
  const env={D25_BILLING_MODE:"test",D25_ENABLE_TEST_CHECKOUT:"false",
   RAZORPAY_TEST_KEY_ID:"rzp_test_abc123",
   RAZORPAY_TEST_KEY_SECRET:"testing-public-fixture-never-real",
   RAZORPAY_TEST_WEBHOOK_SECRET:"testing-public-webhook-fixture-123",
   RAZORPAY_TEST_PLAN_ID:"plan_AaBb1234"};
  assert.equal(razorpayCredentialsReady(env),true);
  assert.equal(razorpayEnabled(env),false);
  assert.equal(razorpayEnabled({...env,D25_ENABLE_TEST_CHECKOUT:"true"}),true);
 });
 it("verifies webhook signature on exact raw bytes",async()=>{
  const secret="not-a-real-razorpay-test-webhook-secret-123";
  const message=new TextEncoder().encode('{"event":"subscription.charged"}');
  const sig=createHmac("sha256",secret).update(message).digest("hex");
  const env={RAZORPAY_TEST_WEBHOOK_SECRET:secret,RAZORPAY_TEST_PLAN_ID:"plan_AaBb1234"};
  assert.equal(await validWebhook(message,sig,env),true);
  assert.equal(await validWebhook(new TextEncoder().encode('{"event":"subscription.charged"} '),sig,env),false);
  assert.equal(await validWebhook(message,"1".repeat(64),env),false);
 });
});
