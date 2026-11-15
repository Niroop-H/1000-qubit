/** D25 LOCAL desktop asset gate; verifies actual CPU simulator assets exist.
 * Source isolation is impossible for a client-delivered JavaScript engine.
 * This test does not certify intellectual-property secrecy or DRM.
 */
import {existsSync,readdirSync,readFileSync} from "node:fs";
import {resolve,relative,extname} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const dir=resolve(root,"apps/web/dist-desktop");
function walk(p){if(!existsSync(p))return [];return readdirSync(p,{withFileTypes:true}).flatMap(e=>{
 const file=resolve(p,e.name);return e.isDirectory()?walk(file):e.isFile()?[file]:[];
});}
const files=walk(dir),js=files.filter(f=>extname(f)===".js");
const outcomes=[];
function test(name,pass,detail){outcomes.push({name,pass,detail});if(!pass)process.exitCode=1;}
test("DESKTOP_ASSETS",existsSync(resolve(dir,"index.html"))&&js.length>2,"Local workstation chunks exist.");
const forbidden=files.filter(f=>/\.(?:map|ts|tsx|key|pem|pfx)$/i.test(f)||/[/\\]\.env/i.test(f));
test("NO_DEBUG_SOURCE_FILES",!forbidden.length,forbidden.map(f=>relative(dir,f)).join(", ")||"No raw TypeScript, source maps, secrets or keys.");
const workers=files.filter(f=>/worker[^/\\]*\.js$/i.test(f));
test("LOCAL_QUANTUM_WORKERS",workers.length>=2,
 workers.length+" bundled worker scripts for customer-side simulation.");
const jsContents=js.map(f=>readFileSync(f,"utf8")).join("\n");
test("NO_EMBEDDED_RAZORPAY_KEYS",!/rzp_(?:test|live)_[A-Za-z0-9]{6,}/.test(jsContents),"No Razorpay merchant keys in the client bundle.");
test("NO_CLOUD_SOLVER_REQUIRED",!jsContents.includes("D25-Protected-Compute-Result/v1"),
 "Local desktop does not depend on the retired Firebase cloud-simulation result contract.");
const entry=readFileSync(resolve(dir,"index.html"),"utf8");
test("LOCAL_WORKBENCH_ENTRY",entry.includes("D25 Quantum Workspace")&&!entry.includes("src/secure/main.tsx"),
 "Separate local-first desktop entry point.");
console.log(JSON.stringify({schema:"D25-Local-Bundle-Gate/v1",results:outcomes},null,2));
if(process.exitCode)console.error("D25 local desktop bundle rejected.");
