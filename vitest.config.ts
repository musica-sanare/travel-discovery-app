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

// The model evaluation calls real Workers AI models and consumes Neurons, so
// its project exists only under `npm run ai:eval` (docs/working/AI_EVALUATION.md).
const aiEvaluationProjects =
  process.env.npm_lifecycle_event === "ai:eval"
    ? [{ test: { name: "ai-eval", include: ["test/ai-eval/**/*.eval.ts"], environment: "node" } }]
    : [];

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
              // Simulated Rate Limiting binding with the deployed AI client
              // settings, for test/workers/ai-explanations.test.ts. Test-only:
              // wrangler.jsonc keeps ratelimits out of its top level (ADR-026 C).
              ratelimits: { TEST_AI_CLIENT_RATE_LIMITER: { namespace_id: "9001", simple: { limit: 5, period: 60 } } },
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
      ...aiEvaluationProjects,
    ],
  },
});
