"use strict";
const {createHmac,timingSafeEqual} = require("node:crypto");
const PRICE_PAISE=50000;
const CURRENCY="INR";
const MAX_CYCLES=12;
function hmacMatches(value, expected){
 if(typeof value!=="string"||!/^[0-9a-f]{64}$/i.test(value))return false;
 const provided=Buffer.from(value,"hex");
 return provided.length===expected.length&&timingSafeEqual(provided,expected);
}
function verifyWebhook(raw,sig,secret){
 if(!Buffer.isBuffer(raw)||raw.length===0||raw.length>128*1024||typeof secret!=="string"||secret.length<16)return false;
 return hmacMatches(sig,createHmac("sha256",secret).update(raw).digest());
}
function verifyMonthlyPlan(plan,id){
 return !!plan&&plan.id===id&&plan.period==="monthly"&&plan.interval===1&&
  plan.item?.amount===PRICE_PAISE&&plan.item?.currency===CURRENCY;
}
function isCapturedSubscriptionCharge(payment,subId){
 return !!payment&&typeof subId==="string"&&/^sub_[a-zA-Z0-9]+$/.test(subId)&&
  /^pay_[a-zA-Z0-9]+$/.test(payment.id??"")&&
  (payment.subscription_id===undefined||payment.subscription_id===null||payment.subscription_id===subId)&&
  payment.status==="captured"&&payment.amount===PRICE_PAISE&&payment.currency===CURRENCY;
}
function safePeriodEndSeconds(subscription,nowMs){
 const s=subscription?.current_end;
 if(!Number.isInteger(s))return 0;
 const future=s*1000;
 // A paid monthly cycle should not extend access beyond 35 days from processing.
 return future>nowMs && future<=nowMs+35*86400000 ? s : 0;
}
function isEntitled(account,nowMs){
 return !!account&&Number.isFinite(account.paidThroughMs)&&
  account.paidThroughMs>nowMs&&!account.revokedAtMs&&account.status!=="refunded"&&account.status!=="revoked";
}
module.exports={PRICE_PAISE,CURRENCY,MAX_CYCLES,verifyWebhook,verifyMonthlyPlan,
 isCapturedSubscriptionCharge,safePeriodEndSeconds,isEntitled};
