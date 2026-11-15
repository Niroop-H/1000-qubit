/**
 * Fail-closed static review of commercial Windows frontend payload.
 * This is not DRM or general mathematical certification.
 */
import {existsSync,readdirSync,readFileSync} from "node:fs";
import {resolve,relative,extname} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const out=resolve(root,"apps/web/dist-desktop");
const report=[];
const check=(name,pass,details)=>{report.push({name,pass,details});if(!pass)process.exitCode=1;};
function walk(p){if(!existsSync(p))return [];
 return readdirSync(p,{withFileTypes:true}).flatMap(e=>{
  const n=resolve(p,e.name);return e.isDirectory()?walk(n):e.isFile()?[n]:[];
 });
}
const files=walk(out),js=files.filter(f=>extname(f)===".js");
check("DIST_EXISTS",existsSync(resolve(out,"index.html"))&&js.length>0,
 "Expected isolated commercial index.html and bundled JavaScript.");
const forbidden=files.filter(f=>/\.(?:map|ts|tsx|key|pem|pfx)$/i.test(f)||/\.worker\./i.test(f));
check("NO_SOURCE_FILES_OR_WORKERS",forbidden.length===0,
 forbidden.map(f=>relative(out,f)).join(", ")||"No development code, source maps, keys or simulation workers.");
const text=js.map(p=>readFileSync(p,"utf8")).join("\n");
const knownSolverMarkers=["simulateScalable","QuantumCircuit",
 "stabilizer-tableau","industrial-research.worker",
 "NoiseEngine","simulate("];
// Some generic strings can appear in legitimate UX; these markers may not.
const found=knownSolverMarkers.filter(marker=>text.includes(marker));
check("NO_SOLVER_MARKERS",found.length===0,
 found.length?found.join(", "):"No identified proprietary solver code in the commercial bundle.");
const html=existsSync(resolve(out,"index.html"))?readFileSync(resolve(out,"index.html"),"utf8"):"";
check("COMMERCE_ONLY_ENTRY",html.includes("D25 Quantum Workspace")&&
 !/src\/main\.tsx|simulator\.worker|LargeQuantum/.test(html),
 "Commercial entry point is separate from development web frontend.");
console.log(JSON.stringify({schema:"D25-Commercial-Bundle-Gate/v1",results:report},null,2));
if(process.exitCode)console.error("Commercial bundle rejected: local engine disclosure or missing assets.");
