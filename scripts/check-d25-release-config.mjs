/**
 * Commercial D25 release config preflight.
 * Reads PUBLIC-only Vite config from apps/web/.env.production.local or process.env.
 * Never reads privileged Firebase service-account or Razorpay secrets.
 * Development CI can package an unconfigured disabled shell; for customer builds
 * run this check first and require every public endpoint to match one project.
 */
import {existsSync,readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const envFile=resolve(root,"apps/web/.env.production.local");
const env={};
if(existsSync(envFile)){
 for(const line of readFileSync(envFile,"utf8").split(/\r?\n/)){
  const match=/^\s*(VITE_D25_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
  if(!match)continue;
  let value=match[2].trim();
  if((value.startsWith('"')&&value.endsWith('"'))||
     (value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
  env[match[1]]=value;
 }
}
const val=(key)=>process.env[key]||env[key]||"";
const firebaseKey=val("VITE_D25_FIREBASE_API_KEY");
const billing=val("VITE_D25_API_BASE");
const compute=val("VITE_D25_COMPUTE_API_BASE");
const required=[
 ["Firebase public Web API key",/^AIza[A-Za-z0-9_-]{30,50}$/.test(firebaseKey)],
 ["Firebase billing function",/^https:\/\/[a-z0-9-]+\.cloudfunctions\.net\/d25Api$/.test(billing)],
 ["Firebase protected compute function",/^https:\/\/[a-z0-9-]+\.cloudfunctions\.net\/d25Compute$/.test(compute)]
];
function hostOf(url){try{return new URL(url).hostname}catch{return""}}
const names=[hostOf(billing),hostOf(compute)];
required.push(["Both backend functions use the same Firebase project",!!names[0]&&names[0]===names[1]]);
const issues=required.filter(([label,pass])=>!pass).map(([label])=>label);
if(issues.length){
 for(const issue of issues)console.error("D25 COMMERCIAL RELEASE BLOCKED: "+issue+" is not configured/valid.");
 console.error("Set public configuration in apps/web/.env.production.local, then deploy and test the backend.");
 process.exitCode=1;
}else{
 console.log("Commercial frontend public configuration passes static checks.");
 console.log("This is NOT a live Firebase, Razorpay, Store or paid-entitlement acceptance test.");
}
