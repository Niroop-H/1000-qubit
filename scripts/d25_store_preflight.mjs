/** D25 Store preflight: passes build hygiene without claiming release fitness. */
import {readFileSync,readdirSync,existsSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve,relative,extname} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const bundle=resolve(root,"apps/web/dist-desktop");
const findings=[];
const check=(id,ok,details)=>findings.push({id,status:ok?"PASS":"FAIL",details});
const blocked=(id,why,requirement)=>findings.push({id,status:"BLOCKED",why,requirement});
function walk(dir){
 if(!existsSync(dir))return [];
 return readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
  const p=resolve(dir,e.name);
  return e.isDirectory()?walk(p):e.isFile()?[p]:[];
 });
}
const cfg=JSON.parse(readFileSync(resolve(root,"src-tauri/tauri.conf.json"),"utf8"));
const files=walk(bundle);
check("BRANDING",cfg.productName==="D25 Quantum Workspace"&&cfg.bundle?.publisher==="MAH Quantum"&&cfg.bundle?.shortDescription?.includes("Devashri S Industries"),"D25 Quantum Workspace by Devashri S Industries; MAH Quantum is parent.");
const csp=cfg.app?.security?.csp;
check("NATIVE_CSP",!!csp&&csp["default-src"]==="'self'"&&csp["object-src"]==="'none'"&&!String(csp["script-src"]).includes("unsafe-eval"),"Tauri CSP is configured with restricted scripts and no object elements.");
check("WEB_BUNDLE_EXISTS",files.some(p=>p.endsWith("index.html"))&&files.some(p=>extname(p)===".js"),"Release Vite HTML/JavaScript exists.");
const forbidden=files.filter(p=>/\.(map|ts|tsx|pem|pfx|key)$/i.test(p)||/(?:^|[\\/])\.env[^\\/]*$/i.test(p)).map(p=>relative(bundle,p));
check("NO_DEBUG_SOURCES_OR_KEYS",forbidden.length===0,forbidden.length?"Unexpected files: "+forbidden.join(", "):"No maps, raw TS/TSX or private key files in web dist.");
const maps=files.filter(p=>p.endsWith(".js")&&/\/\/[#@]\s*sourceMappingURL=/.test(readFileSync(p,"utf8"))).map(p=>relative(bundle,p));
check("NO_SOURCE_MAP_REFERENCES",maps.length===0,maps.length?maps.join(", "):"No bundled sourceMappingURL comments.");
const commercial=readFileSync(resolve(root,"src-tauri/tauri.conf.json"),"utf8").includes("../apps/web/dist-desktop");
check("LOCAL_SIMULATOR_PACKAGED",commercial&&files.some(f=>/worker/i.test(f)),
 "D25 runs the supported scientific models on customer PC CPU/RAM; licensing calls only use Cloudflare.");
blocked("PRIVATE_SOURCE_REPOSITORY","Original simulator code remains in a public GitHub repository, irrespective of what desktop packaging excludes.","Move future confidential IP work to a private repository; audit public forks/copies and avoid putting private engine code into customer artifacts.");
blocked("LOCAL_SOURCE_EXTRACTION","JavaScript quantum workers are shipped on customer computers. Users can extract and reverse-engineer algorithms despite minification.","Port valuable unpublished solver IP to native Rust/WASM, assess third-party reverse engineering, or accept the limitations of local compute; unbreakable copy prevention is impossible.");
blocked("CLOUDFLARE_LICENSE_DEPLOYMENT","Cloudflare Workers Free + D1 licensing implementation is staged, not deployed to the user's Cloudflare account.","Create a D1 database on the free plan; configure Firebase project and Razorpay TEST secrets; deploy and acceptance-test the Worker.");
blocked("PAYMENT_AND_QUOTA_ACCEPTANCE","The commercial desktop has client-side controls and a Cloudflare D1 metering design, but no real deployed verified payment or adversarial license-bypass acceptance.","Test real TEST-mode Razorpay subscriptions, webhooks, refunds, cross-device quotas and offline/client-patching scenarios.");
blocked("INDEPENDENT_QUALIFICATION","CI and numerical regression checks do not externally certify all scientific, security or equipment claims.","Complete versioned independent solver validation, real-device commissioning as applicable and performance/stability testing.");
blocked("MICROSOFT_STORE_APPROVAL","Partner Center identity, Store listing, WACK checks, Windows installation and Store certification are not verified.","Verify real identity/publisher, use compliant package, run certification and staged rollout.");
blocked("SCALE_AND_SUPPORT","D1 quota operations are designed for atomicity, but production load limits, failure recovery, customer support and incident response are not yet tested.","Test concurrent launch reservations, D1 free-tier limits, monitoring and support/recovery processes.");
const report={schema:"D25-Store-Preflight/v1",product:"D25 Quantum Workspace",parentCompany:"MAH Quantum",division:"Devashri S Industries",utc:new Date().toISOString(),verdict:findings.every(f=>f.status==="PASS")?"GO":"NO_GO",findings};
mkdirSync(resolve(root,"artifacts"),{recursive:true});
writeFileSync(resolve(root,"artifacts/d25-store-preflight.json"),JSON.stringify(report,null,2)+"\n");
for(const f of findings)console.log(f.status+" "+f.id+" "+(f.details||f.why));
console.log("D25 STORE RELEASE VERDICT: "+report.verdict);
if(findings.some(f=>f.status==="FAIL")||(process.argv.includes("--enforce")&&report.verdict!=="GO"))process.exitCode=1;
