import type { D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      ADMIN_DB: D1Database;
      MIGRATION_TEST_DB: D1Database;
      TEST_AI_CLIENT_RATE_LIMITER: RateLimit;
      TEST_MIGRATIONS: D1Migration[];
      TEST_SEED_SQL: string;
    }
  }
}
