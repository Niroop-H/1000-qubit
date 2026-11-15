/**
 * Server-only compilation entry. Output MUST NEVER be included in a Tauri,
 * desktop, browser, npm or GitHub release artifact. Private repo required
 * to protect future IP improvements in source control.
 */
import {build} from "esbuild";
import {mkdirSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
mkdirSync(resolve(root,"functions"),{recursive:true});
await build({
 entryPoints:[resolve(root,"apps/engine/src/studio/enterprise.ts")],
 outfile:resolve(root,"functions/private-engine.cjs"),
 platform:"node",format:"cjs",target:["node22"],bundle:true,
 packages:"external",minify:false,sourcemap:false,
 legalComments:"none",
 banner:{js:"// D25 MAH Quantum server-only engine. NEVER DISTRIBUTE TO DESKTOP."}
});
console.log("Built server-only engine binary in functions/private-engine.cjs");
