/**
 * MAH Quantum / Devashri S Industries — ₹500/month D25 license Worker.
 * Quantum execution stays LOCAL on the customer's Windows PC.
 * This Worker holds only authentication, Razorpay TEST recurring payments,
 * subscription entitlements, administrative controls and execution quotas.
 * No customer circuit source, amplitudes, result vectors or plaintext passwords.
 */
import {
 MONTHLY_PAISE,BILLING_CYCLES,LIMIT,COOLDOWN_MS,UUID,validUid,
 validProviderId,validCapturedCharge,validCheckoutUrl,validateStart,
 periodEndMs,activeAccount,subscriptionState,checkoutDecision,quotaStatements
} from "./policy.mjs";
import {firebaseIdentity} from "./auth.mjs";
import {
 razorpayEnabled,razorpay,newTestSubscription,fetchTestSubscription,
 cancelTestSubscription,validWebhook
} from "./razorpay.mjs";

const DB_ERRORS=new Set(["D1_ERROR","SQLITE_ERROR"]);
function fail(status,code){const e=new Error(code);e.status=status;return e;}
function json(status,data,origin="",headers={}){
 return new Response(JSON.stringify(data),{
  status,headers:{"Content-Type":"application/json; charset=utf-8",
   "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
   ...(origin?{"Access-Control-Allow-Origin":origin,"Vary":"Origin"}:{}),...headers}
 });
}
function originAllowed(request,env){
 const origin=request.headers.get("Origin")||"";
 const configured=String(env.D25_ALLOWED_ORIGINS||"").split(",").map(s=>s.trim()).filter(Boolean);
 if(origin&&!["http://tauri.localhost","https://tauri.localhost","tauri://localhost",...configured].includes(origin))
  throw fail(403,"origin_not_allowed");
 return origin;
}
function resourceStatus(env){
 return {schema:"D25-License-Health/v1",mode:"test",
  quantumCompute:"customer-local",firebaseProjectConfigured:!!env.FIREBASE_PROJECT_ID,
  storageConfigured:!!env.DB,testSubscriptionsEnabled:razorpayEnabled(env)};
}
async function jsonBody(req,maxBytes=2048){
 if(req.headers.get("Content-Type")?.split(";")[0]?.trim()!=="application/json")throw fail(415,"content_type_must_be_json");
 const str=await req.text();
 if(new TextEncoder().encode(str).length>maxBytes)throw fail(413,"request_too_large");
 try{const data=JSON.parse(str);if(!data||typeof data!=="object"||Array.isArray(data))throw 0;return data;}
 catch{throw fail(400,"invalid_json");}
}
async function identity(req,env){
 const user=await firebaseIdentity(req,env);
 if(!user)throw fail(401,"firebase_authentication_required");
 return user;
}
async function createAccount(db,user,now){
 await db.prepare("INSERT INTO d25_accounts(uid,email,status,created_at_ms,updated_at_ms) "+
  "VALUES(?,?,'not_subscribed',?,?) ON CONFLICT(uid) DO UPDATE SET email=excluded.email")
  .bind(user.uid,user.email,now,now).run();
 return db.prepare("SELECT * FROM d25_accounts WHERE uid=?").bind(user.uid).first();
}
async function accountFor(req,env,now){
 const user=await identity(req,env);
 const account=await createAccount(env.DB,user,now);
 if(!account||account.disabled)throw fail(403,"d25_account_disabled");
 return{user,account};
}
async function status(req,env,now){
 const {user,account}=await accountFor(req,env,now);
 return{...subscriptionState(account,now),uid:user.uid,email:user.email,
  provider:account.subscription_id?"razorpay-test":null};
}
async function checkout(req,env,now){
 const payload=await jsonBody(req);
 if(!validateStart(payload))throw fail(400,"confirm_500_inr_monthly_recurring_terms");
 if(!razorpayEnabled(env))throw fail(503,"razorpay_test_subscriptions_not_enabled");
 const {user,account}=await accountFor(req,env,now);
 const state=checkoutDecision(account,now);
 if(state==="active")throw fail(409,"already_subscribed");
 if(state==="pending")return{schema:"D25-Checkout-Link/v1",checkoutUrl:account.checkout_url,existing:true};
 if(state==="busy"||state==="review")throw fail(409,"subscription_requires_reconciliation");
 // An earlier cancelled/expired customer may have a linked subscription;
 // ask Razorpay before creating a second mandate, even on a stale UI.
 if(validProviderId(account.subscription_id,"sub")){
  const old=await fetchTestSubscription(env,account.subscription_id);
  if(!["cancelled","expired","completed"].includes(old.status))
   throw fail(409,"existing_razorpay_subscription_must_be_resolved");
 }
 const lease=crypto.randomUUID();
 const locked=await env.DB.prepare("UPDATE d25_accounts SET status='creating', "+
  "lease_token=?,lease_until_ms=?,updated_at_ms=?,recovery_subscription_id=NULL "+
  "WHERE uid=? AND updated_at_ms=? AND requires_review=0 AND status=? RETURNING uid")
  .bind(lease,now+90000,now,user.uid,account.updated_at_ms,account.status).first();
 if(!locked)throw fail(409,"subscription_creation_in_progress");
 let remote=null;
 try{
  remote=await newTestSubscription(env,user.uid);
  // D1 batch is transactional; the subscription mapping and account update
  // must not commit separately. Both statements require the same lease token.
  const results=await env.DB.batch([
   env.DB.prepare("INSERT INTO d25_subscriptions(subscription_id,uid,plan_id,created_at_ms) "+
    "SELECT ?,uid,?,? FROM d25_accounts WHERE uid=? AND lease_token=?")
    .bind(remote.id,env.RAZORPAY_TEST_PLAN_ID,now,user.uid,lease),
   env.DB.prepare("UPDATE d25_accounts SET subscription_id=?,checkout_url=?,status='pending',"+
    "lease_token=NULL,lease_until_ms=0,updated_at_ms=? WHERE uid=? AND lease_token=? RETURNING uid")
    .bind(remote.id,remote.checkoutUrl,Date.now(),user.uid,lease)
  ]);
  if(results[0].meta?.changes!==1||results[1].results?.length!==1)
   throw Error("subscription_mapping_not_confirmed");
  return{schema:"D25-Checkout-Link/v1",checkoutUrl:remote.checkoutUrl,existing:false};
 }catch{
  // Recover an already-persisted transaction even if the HTTP response failed.
  if(remote?.id){
   try{
    const [stored,mapped]=await Promise.all([
     env.DB.prepare("SELECT subscription_id,checkout_url FROM d25_accounts WHERE uid=?").bind(user.uid).first(),
     env.DB.prepare("SELECT uid FROM d25_subscriptions WHERE subscription_id=?").bind(remote.id).first()
    ]);
    if(stored?.subscription_id===remote.id&&mapped?.uid===user.uid&&validCheckoutUrl(stored.checkout_url))
     return{schema:"D25-Checkout-Link/v1",checkoutUrl:stored.checkout_url,existing:true};
   }catch{/* no access granted when persistence is unknown */}
  }
  let cancelled=false;
  if(remote?.id){
   try{const c=await cancelTestSubscription(env,remote.id,false);
    cancelled=c.status==="cancelled";
   }catch{/* remain locked for manual review */}
  }
  try{
   await env.DB.prepare("UPDATE d25_accounts SET status=?,lease_token=NULL,lease_until_ms=0,"+
    "requires_review=?,recovery_subscription_id=?,updated_at_ms=? WHERE uid=? AND lease_token=?")
    .bind(cancelled?"not_subscribed":"manual_review",cancelled?0:1,
     cancelled?null:(remote?.id??null),Date.now(),user.uid,lease).run();
  }catch{/* fail closed: an expired creation lease is also a manual-review lock */}
  throw fail(503,"subscription_creation_unconfirmed_contact_support");
 }
}
async function cancel(req,env,now){
 await jsonBody(req);
 const {user,account}=await accountFor(req,env,now);
 if(!validProviderId(account.subscription_id,"sub"))throw fail(404,"no_subscribed_mandate");
 if(account.cancellation_requested_at_ms)return{schema:"D25-Cancellation/v1",scheduled:true};
 if(!razorpayEnabled(env))throw fail(503,"razorpay_test_subscriptions_not_enabled");
 const c=await cancelTestSubscription(env,account.subscription_id,true);
 const updated=await env.DB.prepare("UPDATE d25_accounts SET cancellation_requested_at_ms=?,status='cancel_requested',"+
  "updated_at_ms=? WHERE uid=? AND subscription_id=?")
  .bind(now,now,user.uid,account.subscription_id).run();
 if(updated.meta?.changes!==1)throw fail(503,"cancellation_state_unconfirmed");
 return{schema:"D25-Cancellation/v1",scheduled:!!c};
}
async function quotaStatus(req,env,now){
 const {user,account}=await accountFor(req,env,now);
 if(!activeAccount(account,now))throw fail(403,"active_subscription_required");
 const quota=await env.DB.prepare("SELECT used,reset_at_ms FROM d25_quotas WHERE uid=?")
  .bind(user.uid).first();
 const renewed=!!quota&&quota.used===LIMIT&&quota.reset_at_ms<=now;
 const remaining=renewed?LIMIT:LIMIT-Number(quota?.used??0);
 const resetAt=remaining===0?Number(quota?.reset_at_ms??0):0;
 return{schema:"D25-Desktop-Quota/v1",limit:LIMIT,remaining,allowed:remaining>0,
  retryAt:resetAt,source:"cloudflare-d1",localCompute:true};
}
async function reserve(req,env,now){
 const payload=await jsonBody(req);
 if(typeof payload.requestId!=="string"||!UUID.test(payload.requestId)||
  Object.keys(payload).length!==1)throw fail(400,"valid_unique_request_id_required");
 const {user,account}=await accountFor(req,env,now);
 if(!activeAccount(account,now))throw fail(403,"active_subscription_required");
 try{
  const [q,reservation]=await env.DB.batch(quotaStatements(env.DB,{
   uid:user.uid,requestId:payload.requestId,now
  }));
  if(reservation.meta?.changes!==1){
   const st=await quotaStatus(req,env,Date.now());
   throw fail(st.remaining===0?429:403,st.remaining===0?"quota_exhausted":"entitlement_changed");
  }
  const detail=q.results?.[0];
  if(!detail||detail.used<1||detail.used>20)throw Error("quota_internal_mismatch");
  return{schema:"D25-Desktop-Quota/v1",limit:LIMIT,allowed:true,
   remaining:LIMIT-detail.used,retryAt:detail.used===20?detail.reset_at_ms:0};
 }catch(e){
  if(e.status)throw e;
  // The primary-key on request_id rolls back the quota increment in D1.batch.
  const prior=await env.DB.prepare("SELECT uid FROM d25_reservations WHERE request_id=?")
   .bind(payload.requestId).first();
  if(prior)throw fail(409,"duplicate_execution_request");
  throw e;
 }
}

async function webhook(req,env,now){
 if(!razorpayEnabled(env))throw fail(503,"test_payments_disabled");
 const bytes=new Uint8Array(await req.arrayBuffer());
 if(!await validWebhook(bytes,req.headers.get("x-razorpay-signature"),env))
  throw fail(401,"invalid_razorpay_webhook_signature");
 const eventId=req.headers.get("x-razorpay-event-id");
 if(!validProviderId(eventId,"evt"))throw fail(400,"invalid_webhook_event_id");
 let data;
 try{data=JSON.parse(new TextDecoder().decode(bytes));}
 catch{throw fail(400,"invalid_webhook_json");}
 const type=data?.event;
 const allowed=["subscription.charged","subscription.cancelled","subscription.halted",
  "subscription.pending","subscription.completed","subscription.paused","payment.refunded"];
 if(!allowed.includes(type))return{received:true,ignored:true};
 const existing=await env.DB.prepare("SELECT event_id FROM d25_webhook_events WHERE event_id=?")
  .bind(eventId).first();
 if(existing)return{received:true,duplicate:true};
 if(type==="payment.refunded"){
  const payment=data?.payload?.payment?.entity;
  if(!validProviderId(payment?.id,"pay")||payment?.amount_refunded!==MONTHLY_PAISE||
     payment?.amount!==MONTHLY_PAISE||payment?.currency!=="INR")
   return{received:true,ignored:true};
  // A refund may arrive before the subscription.charged event. Persist its
  // unique payment ID so a delayed captured event cannot restore entitlement.
  await env.DB.batch([
   env.DB.prepare("INSERT OR IGNORE INTO d25_webhook_events(event_id,event_type,processed_at_ms) VALUES(?,?,?)")
    .bind(eventId,type,now),
   env.DB.prepare("INSERT OR IGNORE INTO d25_refunds(payment_id,processed_at_ms) VALUES (?,?)")
    .bind(payment.id,now),
   env.DB.prepare("UPDATE d25_charges SET refunded_at_ms=? WHERE payment_id=? AND refunded_at_ms IS NULL")
    .bind(now,payment.id),
   env.DB.prepare("UPDATE d25_accounts SET refunded=1,status='refunded',paid_until_ms=0,updated_at_ms=? "+
    "WHERE last_payment_id=? AND last_payment_id IN (SELECT payment_id FROM d25_refunds)")
    .bind(now,payment.id)
  ]);
  return{received:true};
 }
 const sub=data?.payload?.subscription?.entity;
 if(!validProviderId(sub?.id,"sub"))throw fail(400,"invalid_subscription_id");
 const mapping=await env.DB.prepare("SELECT uid,plan_id FROM d25_subscriptions WHERE subscription_id=?")
  .bind(sub.id).first();
 if(!mapping)throw fail(503,"subscription_mapping_not_ready");
 if(mapping.plan_id!==env.RAZORPAY_TEST_PLAN_ID||sub.plan_id!==mapping.plan_id)
  throw fail(422,"subscription_plan_mismatch");
 if(type==="subscription.charged"){
  const payment=data?.payload?.payment?.entity;
  const period=periodEndMs(sub,now);
  if(!validCapturedCharge(payment,sub.id)||sub.status!=="active"||!period)
   throw fail(422,"captured_payment_and_valid_period_required");
  const actions=[
   env.DB.prepare("INSERT OR IGNORE INTO d25_webhook_events(event_id,event_type,processed_at_ms) VALUES(?,?,?)")
    .bind(eventId,type,now),
   env.DB.prepare("INSERT OR IGNORE INTO d25_charges "+
    "(payment_id,uid,subscription_id,amount_paise,currency,paid_until_ms,received_at_ms,refunded_at_ms) "+
    "VALUES (?,?,?,?,?,?,?,(SELECT processed_at_ms FROM d25_refunds WHERE payment_id=?))")
    .bind(payment.id,mapping.uid,sub.id,MONTHLY_PAISE,"INR",period,now,payment.id),
   env.DB.prepare("UPDATE d25_accounts SET "+
    "paid_until_ms=MAX(paid_until_ms,?),last_payment_id=?,last_payment_at_ms=?,refunded=0,"+
    "status=CASE WHEN cancellation_requested_at_ms IS NOT NULL THEN 'cancel_requested' ELSE 'active' END,"+
    "updated_at_ms=? WHERE uid=? AND subscription_id=? AND revoked=0 AND disabled=0 AND requires_review=0 "+
    "AND EXISTS(SELECT 1 FROM d25_charges WHERE payment_id=? AND uid=? AND "+
    "refunded_at_ms IS NULL)")
    .bind(period,payment.id,now,now,mapping.uid,sub.id,payment.id,mapping.uid)
  ];
  await env.DB.batch(actions);
  return{received:true};
 }
 await env.DB.batch([
  env.DB.prepare("INSERT OR IGNORE INTO d25_webhook_events(event_id,event_type,processed_at_ms) VALUES(?,?,?)")
   .bind(eventId,type,now),
  env.DB.prepare("UPDATE d25_accounts SET status=?,updated_at_ms=? "+
   "WHERE uid=? AND subscription_id=? AND refunded=0 AND revoked=0")
   .bind(type.slice("subscription.".length),now,mapping.uid,sub.id)
 ]);
 return{received:true};
}
function adminIdentity(user,env){
 const allowed=String(env.D25_ADMIN_GOOGLE_UIDS||"").split(",").map(x=>x.trim()).filter(Boolean);
 if(!user.google||!allowed.includes(user.uid))throw fail(403,"verified_google_admin_uid_required");
}
function asMember(account,now){
 return{
  uid:account.uid,email:account.email,displayName:"",
  createdAtMs:account.created_at_ms,lastSignInMs:null,
  disabled:!!account.disabled,emailVerified:true,
  subscriptionStatus:account.status,subscriptionId:account.subscription_id,
  paidThroughMs:account.paid_until_ms,
  active:activeAccount(account,now),
  cancellationRequested:!!account.cancellation_requested_at_ms,
  revoked:!!account.revoked
 };
}
async function adminOverview(env,now){
 const db=env.DB,from=Date.UTC(new Date(now).getUTCFullYear(),new Date(now).getUTCMonth()-11,1);
 const [all,unexpired,charges,monthCharges,monthAccounts]=await Promise.all([
  db.prepare("SELECT COUNT(*) AS n FROM d25_accounts").first(),
  db.prepare("SELECT COUNT(*) AS n FROM d25_accounts WHERE paid_until_ms>? AND revoked=0 "+
   "AND refunded=0 AND disabled=0 AND requires_review=0").bind(now).first(),
  db.prepare("SELECT COUNT(*) AS n,COALESCE(SUM(amount_paise),0) AS paise FROM d25_charges "+
   "WHERE received_at_ms>=? AND refunded_at_ms IS NULL").bind(from).first(),
  db.prepare("SELECT strftime('%Y-%m',received_at_ms/1000,'unixepoch') AS month,"+
   "COUNT(*) AS transactions,COALESCE(SUM(amount_paise),0) AS paise FROM d25_charges "+
   "WHERE received_at_ms>=? AND refunded_at_ms IS NULL GROUP BY month").bind(from).all(),
  db.prepare("SELECT strftime('%Y-%m',created_at_ms/1000,'unixepoch') AS month,"+
   "COUNT(*) AS n FROM d25_accounts WHERE created_at_ms>=? GROUP BY month").bind(from).all()
 ]);
 const chargesByMonth=new Map((monthCharges.results||[]).map(r=>[r.month,r]));
 const accountsByMonth=new Map((monthAccounts.results||[]).map(r=>[r.month,r.n]));
 const start=new Date(now),months=Array.from({length:12},(_,i)=>{
  const month=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()-11+i,1)).toISOString().slice(0,7);
  const charge=chargesByMonth.get(month)||{};
  return{month,transactions:charge.transactions||0,grossInr:(charge.paise||0)/100,
   checkoutAccounts:accountsByMonth.get(month)||0};
 });
 return{schema:"D25-Admin-Overview/v1",asOf:new Date(now).toISOString(),
  subscriptionAccounts:all?.n??0,unexpiredPaidRecords:unexpired?.n??0,
  mrrUpperBoundInr:(unexpired?.n??0)*500,
  collectedGrossInr12Months:(charges?.paise??0)/100,
  charges12Months:charges?.n??0,months,
  limitations:[
   "MRR is an upper bound from unexpired paid accounts, not a financial statement.",
   "Payment graphs reflect recorded non-refunded captured payments, before gateway fees and taxes.",
   "Accounts represent customers who used D25 licensing; Firebase users who never connected may be absent.",
   "Marketing visitor, campaign and advertising conversion data are not collected."
  ]};
}
async function adminUsers(env,url,now){
 const search=(url.searchParams.get("search")||"").trim();
 const active=url.searchParams.get("scope")==="active";
 const scope=url.searchParams.get("scope")||"all";
 if(!["all","active"].includes(scope)||search.length>254)throw fail(400,"invalid_user_filter");
 if(search){
  const matched=await env.DB.prepare("SELECT * FROM d25_accounts WHERE uid=? OR email=? LIMIT 1")
   .bind(search,search).first();
  return{users:matched?[asMember(matched,now)]:[],nextCursor:null};
 }
 const cursor=Number(url.searchParams.get("cursor")||"0");
 if(!Number.isSafeInteger(cursor)||cursor<0||cursor>1000000)throw fail(400,"invalid_page_cursor");
 const query=active?"SELECT * FROM d25_accounts WHERE paid_until_ms>? AND revoked=0 "+
  "AND refunded=0 AND disabled=0 AND requires_review=0 ORDER BY created_at_ms DESC LIMIT 51 OFFSET ?":
  "SELECT * FROM d25_accounts ORDER BY created_at_ms DESC LIMIT 51 OFFSET ?";
 const result=active?
  await env.DB.prepare(query).bind(now,cursor).all():
  await env.DB.prepare(query).bind(cursor).all();
 const records=result.results||[];
 return{users:records.slice(0,50).map(a=>asMember(a,now)),
  nextCursor:records.length>50?String(cursor+50):null};
}
async function adminAudit(env){
 const result=await env.DB.prepare("SELECT * FROM d25_admin_audit ORDER BY created_at_ms DESC LIMIT 25").all();
 return{events:(result.results||[]).map(e=>({
  id:e.event_id,atMs:e.created_at_ms,actorUid:e.actor_uid,targetUid:e.target_uid,
  action:e.action,state:e.result
 }))};
}
async function adminAction(req,env,admin,now){
 const body=await jsonBody(req);
 if(!["disableUser","enableUser","revokeLicense","cancelRenewal"].includes(body.action)||
  !validUid(body.uid)||body.confirm!==true||Object.keys(body).sort().join(",")!=="action,confirm,uid")
  throw fail(400,"confirmed_admin_action_required");
 const target=body.uid;
 const adminUids=String(env.D25_ADMIN_GOOGLE_UIDS||"").split(",").map(x=>x.trim());
 if(target===admin.uid||adminUids.includes(target))throw fail(403,"cannot_change_admin_account");
 const account=await env.DB.prepare("SELECT * FROM d25_accounts WHERE uid=?")
  .bind(target).first();
 if(!account)throw fail(404,"account_not_found");
 if(["cancelRenewal","revokeLicense"].includes(body.action)&&
  validProviderId(account.subscription_id,"sub")&&!account.cancellation_requested_at_ms){
  if(!razorpayEnabled(env))throw fail(503,"test_provider_disabled");
  await cancelTestSubscription(env,account.subscription_id,true);
 }
 let sql,params;
 if(body.action==="disableUser"){sql="UPDATE d25_accounts SET disabled=1,updated_at_ms=? WHERE uid=?";params=[now,target];}
 if(body.action==="enableUser"){sql="UPDATE d25_accounts SET disabled=0,updated_at_ms=? WHERE uid=?";params=[now,target];}
 if(body.action==="revokeLicense"){
  sql="UPDATE d25_accounts SET revoked=1,status='revoked',paid_until_ms=0,"+
    "cancellation_requested_at_ms=COALESCE(cancellation_requested_at_ms,?),updated_at_ms=? WHERE uid=?";
  params=[now,now,target];
 }
 if(body.action==="cancelRenewal"){
  sql="UPDATE d25_accounts SET cancellation_requested_at_ms=COALESCE(cancellation_requested_at_ms,?),"+
   "status='cancel_requested',updated_at_ms=? WHERE uid=?";
  params=[now,now,target];
 }
 const id=crypto.randomUUID();
 await env.DB.batch([
  env.DB.prepare(sql).bind(...params),
  env.DB.prepare("INSERT INTO d25_admin_audit(event_id,actor_uid,target_uid,action,created_at_ms,result) "+
   "VALUES(?,?,?,?,?,'completed')").bind(id,admin.uid,target,body.action,now)
 ]);
 return{success:true,action:body.action,uid:target};
}
export default {
 async fetch(req,env){
  let origin="";
  try{
   origin=originAllowed(req,env);
   const url=new URL(req.url),path=url.pathname.replace(/\/$/,"")||"/";
   if(req.method==="OPTIONS"){
    return new Response(null,{status:204,headers:{
     "Access-Control-Allow-Origin":origin||"null",
     "Access-Control-Allow-Headers":"Content-Type, Authorization",
     "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
     "Access-Control-Max-Age":"300","Vary":"Origin"
    }});
   }
   if(path==="/v1/health"&&req.method==="GET")
    return json(200,resourceStatus(env),origin);
   if(!env.DB)throw fail(503,"d1_database_not_configured");
   const now=Date.now();
   if(path==="/v1/webhook"&&req.method==="POST")
    return json(200,await webhook(req,env,now),origin);
   const adminRoute=path.startsWith("/v1/admin/");
   let user;
   if(adminRoute){
    user=await identity(req,env);
    adminIdentity(user,env);
    let data;
    if(path==="/v1/admin/overview"&&req.method==="GET")data=await adminOverview(env,now);
    else if(path==="/v1/admin/users"&&req.method==="GET")data=await adminUsers(env,url,now);
    else if(path==="/v1/admin/audit"&&req.method==="GET")data=await adminAudit(env);
    else if(path==="/v1/admin/action"&&req.method==="POST")data=await adminAction(req,env,user,now);
    else throw fail(405,"unsupported_admin_route");
    return json(200,data,origin);
   }
   if(path==="/v1/status"&&req.method==="GET")
    return json(200,await status(req,env,now),origin);
   if(path==="/v1/start"&&req.method==="POST")
    return json(200,await checkout(req,env,now),origin);
   if(path==="/v1/cancel"&&req.method==="POST")
    return json(200,await cancel(req,env,now),origin);
   if(path==="/v1/quota/status"&&req.method==="GET")
    return json(200,await quotaStatus(req,env,now),origin);
   if(path==="/v1/quota/reserve"&&req.method==="POST")
    return json(200,await reserve(req,env,now),origin);
   throw fail(404,"not_found");
  }catch(e){
   const status=Number.isInteger(e?.status)?e.status:503;
   // Prevent leaking provider secrets, Firebase tokens, database rows.
   if(status>=500)console.error("D25 licensing request unavailable:",e?.name||"Error");
   return json(status,{error:e?.status?String(e.message).slice(0,100):"license_service_unavailable"},origin);
  }
 }
};
