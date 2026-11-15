import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Avoid shipping development source maps in commercial desktop builds.
  // This does NOT conceal the executable JavaScript and is not DRM.
  build: { sourcemap: false, minify: "esbuild" },
  server: {
    port: 3000
  }
});
