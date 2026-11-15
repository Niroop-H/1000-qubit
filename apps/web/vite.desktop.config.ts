import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
const here=fileURLToPath(new URL(".",import.meta.url));
const desktopRoot=resolve(here,"desktop");
export default defineConfig({
 root:desktopRoot,envDir:here,plugins:[react()],
 build:{outDir:resolve(here,"dist-desktop"),emptyOutDir:true,
  sourcemap:false,minify:"esbuild",rollupOptions:{input:resolve(desktopRoot,"index.html")}},
 server:{port:3000,strictPort:true}
});
