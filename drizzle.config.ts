import { defineConfig } from "drizzle-kit";

// drizzle-kit only generates SQL migration files from the schema. Migrations
// are applied with `wrangler d1 migrations apply` (see docs/DEVELOPMENT.md);
// drizzle-kit is never connected to a remote database.
export default defineConfig({
  dialect: "sqlite",
  schema: "./server/db/schema.ts",
  out: "./migrations",
});
