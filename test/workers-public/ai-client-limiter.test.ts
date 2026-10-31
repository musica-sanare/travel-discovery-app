/** The AI client quota Durable Object of the public Worker (docs/working/DECISIONS.md ADR-029). */
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { clientObjectName, nextUtcMidnight } from "../../server/public/client-quota";
import { app } from "../../worker/index";

const ORIGIN = "https://public.example.test";

async function stubFor(key: string) {
  return env.AI_CLIENT_LIMITER.getByName(await clientObjectName(key));
}

describe("AiClientLimiter", () => {
  it("allows five checks per client in a window and refuses the sixth", async () => {
    const stub = await stubFor("ip4:192.0.2.1");
    const results: boolean[] = [];
    for (let i = 0; i < 6; i += 1) {
      results.push((await stub.check()).success);
    }
    expect(results).toEqual([true, true, true, true, true, false]);
    const refused = await stub.check();
    expect(refused).toMatchObject({ success: false, limit: "window" });
    expect(refused.success ? 0 : refused.retryAt - Date.now()).toBeGreaterThan(0);
    expect((await (await stubFor("ip4:192.0.2.9")).check()).success).toBe(true);
  });

  it("stores counts only, sets an alarm for the next UTC midnight, and deletes everything when it fires", async () => {
    const stub = await stubFor("ip4:192.0.2.2");
    await stub.check();
    await runInDurableObject(stub, async (_instance, state) => {
      const stored = await state.storage.list();
      expect([...stored.keys()]).toEqual(["quota"]);
      expect(Object.keys(stored.get("quota") as object).sort()).toEqual(["dayCount", "utcDay", "windowCount", "windowStart"]);
      expect(JSON.stringify([...stored.values()])).not.toContain("192.0.2.2");
      expect(await state.storage.getAlarm()).toBe(nextUtcMidnight(Date.now()));
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await runInDurableObject(stub, async (_instance, state) => {
      expect((await state.storage.list()).size).toBe(0);
    });
    expect((await stub.check()).success).toBe(true);
  });

  it("refuses the sixth AI request of one address through the public app while AI is disabled", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const request = new Request(`${ORIGIN}/api/ai/explanations`, {
        method: "POST",
        headers: { Origin: ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.3" },
        body: "{}",
      });
      statuses.push((await app.fetch(request, env)).status);
    }
    expect(statuses).toEqual([503, 503, 503, 503, 503, 429, 429]);
    const status = await app.fetch(new Request(`${ORIGIN}/api/ai/status`), env);
    expect(await status.json()).toEqual({ enabled: false });
  });
});
