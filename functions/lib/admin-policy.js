"use strict";
const ACTIONS=["disableUser","enableUser","revokeLicense","cancelRenewal"];
function adminAllowed(claims,user){
 return !!claims&&!!user&&!user.disabled&&claims.uid===user.uid&&
  claims.email_verified===true&&claims.d25Admin===true&&
  user.customClaims?.d25Admin===true&&claims.firebase?.sign_in_provider==="google.com";
}
function validAction(input){
 return !!input&&typeof input==="object"&&!Array.isArray(input)&&
  ACTIONS.includes(input.action)&&typeof input.uid==="string"&&
  /^[A-Za-z0-9_-]{3,128}$/.test(input.uid)&&input.confirm===true;
}
function safeMember(user,account={},at=Date.now()){
 const paid=Number(account.paidThroughMs)||0;
 const disabled=user.disabled===true,revoked=!!account.revokedAtMs||account.status==="revoked";
 return {
  uid:String(user.uid),email:String(user.email||""),
  displayName:String(user.displayName||"").slice(0,150),
  createdAtMs:Date.parse(user.metadata?.creationTime||"")||null,
  lastSignInMs:Date.parse(user.metadata?.lastSignInTime||"")||null,
  disabled,emailVerified:user.emailVerified===true,
  subscriptionStatus:String(account.status||"not_subscribed").slice(0,50),
  subscriptionId:typeof account.subscriptionId==="string"?account.subscriptionId:null,
  paidThroughMs:paid,active:paid>at&&!revoked&&!disabled,
  cancellationRequested:!!account.cancellationRequestedAtMs,revoked
 };
}
function monthBuckets(at=Date.now()){
 const date=new Date(at);
 return Array.from({length:12},(_,i)=>{
  const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()-11+i,1));
  return{month:d.toISOString().slice(0,7),from:d.getTime(),
   to:Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)};
 });
}
module.exports={ACTIONS,adminAllowed,validAction,safeMember,monthBuckets};
