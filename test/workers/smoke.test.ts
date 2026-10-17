import { env } from "cloudflare:workers";
import { expect, it } from "vitest";

it("applies migrations to the test database", async () => {
  const result = await env.ADMIN_DB.prepare(
    "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'destinations'",
  ).first<{ n: number }>();
  expect(result?.n).toBe(1);
});
