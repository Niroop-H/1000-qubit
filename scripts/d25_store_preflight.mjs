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
check("NO_LOCAL_SOLVER_IN_DESKTOP",commercial&&!files.some(f=>/worker/i.test(f)), "Commercial desktop uses isolated frontend and contains no simulator workers.");
blocked("PRIVATE_SOURCE_REPOSITORY","Original simulator code remains in a public GitHub repository, irrespective of what desktop packaging excludes.","Move future confidential IP work to a private repository; audit public forks/copies and avoid putting private engine code into customer artifacts.");
blocked("PROTECTED_COMPUTE_DEPLOYMENT","An authenticated Firebase compute function is staged, but not deployed against validated customer entitlements or independently penetration-tested.","Deploy to a dedicated protected Firebase project; validate payer/license checks and durable quotas end-to-end against real test subscriptions.");
blocked("PAYMENT_AND_QUOTA_ACCEPTANCE","The commercial build uses server-side subscription authorization and Firestore quota reservations, but actual test-mode integration has not been accepted.","Test active/expired/refunded license denial, real-provider webhooks, concurrent account quotas, retries, and cancellation on a deployed Firebase project.");
blocked("INDEPENDENT_QUALIFICATION","CI and numerical regression checks do not externally certify all scientific, security or equipment claims.","Complete versioned independent solver validation, real-device commissioning as applicable and performance/stability testing.");
blocked("MICROSOFT_STORE_APPROVAL","Partner Center identity, Store listing, WACK checks, Windows installation and Store certification are not verified.","Verify real identity/publisher, use compliant package, run certification and staged rollout.");
blocked("SCALE_AND_SUPPORT","There is no durable multi-user licensed metering, distribution-accurate abuse prevention or proven commercial operations SLA.","Implement durable accounts/quotas, monitoring, incident response, license support and recovery.");
const report={schema:"D25-Store-Preflight/v1",product:"D25 Quantum Workspace",parentCompany:"MAH Quantum",division:"Devashri S Industries",utc:new Date().toISOString(),verdict:findings.every(f=>f.status==="PASS")?"GO":"NO_GO",findings};
mkdirSync(resolve(root,"artifacts"),{recursive:true});
writeFileSync(resolve(root,"artifacts/d25-store-preflight.json"),JSON.stringify(report,null,2)+"\n");
for(const f of findings)console.log(f.status+" "+f.id+" "+(f.details||f.why));
console.log("D25 STORE RELEASE VERDICT: "+report.verdict);
if(findings.some(f=>f.status==="FAIL")||(process.argv.includes("--enforce")&&report.verdict!=="GO"))process.exitCode=1;
