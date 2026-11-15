import {validCheckoutUrl,validProviderId,validPlan} from "./policy.mjs";
const encoder=new TextEncoder();
function secretValue(env,key){
 const value=env[key];
 if(typeof value!=="string"||value.length<16)throw Error("Required TEST-only payment secret unavailable.");
 return value;
}
export function razorpayEnabled(env){
 return env.D25_ENABLE_TEST_CHECKOUT==="true"&&
  /^rzp_test_[A-Za-z0-9]+$/.test(env.RAZORPAY_TEST_KEY_ID||"")&&
  typeof env.RAZORPAY_TEST_KEY_SECRET==="string"&&
  env.RAZORPAY_TEST_KEY_SECRET.length>=16&&
  /^plan_[A-Za-z0-9]+$/.test(env.RAZORPAY_TEST_PLAN_ID||"");
}
export async function razorpay(env,path,method="GET",data){
 if(!razorpayEnabled(env))throw Error("Razorpay TEST subscriptions disabled.");
 if(!/^(?:plans\/plan_[A-Za-z0-9]+|subscriptions(?:\/sub_[A-Za-z0-9]+(?:\/cancel)?)?)$/.test(path))
  throw Error("Invalid payment API resource.");
 const token=btoa(env.RAZORPAY_TEST_KEY_ID+":"+secretValue(env,"RAZORPAY_TEST_KEY_SECRET"));
 const response=await fetch("https://api.razorpay.com/v1/"+path,{
  method,headers:{"Authorization":"Basic "+token,"Accept":"application/json",
   ...(data?{"Content-Type":"application/json"}:{})},
  ...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw Error("Razorpay TEST provider request failed: HTTP "+response.status);
 return response.json();
}
export async function configuredPlan(env){
 const id=env.RAZORPAY_TEST_PLAN_ID;
 const plan=await razorpay(env,"plans/"+id);
 if(!validPlan(plan,id))throw Error("Razorpay plan is not INR 500 per month.");
 return id;
}
export async function newTestSubscription(env,uid){
 const plan=await configuredPlan(env);
 const result=await razorpay(env,"subscriptions","POST",{
  plan_id:plan,total_count:12,quantity:1,customer_notify:true,
  notes:{d25_uid:uid,d25_product:"D25-Quantum-Workspace"}
 });
 if(!validProviderId(result?.id,"sub")||result.plan_id!==plan||
   !validCheckoutUrl(result.short_url))
  throw Error("Unexpected Razorpay TEST subscription response.");
 return{id:result.id,checkoutUrl:result.short_url};
}
export async function fetchTestSubscription(env,subId){
 if(!validProviderId(subId,"sub"))throw Error("Invalid subscription ID.");
 const result=await razorpay(env,"subscriptions/"+subId);
 if(result.id!==subId||result.plan_id!==env.RAZORPAY_TEST_PLAN_ID)
  throw Error("Unexpected Razorpay subscription.");
 return result;
}
export async function cancelTestSubscription(env,subId,atCycleEnd=true){
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
  typeof signature!=="string"||!/^[0-9a-f]{64}$/i.test(signature))return false;
 let secret;
 try{secret=secretValue(env,"RAZORPAY_TEST_WEBHOOK_SECRET");}catch{return false;}
 const key=await crypto.subtle.importKey("raw",encoder.encode(secret),
  {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const computed=new Uint8Array(await crypto.subtle.sign("HMAC",key,raw));
 const supplied=Uint8Array.from(signature.match(/../g)||[],x=>parseInt(x,16));
 return constantTimeEqual(computed,supplied);
}
