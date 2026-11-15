"use strict";
/**
 * D25 Quantum Workspace: Firebase Auth + Firestore + Razorpay TEST subscriptions.
 * Dedicated Firebase project; HTTPS Cloud Functions. No client secrets.
 * Never grants a license for a mandate authentication or an uncaptured charge.
 * MAH Quantum is the parent company; Devashri S Industries is its division.
 */
const {onRequest}=require("firebase-functions/v2/https");
const {defineSecret}=require("firebase-functions/params");
const {initializeApp,getApps}=require("firebase-admin/app");
const {getAuth}=require("firebase-admin/auth");
const {getFirestore}=require("firebase-admin/firestore");
const {randomUUID}=require("node:crypto");
const {
 PRICE_PAISE,CURRENCY,MAX_CYCLES,verifyWebhook,verifyMonthlyPlan,
 isCapturedSubscriptionCharge,safePeriodEndSeconds,isEntitled
}=require("./lib/commerce-policy.js");
if(!getApps().length) initializeApp();
const database=getFirestore();
const KEY_ID=defineSecret("D25_RAZORPAY_TEST_KEY_ID");
const KEY_SECRET=defineSecret("D25_RAZORPAY_TEST_KEY_SECRET");
const HOOK_SECRET=defineSecret("D25_RAZORPAY_TEST_WEBHOOK_SECRET");
const REGION="asia-south1";
const secrets=[KEY_ID,KEY_SECRET,HOOK_SECRET];
const PLAN=()=>process.env.D25_RAZORPAY_PLAN_ID_TEST||"";
const NAME="D25 Quantum Workspace";
const ACCOUNT="d25Accounts";
const SUBS="d25Subscriptions";
const EVENT="d25WebhookEvents";
const CHARGE="d25Charges";
const MAX_BODY=4096;
const now=()=>Date.now();

function json(res,code,payload){
 res.set("Cache-Control","no-store, private");
 res.set("X-Content-Type-Options","nosniff");
 return res.status(code).json(payload);
}
function cors(req,res){
 const origin=typeof req.headers.origin==="string"?req.headers.origin:"";
 const external=(process.env.D25_ALLOWED_ORIGINS||"").split(",").map(x=>x.trim()).filter(Boolean);
 const approved=["http://tauri.localhost","https://tauri.localhost","tauri://localhost",...external];
 if(origin&&!approved.includes(origin))return false;
 if(origin){
  res.set("Access-Control-Allow-Origin",origin);
  res.set("Vary","Origin");
  res.set("Access-Control-Allow-Headers","Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods","GET, POST, OPTIONS");
  res.set("Access-Control-Max-Age","600");
 }
 return true;
}
function error(message,status=400){const e=new Error(message);e.httpStatus=status;return e;}
function providerCredentials(){
 const key=KEY_ID.value();
 const secret=KEY_SECRET.value();
 if(!key?.startsWith("rzp_test_")||!secret||secret.length<16)
  throw error("Razorpay TEST credentials are not configured.",503);
 return {key,secret};
}
async function razorpay(path,method="GET",body){
 const {key,secret}=providerCredentials();
 const response=await fetch("https://api.razorpay.com/v1/"+path,{
  method,
  headers:{"Authorization":"Basic "+Buffer.from(key+":"+secret).toString("base64"),
   "Accept":"application/json",...(body?{"Content-Type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),
  signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw error("Razorpay test API request was not accepted. Verify plan and account features.",502);
 return await response.json();
}
function isCheckoutUrl(value){
 if(typeof value!=="string"||value.length>500)return false;
 try{const u=new URL(value);return u.protocol==="https:"&&
  ["rzp.io","api.razorpay.com","razorpay.com"].includes(u.hostname);}
 catch{return false;}
}
async function requireVerifiedUser(req){
 const raw=req.headers.authorization;
 if(typeof raw!=="string"||!/^Bearer [A-Za-z0-9._-]{100,6000}$/.test(raw))
  throw error("Sign in with Firebase Authentication.",401);
 const claims=await getAuth().verifyIdToken(raw.slice(7));
 if(!claims.uid||!claims.email_verified)throw error("Verify your email address before subscribing.",403);
 return {uid:claims.uid,email:claims.email||""};
}
function responseAccount(user,doc){
 const account=doc||{};
 return {
  schema:"D25-Account-Subscription/v1",
  uid:user.uid,
  email:user.email,
  monthlyAmountPaise:PRICE_PAISE,
  currency:CURRENCY,
  maxCycles:MAX_CYCLES,
  plan:"₹500 per month, 12 monthly billing cycles, customer-cancellable",
  active:isEntitled(account,now()),
  paidThroughMs:Number.isFinite(account.paidThroughMs)?account.paidThroughMs:0,
  subscriptionStatus:account.status||"not_subscribed",
  cancellationRequested:!!account.cancellationRequestedAtMs,
  checkoutUrl:account.status==="pending"&&isCheckoutUrl(account.checkoutUrl)?account.checkoutUrl:null
 };
}
async function createSubscription(user){
 const plan=PLAN();
 if(!/^plan_[A-Za-z0-9]+$/.test(plan))throw error("Monthly Razorpay TEST plan is not configured.",503);
 const verified=await razorpay("plans/"+encodeURIComponent(plan));
 if(!verifyMonthlyPlan(verified,plan))throw error("Plan is not precisely ₹500 INR per month. Checkout blocked.",503);
 const ref=database.collection(ACCOUNT).doc(user.uid);
 const token=randomUUID(), at=now();
 const lease=await database.runTransaction(async tx=>{
  const snap=await tx.get(ref);
  const data=snap.data()||{};
  if(isEntitled(data,at))return {kind:"active"};
  if(data.status==="pending"&&isCheckoutUrl(data.checkoutUrl)&&
    at-(data.subscriptionCreatedAtMs||0)<30*86400000)
   return {kind:"pending",checkoutUrl:data.checkoutUrl};
  if(data.status==="creating"&&data.leaseUntilMs>at)
   return {kind:"busy"};
  // One checkout in progress at a time, even on multiple function instances.
  tx.set(ref,{
   uid:user.uid,email:user.email,sku:"d25-monthly-user-v1",
   status:"creating",leaseToken:token,leaseUntilMs:at+90000,
   lastCheckoutAttemptMs:at,paidThroughMs:Math.max(0,data.paidThroughMs||0),
   createdAtMs:data.createdAtMs||at,cancellationRequestedAtMs:null,
   provider:"razorpay-test"
  },{merge:true});
  return {kind:"reserved"};
 });
 if(lease.kind==="active")throw error("Account already has an active paid subscription.",409);
 if(lease.kind==="busy")throw error("A checkout is already being prepared. Retry shortly.",409);
 if(lease.kind==="pending")return {checkoutUrl:lease.checkoutUrl,existing:true};
 let remote;
 try{
  remote=await razorpay("subscriptions","POST",{
   plan_id:plan,total_count:MAX_CYCLES,quantity:1,customer_notify:true,
   notes:{d25_uid:user.uid,sku:"d25-monthly-user-v1"}
  });
  if(!/^sub_[A-Za-z0-9]+$/.test(remote?.id||"")||
    remote.plan_id!==plan||!isCheckoutUrl(remote.short_url))
   throw error("Razorpay did not return a validated subscription payment link.",502);
  await database.runTransaction(async tx=>{
   const existing=await tx.get(ref);
   if(existing.data()?.leaseToken!==token)throw error("Checkout lease expired. Contact support.",409);
   const linked=database.collection(SUBS).doc(remote.id);
   const seen=await tx.get(linked);
   if(seen.exists)throw error("Subscription ID collision; checkout halted.",409);
   tx.create(linked,{uid:user.uid,subscriptionId:remote.id,planId:plan,
    createdAtMs:now(),status:"pending",provider:"razorpay-test"});
   tx.set(ref,{subscriptionId:remote.id,checkoutUrl:remote.short_url,
    status:"pending",subscriptionCreatedAtMs:now(),leaseToken:null,leaseUntilMs:0},
    {merge:true});
  });
  return{checkoutUrl:remote.short_url,existing:false};
 }catch(e){
  await database.runTransaction(async tx=>{
   const s=await tx.get(ref);
   if(s.data()?.leaseToken===token)
    tx.set(ref,{status:"not_subscribed",leaseToken:null,leaseUntilMs:0},{merge:true});
  }).catch(()=>{});
  // If remote created but DB failed there may be an unactivated orphan; review
  // Razorpay test subscriptions before retrying. Never silently grant access.
  throw e;
 }
}
async function cancelSubscription(user){
 const ref=database.collection(ACCOUNT).doc(user.uid);
 const snap=await ref.get();
 const state=snap.data();
 if(!/^sub_[A-Za-z0-9]+$/.test(state?.subscriptionId||""))
  throw error("No managed subscription found.",404);
 if(state.cancellationRequestedAtMs)
  return{scheduled:true,paidThroughMs:state.paidThroughMs||0};
 const remote=await razorpay("subscriptions/"+encodeURIComponent(state.subscriptionId)+"/cancel","POST",
  {cancel_at_cycle_end:true});
 if(!remote||remote.id!==state.subscriptionId)
  throw error("Cancellation could not be confirmed by Razorpay.",502);
 await database.runTransaction(async tx=>{
  const latest=await tx.get(ref);
  if(latest.data()?.subscriptionId===state.subscriptionId)
   tx.set(ref,{cancellationRequestedAtMs:now(),status:"cancel_requested"},{merge:true});
 });
 return{scheduled:true,paidThroughMs:state.paidThroughMs||0};
}
exports.d25Api=onRequest({
 region:REGION,secrets,timeoutSeconds:45,maxInstances:15,invoker:"public"
},async(req,res)=>{
 if(!cors(req,res))return json(res,403,{error:"origin_not_allowed"});
 if(req.method==="OPTIONS")return res.status(204).end();
 const route=req.path.replace(/\/$/,"").split("/").pop();
 if(!((route==="status"&&req.method==="GET")||
      (["start","cancel"].includes(route)&&req.method==="POST")))
  return json(res,405,{error:"unsupported_route"});
 if(req.method==="POST"&&
    (Number(req.headers["content-length"]||0)>MAX_BODY||
     req.headers["content-type"]?.split(";")[0]?.trim()!=="application/json"))
  return json(res,415,{error:"unsupported_request"});
 try{
  const user=await requireVerifiedUser(req);
  if(route==="status"){
   const doc=await database.collection(ACCOUNT).doc(user.uid).get();
   return json(res,200,responseAccount(user,doc.data()));
  }
  if(route==="start"){
   if(req.body?.confirmRecurring!==true||
      req.body?.pricePaise!==PRICE_PAISE||
      req.body?.termsVersion!=="d25-monthly-v1")
    throw error("Confirm ₹500/month recurring billing and 12-cycle limit before checkout.",400);
   return json(res,200,{schema:"D25-Checkout-Link/v1",...(await createSubscription(user))});
  }
  if(route==="cancel")return json(res,200,{schema:"D25-Cancellation/v1",...(await cancelSubscription(user))});
 }catch(e){
  const status=Number.isInteger(e?.httpStatus)?e.httpStatus:500;
  if(status===500)console.error("D25 billing server internal operation failed",e?.name||"unknown");
  return json(res,status,{error:status===500?"internal_error":String(e.message).slice(0,180)});
 }
});
/** Razorpay calls this URL directly; NEVER use client-side redirects to unlock. */
exports.d25RazorpayWebhook=onRequest({
 region:REGION,secrets:[HOOK_SECRET],timeoutSeconds:45,maxInstances:15,invoker:"public"
},async(req,res)=>{
 if(req.method!=="POST")return json(res,405,{error:"method_not_allowed"});
 const signature=req.headers["x-razorpay-signature"];
 const eventId=req.headers["x-razorpay-event-id"];
 const raw=req.rawBody;
 if(!verifyWebhook(raw,signature,HOOK_SECRET.value()))
  return json(res,401,{error:"invalid_signature"});
 if(typeof eventId!=="string"||!/^evt_[A-Za-z0-9]+$/.test(eventId))
  return json(res,400,{error:"invalid_event_id"});
 let input;
 try{input=JSON.parse(raw.toString("utf8"));}
 catch{return json(res,400,{error:"invalid_json"});}
 const event=input?.event;
 const tracked=["subscription.charged","subscription.pending","subscription.halted",
  "subscription.cancelled","subscription.paused","subscription.completed",
  "payment.refunded"];
 if(!tracked.includes(event))return json(res,200,{received:true,ignored:true});
 const payment=input?.payload?.payment?.entity||null;
 const subscription=input?.payload?.subscription?.entity||null;
 const subId=subscription?.id;
 try{
  const eventRef=database.collection(EVENT).doc(eventId);
  // Refunded payments may have no subscription entity in the webhook.
  if(event==="payment.refunded"){
   const paymentId=payment?.id;
   if(!/^pay_[A-Za-z0-9]+$/.test(paymentId||""))return json(res,400,{error:"payment_id_missing"});
   const chargeRef=database.collection(CHARGE).doc(paymentId);
   const saved=await chargeRef.get();
   if(!saved.exists)return json(res,200,{received:true,ignored:true});
   const charged=saved.data();
   const accountRef=database.collection(ACCOUNT).doc(charged.uid);
   await database.runTransaction(async tx=>{
    const [evt,acc]=await Promise.all([tx.get(eventRef),tx.get(accountRef)]);
    if(evt.exists)return;
    tx.create(eventRef,{event,processedAtMs:now(),subscriptionId:charged.subscriptionId});
    if(acc.data()?.lastPaidPaymentId===paymentId&&
      acc.data()?.subscriptionId===charged.subscriptionId)
     tx.set(accountRef,{status:"refunded",paidThroughMs:0,updatedAtMs:now()},{merge:true});
   });
   return json(res,200,{received:true});
  }
  if(!/^sub_[A-Za-z0-9]+$/.test(subId||""))
   return json(res,400,{error:"subscription_id_missing"});
  // Never trust UID submitted in webhook notes to assign an entitlement.
  const subRef=database.collection(SUBS).doc(subId);
  const mapping=await subRef.get();
  if(!mapping.exists)return json(res,503,{error:"subscription_mapping_not_ready"});
  const owner=mapping.data();
  if(subscription.plan_id!==owner.planId)
   return json(res,422,{error:"unexpected_plan"});
  const accRef=database.collection(ACCOUNT).doc(owner.uid);
  if(event==="subscription.charged"){
   // Razorpay's signed subscription.charged event includes both entities.
   // Some documented payment objects omit subscription_id: if present check it.
   if(!isCapturedSubscriptionCharge(payment,subId)||
      subscription.status!=="active")
    return json(res,422,{error:"charge_not_eligible"});
   const paidEnd=safePeriodEndSeconds(subscription,now());
   if(!paidEnd)return json(res,503,{error:"paid_period_unavailable"});
   const chargeRef=database.collection(CHARGE).doc(payment.id);
   await database.runTransaction(async tx=>{
    const [evt,charged,acc]=await Promise.all([
     tx.get(eventRef),tx.get(chargeRef),tx.get(accRef)
    ]);
    if(evt.exists)return;
    tx.create(eventRef,{event,processedAtMs:now(),subscriptionId:subId,paymentId:payment.id});
    if(charged.exists)return; // separate business-key idempotency
    if(acc.data()?.subscriptionId!==subId)return; // stale subscription event
    tx.create(chargeRef,{uid:owner.uid,subscriptionId:subId,paymentId:payment.id,
     amountPaise:PRICE_PAISE,currency:CURRENCY,paidThroughMs:paidEnd*1000,receivedAtMs:now()});
    tx.set(accRef,{status:"active",paidThroughMs:Math.max(
     acc.data()?.paidThroughMs||0,paidEnd*1000),lastPaidPaymentId:payment.id,
     lastPaidAtMs:now(),updatedAtMs:now()},{merge:true});
    tx.set(subRef,{status:"active",paidThroughMs:paidEnd*1000},{merge:true});
   });
   return json(res,200,{received:true});
  }
  await database.runTransaction(async tx=>{
   const [evt,acc]=await Promise.all([tx.get(eventRef),tx.get(accRef)]);
   if(evt.exists)return;
   tx.create(eventRef,{event,subscriptionId:subId,processedAtMs:now()});
   if(acc.data()?.subscriptionId!==subId)return;
   // A webhook status alone cannot extend or revoke a prepaid paid month.
   tx.set(accRef,{status:event.replace("subscription.",""),updatedAtMs:now()},{merge:true});
   tx.set(subRef,{status:event.replace("subscription.","")},{merge:true});
  });
  return json(res,200,{received:true});
 }catch(e){
  console.error("D25 verified webhook transaction failed",e?.name||"unknown");
  return json(res,503,{error:"retry_later"});
 }
});
