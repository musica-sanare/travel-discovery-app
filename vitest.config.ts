import { readFileSync } from "node:fs";
import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Two projects:
// - "unit": React/i18n and Node-side checks (Node, or jsdom via a per-file
//   environment comment).
// - "workers": Worker and database tests inside the Workers runtime (workerd)
//   with a local, migrated D1 database.
const adminD1Databases = { ADMIN_DB: "local-travel-discovery" };

export default defineConfig({
  test: {
    restoreMocks: true,
    projects: [
      {
        plugins: [react()],
        test: {
          name: "unit",
          include: [
            "src/**/*.test.{ts,tsx}",
            "admin/src/**/*.test.{ts,tsx}",
            "domain/**/*.test.ts",
            "test/node/**/*.test.ts",
          ],
          environment: "node",
        },
      },
      {
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: "./wrangler.admin.jsonc" },
            miniflare: {
              // Empty database for migration tests (test/workers/migration.test.ts);
              // added alongside the ADMIN_DB binding from wrangler.admin.jsonc.
              d1Databases: { ...adminD1Databases, MIGRATION_TEST_DB: "migration-test" },
              bindings: {
                TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "migrations")),
                TEST_SEED_SQL: readFileSync(path.join(import.meta.dirname, "db/seed/dev.sql"), "utf8"),
              },
            },
          })),
        ],
        test: {
          name: "workers",
          include: ["test/workers/**/*.test.ts"],
          setupFiles: ["./test/workers/setup.ts"],
        },
      },
    ],
  },
});
