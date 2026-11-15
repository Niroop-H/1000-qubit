/** Static preflight for the ₹0-upfront Firebase Auth + Cloudflare licensing build.
 * This does NOT check account ownership, Razorpay capture, Store certification,
 * provider support, quota correctness at scale or local algorithm secrecy.
 */
import {existsSync,readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const values={};
const envFile=resolve(root,"apps/web/.env.production.local");
if(existsSync(envFile))for(const line of readFileSync(envFile,"utf8").split(/\r?\n/)){
 const match=/^\s*(VITE_D25_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
 if(match)values[match[1]]=match[2].replace(/^["']|["']$/g,"");
}
const value=key=>process.env[key]||values[key]||"";
const key=value("VITE_D25_FIREBASE_API_KEY"),api=value("VITE_D25_API_BASE");
const requirements=[
 ["Firebase public Web API key",/^AIza[A-Za-z0-9_-]{30,50}$/.test(key)],
 ["Cloudflare Workers licensing API HTTPS URL",/^https:\/\/[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+\.workers\.dev\/v1$/.test(api)],
 ["No Firebase Cloud Functions quantum endpoint",!value("VITE_D25_COMPUTE_API_BASE")]
];
const invalid=requirements.filter(([_,pass])=>!pass).map(([name])=>name);
if(invalid.length){for(const issue of invalid)console.error("D25 NOT READY: "+issue);
 process.exitCode=1;
}else console.log("D25 public Firebase and Cloudflare client configuration formats passed; server acceptance is still required.");
