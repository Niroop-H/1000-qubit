/**
 * Razorpay recurring subscriptions — test by default, live only after an
 * explicit merchant opt-in and separate live D1 database provisioning.
 * The quantum engine never executes here.
 */
import {validCheckoutUrl,validProviderId,validPlan} from "./policy.mjs";
const encoder=new TextEncoder();
export function razorpayMode(env){
 return env.D25_BILLING_MODE==="live"?"live":"test";
}
export function paymentConfig(env){
 const live=razorpayMode(env)==="live";
 return {
  mode:live?"live":"test",
  keyId:live?env.RAZORPAY_LIVE_KEY_ID:env.RAZORPAY_TEST_KEY_ID,
  keySecret:live?env.RAZORPAY_LIVE_KEY_SECRET:env.RAZORPAY_TEST_KEY_SECRET,
  webhookSecret:live?env.RAZORPAY_LIVE_WEBHOOK_SECRET:env.RAZORPAY_TEST_WEBHOOK_SECRET,
  planId:live?env.RAZORPAY_LIVE_PLAN_ID:env.RAZORPAY_TEST_PLAN_ID
 };
}
export function razorpayWebhookReady(env){
 const p=paymentConfig(env);
 return typeof p.webhookSecret==="string"&&p.webhookSecret.length>=16&&
  /^plan_[A-Za-z0-9]+$/.test(p.planId||"");
}
export function razorpayCredentialsReady(env){
 const p=paymentConfig(env);
 return new RegExp("^rzp_"+p.mode+"_[A-Za-z0-9]+$").test(p.keyId||"")&&
  typeof p.keySecret==="string"&&p.keySecret.length>=16&&
  razorpayWebhookReady(env);
}
export function razorpayEnabled(env){
 const live=razorpayMode(env)==="live";
 return razorpayCredentialsReady(env)&&(live?
   env.D25_ENABLE_LIVE_CHECKOUT==="true"&&
   env.D25_CONFIRMED_LIVE_CHARGING==="I_CONFIRM_REAL_RECURRING_CHARGES":
   env.D25_ENABLE_TEST_CHECKOUT==="true");
}
export async function razorpay(env,path,method="GET",data){
 const p=paymentConfig(env);
 if(!razorpayCredentialsReady(env))throw Error("Razorpay "+p.mode+" credentials are not configured.");
 if(!/^(?:plans\/plan_[A-Za-z0-9]+|subscriptions(?:\/sub_[A-Za-z0-9]+(?:\/cancel)?)?)$/.test(path))
  throw Error("Invalid payment API resource.");
 const token=btoa(p.keyId+":"+p.keySecret);
 const response=await fetch("https://api.razorpay.com/v1/"+path,{
  method,headers:{"Authorization":"Basic "+token,"Accept":"application/json",
   ...(data?{"Content-Type":"application/json"}:{})},
  ...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw Error("Razorpay "+p.mode+" provider request failed: HTTP "+response.status);
 return response.json();
}
export async function configuredPlan(env){
 const id=paymentConfig(env).planId;
 const plan=await razorpay(env,"plans/"+id);
 if(!validPlan(plan,id))throw Error("Razorpay plan must be exactly INR 500 monthly.");
 return id;
}
export async function newSubscription(env,uid){
 const plan=await configuredPlan(env);
 const result=await razorpay(env,"subscriptions","POST",{
  plan_id:plan,total_count:12,quantity:1,customer_notify:true,
  notes:{d25_uid:uid,d25_product:"D25-Quantum-Workspace"}
 });
 if(!validProviderId(result?.id,"sub")||result.plan_id!==plan||
   !validCheckoutUrl(result.short_url))
  throw Error("Unexpected Razorpay subscription response.");
 return{id:result.id,checkoutUrl:result.short_url};
}
export async function fetchSubscription(env,subId){
 if(!validProviderId(subId,"sub"))throw Error("Invalid subscription ID.");
 const result=await razorpay(env,"subscriptions/"+subId);
 if(result.id!==subId||result.plan_id!==paymentConfig(env).planId)
  throw Error("Unexpected Razorpay subscription.");
 return result;
}
export async function cancelSubscription(env,subId,atCycleEnd=true){
 if(!validProviderId(subId,"sub"))throw Error("Invalid subscription ID.");
 const result=await razorpay(env,"subscriptions/"+subId+"/cancel","POST",
  {cancel_at_cycle_end:!!atCycleEnd});
 if(result?.id!==subId)throw Error("Cancellation confirmation mismatch.");
 return result;
}
function constantTimeEqual(a,b){
 if(a.length!==b.length)return false;
 let delta=0;
 for(let i=0;i<a.length;i++)delta|=a[i]^b[i];
 return delta===0;
}
export async function validWebhook(raw,signature,env){
 if(!(raw instanceof Uint8Array)||raw.byteLength===0||raw.byteLength>128*1024||
  typeof signature!=="string"||!/^[0-9a-f]{64}$/i.test(signature)||!razorpayWebhookReady(env))
  return false;
 const key=await crypto.subtle.importKey("raw",encoder.encode(paymentConfig(env).webhookSecret),
  {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const computed=new Uint8Array(await crypto.subtle.sign("HMAC",key,raw));
 const supplied=Uint8Array.from(signature.match(/../g)||[],x=>parseInt(x,16));
 return constantTimeEqual(computed,supplied);
}
