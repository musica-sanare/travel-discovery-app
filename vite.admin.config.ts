import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = import.meta.dirname;
// E2E runs share an isolated local D1 state with the public app
// (playwright.config.ts); development uses the regular .wrangler/state.
const e2eStateDir = process.env.E2E_STATE_DIR;
const stateDir = e2eStateDir ?? ".wrangler/state";

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
      persistState: { path: path.resolve(projectRoot, stateDir) },
      // The public dev server uses the default 9229; both can run at once. E2E
      // starts two admin servers at once, so they run without an inspector.
      inspectorPort: e2eStateDir ? false : 9230,
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
