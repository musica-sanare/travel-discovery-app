import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = import.meta.dirname;

// Admin SPA + admin Worker. Built separately from the public app so the public
// bundle and Worker never contain admin code (ADR-004).
export default defineConfig({
  root: path.join(projectRoot, "admin"),
  plugins: [
    react(),
    cloudflare({
      configPath: path.join(projectRoot, "wrangler.admin.jsonc"),
      viteEnvironment: { name: "admin_worker" },
      // Share local D1 state with the public Worker and the wrangler CLI.
      persistState: { path: path.join(projectRoot, ".wrangler/state") },
      // The public dev server uses the default 9229; both can run at once.
      inspectorPort: 9230,
    }),
  ],
  environments: {
    admin_worker: {
      build: { sourcemap: true },
    },
  },
  build: {
    outDir: path.join(projectRoot, "dist-admin"),
    emptyOutDir: true,
  },
  server: { port: 5174, strictPort: true },
  preview: { port: 4174, strictPort: true },
});
