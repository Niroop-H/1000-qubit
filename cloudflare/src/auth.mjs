/**
 * Firebase Auth ID-token validation in Cloudflare Workers, without service
 * accounts, Admin SDK or a publicly embedded signing secret.
 * Verify algorithm, Google key, signature, issuer, audience, time and UID.
 */
import {validUid} from "./policy.mjs";
const GOOGLE_JWK="https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let cached=null,expiresAt=0;
const encoder=new TextEncoder();
const decoder=new TextDecoder();
function base64urlBytes(input){
 if(typeof input!=="string"||!/^[A-Za-z0-9_-]+$/.test(input))throw Error("Invalid JWT base64.");
 const normalized=input.replace(/-/g,"+").replace(/_/g,"/");
 const binary=atob(normalized+"=".repeat((4-normalized.length%4)%4));
 return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
function jsonPart(input){
 const bytes=base64urlBytes(input);
 if(bytes.length>8192)throw Error("Oversized identity token.");
 return JSON.parse(decoder.decode(bytes));
}
async function signingKeys(){
 if(cached&&expiresAt>Date.now())return cached;
 const response=await fetch(GOOGLE_JWK,{signal:AbortSignal.timeout(8500)});
 if(!response.ok)throw Error("Firebase signing keys unavailable.");
 const data=await response.json();
 if(!Array.isArray(data?.keys)||data.keys.length===0)throw Error("Firebase signing keys invalid.");
 const age=/max-age=(\d+)/i.exec(response.headers.get("Cache-Control")||"");
 const seconds=Math.max(60,Math.min(3600,Number(age?.[1])||300));
 cached=data.keys;expiresAt=Date.now()+seconds*1000;
 return cached;
}
export async function firebaseIdentity(request,env){
 if(typeof env.FIREBASE_PROJECT_ID!=="string"||
   !/^[a-z][a-z0-9-]{5,40}$/.test(env.FIREBASE_PROJECT_ID))
  throw Error("Firebase project not configured.");
 const header=request.headers.get("Authorization")||"";
 if(!/^Bearer [A-Za-z0-9._-]{100,6000}$/.test(header))return null;
 const idToken=header.slice(7);
 const parts=idToken.split(".");
 if(parts.length!==3)return null;
 let head,claims;
 try{head=jsonPart(parts[0]);claims=jsonPart(parts[1]);}catch{return null;}
 if(head?.alg!=="RS256"||typeof head.kid!=="string"||head.kid.length>150)return null;
 const project=env.FIREBASE_PROJECT_ID,now=Math.floor(Date.now()/1000);
 if(claims?.aud!==project||claims.iss!=="https://securetoken.google.com/"+project||
   !validUid(claims.sub)||claims.exp<=now||claims.iat>now||claims.auth_time>now||
   !Number.isSafeInteger(claims.exp)||!Number.isSafeInteger(claims.iat)||
   !Number.isSafeInteger(claims.auth_time)||claims.iat<now-48*3600||
   claims.exp-claims.iat>3700||claims.email_verified!==true||
   typeof claims.email!=="string"||claims.email.length>254)return null;
 let key;
 try{
  const jwk=(await signingKeys()).find(x=>x.kid===head.kid&&x.kty==="RSA");
  if(!jwk)return null;
  key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const valid=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,
   base64urlBytes(parts[2]),encoder.encode(parts[0]+"."+parts[1]));
  if(!valid)return null;
 }catch{return null;}
 // A Google-signed token alone is a short-lived authorization.
 // For immediate account revocation also use the D1 disabled/revoked flags.
 return{uid:claims.sub,email:claims.email,
  google:claims.firebase?.sign_in_provider==="google.com",emailVerified:true,
  issuedAt:claims.iat,expiresAt:claims.exp};
}
