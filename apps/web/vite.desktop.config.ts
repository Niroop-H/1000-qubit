import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
const here=fileURLToPath(new URL(".",import.meta.url));
const desktopRoot=resolve(here,"desktop");
export default defineConfig({
 root:desktopRoot,envDir:here,plugins:[
  react(),
  {name:"d25-block-local-solver-from-commercial-artifact",generateBundle(){
   const blocked=[...this.getModuleIds()].filter(id=>
    /[\\/]apps[\\/]engine[\\/]src[\\/]/i.test(id)||
    /(?:simulator|large|inspector|industrial-research)\.worker\.ts(?:$|\?)/i.test(id)||
    /[\\/]apps[\\/]web[\\/]src[\\/](?:App|LargeQuantum|Landing)\.tsx/i.test(id));
   if(blocked.length)this.error("CONFIDENTIAL ENGINE IN DESKTOP BUILD: "+blocked.join(", "));
  }}
 ],
 build:{outDir:resolve(here,"dist-desktop"),emptyOutDir:true,
  sourcemap:false,minify:"esbuild",rollupOptions:{input:resolve(desktopRoot,"index.html")}},
 server:{port:3000,strictPort:true}
});
