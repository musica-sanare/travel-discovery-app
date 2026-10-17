import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Setup files run before each test file; applyD1Migrations skips migrations
// that were already applied.
await applyD1Migrations(env.ADMIN_DB, env.TEST_MIGRATIONS);
