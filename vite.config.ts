import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// E2E runs use an isolated local D1 state so they never touch development
// data (playwright.config.ts, docs/en/DEVELOPMENT.md "End-to-end tests").
const e2eStateDir = process.env.E2E_STATE_DIR;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({
      viteEnvironment: { name: "worker" },
      ...(e2eStateDir ? { persistState: { path: path.resolve(import.meta.dirname, e2eStateDir) } } : {}),
    }),
  ],
  environments: {
    worker: {
      build: { sourcemap: true },
    },
  },
});
