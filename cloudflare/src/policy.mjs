/** Cloudflare D25 licensing policy — no quantum computation runs here. */
export const MONTHLY_PAISE=50000;
export const MONTHLY_CURRENCY="INR";
export const BILLING_CYCLES=12;
export const LIMIT=20;
export const COOLDOWN_MS=5*60*60*1000;
export const SOURCE="D25-Cloudflare-License/v1";
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID=/^[a-zA-Z0-9_-]{3,128}$/;
const PROVIDER=/^(sub|pay|plan|evt)_[A-Za-z0-9]+$/;
export function validUid(uid){return typeof uid==="string"&&ID.test(uid);}
export function validProviderId(value,prefix){return typeof value==="string"&&PROVIDER.test(value)&&value.startsWith(prefix+"_");}
export function validPlan(plan,configuredId){
 return !!plan&&validProviderId(configuredId,"plan")&&plan.id===configuredId&&
  plan.period==="monthly"&&plan.interval===1&&
  plan.item?.amount===MONTHLY_PAISE&&plan.item?.currency===MONTHLY_CURRENCY;
}
export function validCapturedCharge(payment,subId){
 return !!payment&&validProviderId(subId,"sub")&&validProviderId(payment.id,"pay")&&
  (!payment.subscription_id||payment.subscription_id===subId)&&
  payment.status==="captured"&&payment.amount===MONTHLY_PAISE&&
  payment.currency===MONTHLY_CURRENCY;
}
export function periodEndMs(subscription,now){
 const seconds=subscription?.current_end;
 if(!Number.isSafeInteger(seconds))return 0;
 const value=seconds*1000;
 return value>now&&value<=now+35*86400000?value:0;
}
export function activeAccount(account,now){
 return !!account&&!account.disabled&&!account.revoked&&!account.refunded&&
  !account.requires_review&&Number.isSafeInteger(account.paid_until_ms)&&
  account.paid_until_ms>now&&account.status!=="refunded"&&account.status!=="revoked";
}
export function validateStart(body){
 return !!body&&typeof body==="object"&&!Array.isArray(body)&&
  Object.keys(body).sort().join(",")==="confirmRecurring,pricePaise,termsVersion"&&
  body.confirmRecurring===true&&body.pricePaise===MONTHLY_PAISE&&
  body.termsVersion==="d25-monthly-v1";
}
export function validCheckoutUrl(value){
 if(typeof value!=="string"||value.length>500)return false;
 try{
  const url=new URL(value);
  return url.protocol==="https:"&&["rzp.io","razorpay.com","api.razorpay.com"].includes(url.hostname);
 }catch{return false;}
}
/** Server-only Cloudflare secrets for BOTH Firebase UID and verified Google email.
 * Email matching alone must never grant unlimited/owner access.
 */
export function ownerAuthorized(user,env,account){
 const uid=String(env?.D25_OWNER_GOOGLE_UID||"").trim();
 const email=String(env?.D25_OWNER_GOOGLE_EMAIL||"").trim().toLowerCase();
 return validUid(uid)&&email.length>=6&&email.includes("@")&&
  user?.uid===uid&&user?.google===true&&user?.emailVerified===true&&
  String(user?.email||"").toLowerCase()===email&&
  !!account&&!account.disabled&&!account.revoked&&!account.requires_review;
}
export function subscriptionState(account,now,{owner=false,mode="test",checkoutEnabled=false}={}){
 const paidThroughMs=Number(account?.paid_until_ms??0);
 return {
  schema:"D25-Account-Subscription/v1",
  active:!!owner||activeAccount(account,now),
  ownerAccess:!!owner,
  billingMode:mode==="live"?"live":"test",
  checkoutEnabled:!!checkoutEnabled,
  paidThroughMs:Number.isSafeInteger(paidThroughMs)?paidThroughMs:0,
  subscriptionStatus:owner?"owner_exempt":String(account?.status??"not_subscribed"),
  cancellationRequested:!!account?.cancellation_requested_at_ms,
  checkoutUrl:!owner&&account?.status==="pending"&&validCheckoutUrl(account?.checkout_url)?account.checkout_url:null,
  monthlyAmountPaise:MONTHLY_PAISE,maxCycles:BILLING_CYCLES,currency:MONTHLY_CURRENCY
 };
}
/** A checkout lease expiring doesn't prove Razorpay failed. Prevent a second mandate. */
export function checkoutDecision(account,now){
 if(!account)return "start";
 if(account.requires_review||account.status==="manual_review")return "review";
 if(account.status==="creating")return account.lease_until_ms>now?"busy":"review";
 if(activeAccount(account,now))return "active";
 if(account.status==="pending"&&validCheckoutUrl(account.checkout_url))return "pending";
 if(account.subscription_id&&
   !["cancelled","expired","completed","not_subscribed"].includes(account.status))return "review";
 return "start";
}
/** Atomic D1 quota command: UPSERT followed by INSERT reservation in db.batch.
 * If INSERT encounters same request ID, entire batch rolls back, so no double debit.
 * If UP-SERT was blocked by exhausted quota, second INSERT SELECT does nothing.
 */
export function quotaStatements(db,{uid,requestId,now,ownerExempt=false}){
 if(!validUid(uid)||typeof requestId!=="string"||!UUID.test(requestId)||
    !Number.isSafeInteger(now)||now<1)throw Error("Invalid quota reservation.");
 const upsert=db.prepare(
  "INSERT INTO d25_quotas(uid,used,reset_at_ms,updated_at_ms,last_request_id) "+
  "SELECT ?,1,0,?,? WHERE EXISTS(SELECT 1 FROM d25_accounts WHERE uid=? AND (paid_until_ms>? OR ?=1) "+
  "AND revoked=0 AND refunded=0 AND disabled=0 AND requires_review=0) "+
  "ON CONFLICT(uid) DO UPDATE SET "+
  "used=CASE WHEN d25_quotas.used=20 AND d25_quotas.reset_at_ms<=? THEN 1 ELSE d25_quotas.used+1 END, "+
  "reset_at_ms=CASE WHEN d25_quotas.used=20 AND d25_quotas.reset_at_ms<=? THEN 0 "+
  "WHEN d25_quotas.used=19 THEN ? ELSE d25_quotas.reset_at_ms END, "+
  "updated_at_ms=excluded.updated_at_ms,last_request_id=excluded.last_request_id "+
  "WHERE (d25_quotas.used<20 OR (d25_quotas.used=20 AND d25_quotas.reset_at_ms<=?)) "+
  "AND EXISTS(SELECT 1 FROM d25_accounts WHERE uid=excluded.uid AND (paid_until_ms>? OR ?=1) "+
  "AND revoked=0 AND refunded=0 AND disabled=0 AND requires_review=0) "+
  "RETURNING used,reset_at_ms"
 ).bind(uid,now,requestId,uid,now,ownerExempt?1:0,now,now,now+COOLDOWN_MS,now,now,ownerExempt?1:0);
 const insert=db.prepare(
  "INSERT INTO d25_reservations(request_id,uid,created_at_ms) "+
  "SELECT ?,?,? FROM d25_quotas WHERE uid=? AND last_request_id=?"
 ).bind(requestId,uid,now,uid,requestId);
 return [upsert,insert];
}
