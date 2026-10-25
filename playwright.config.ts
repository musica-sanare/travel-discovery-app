import { defineConfig, devices } from "@playwright/test";

const PORT = 4180;
/** Admin dev server with the local E2E identity (allowed paths). */
export const ADMIN_DEV_PORT = 4181;
/** Admin production build (denied paths: no Access JWT, so every API call is 403). */
export const ADMIN_PREVIEW_PORT = 4182;
const STATE_DIR = ".wrangler/e2e/state";
const publicHealth = `http://localhost:${String(PORT)}/api/health`;

// Local runs use the installed Google Chrome (`channel: "chrome"`), so no
// browser download is needed. Set PLAYWRIGHT_CHANNEL=bundled to use
// Playwright's own Chromium after `npx playwright install chromium`
// (docs/en/DEVELOPMENT.md "End-to-end tests").
const browser = process.env.PLAYWRIGHT_CHANNEL === "bundled" ? {} : { channel: "chrome" };

export default defineConfig({
  testDir: "e2e",
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    locale: "ja-JP",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", testIgnore: /admin\.spec\.ts/, use: { ...devices["Desktop Chrome"], ...browser } },
    { name: "mobile", testIgnore: /admin\.spec\.ts/, use: { ...devices["Pixel 7"], ...browser } },
    {
      // Runs after the public projects because it publishes and archives content
      // in the shared E2E database.
      name: "admin",
      testMatch: /admin\.spec\.ts/,
      dependencies: ["desktop", "mobile"],
      use: { ...devices["Desktop Chrome"], ...browser, baseURL: `http://localhost:${String(ADMIN_DEV_PORT)}` },
    },
  ],
  // Servers start together; the admin servers wait for the public server, whose
  // command recreates the shared E2E database first.
  webServer: [
    {
      // Production build served by the Workers runtime, with security headers
      // and an isolated, freshly seeded local D1 database.
      command: `npm run e2e:db && vite build && vite preview --port ${String(PORT)} --strictPort`,
      env: { E2E_STATE_DIR: STATE_DIR },
      url: publicHealth,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `node scripts/wait-for-url.mjs ${publicHealth} && vite --config vite.admin.config.ts --port ${String(ADMIN_DEV_PORT)} --strictPort`,
      env: { E2E_STATE_DIR: STATE_DIR, CLOUDFLARE_ENV: "e2e" },
      url: `http://localhost:${String(ADMIN_DEV_PORT)}/api/admin/me`,
      reuseExistingServer: false,
      timeout: 240_000,
    },
    {
      command: `node scripts/wait-for-url.mjs ${publicHealth} && vite build --config vite.admin.config.ts && vite preview --config vite.admin.config.ts --port ${String(ADMIN_PREVIEW_PORT)} --strictPort`,
      env: { E2E_STATE_DIR: STATE_DIR },
      url: `http://localhost:${String(ADMIN_PREVIEW_PORT)}/`,
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
