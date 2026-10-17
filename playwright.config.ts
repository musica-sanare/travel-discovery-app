import { defineConfig, devices } from "@playwright/test";

const PORT = 4180;

// Local runs use the installed Google Chrome (`channel: "chrome"`), so no
// browser download is needed. Set PLAYWRIGHT_CHANNEL=bundled to use
// Playwright's own Chromium after `npx playwright install chromium`
// (docs/DEVELOPMENT.md "End-to-end tests").
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
    { name: "desktop", use: { ...devices["Desktop Chrome"], ...browser } },
    { name: "mobile", use: { ...devices["Pixel 7"], ...browser } },
  ],
  webServer: {
    // Production build served by the Workers runtime, with security headers
    // and an isolated, freshly seeded local D1 database.
    command: `npm run e2e:db && vite build && vite preview --port ${String(PORT)} --strictPort`,
    env: { E2E_STATE_DIR: ".wrangler/e2e/state" },
    url: `http://localhost:${String(PORT)}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
