import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The Cloudflare Vite plugin is intentionally excluded here. Unit tests run in
// Node (or jsdom via a per-file environment comment); Workers-runtime tests
// will be added with @cloudflare/vitest-plugin when D1 bindings arrive.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.{ts,tsx}", "worker/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
  },
});
