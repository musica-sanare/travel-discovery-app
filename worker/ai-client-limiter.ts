import { DurableObject } from "cloudflare:workers";
import { AI_CLIENT_QUOTA, applyQuota, nextUtcMidnight, type QuotaState } from "../server/public/client-quota";

const STATE_KEY = "quota";

/**
 * One instance per rate-limit key (docs/working/DECISIONS.md ADR-029). Counts
 * are kept in the object's SQLite storage because in-memory state is lost when
 * an idle object hibernates; an alarm deletes them at the next UTC midnight.
 */
export class AiClientLimiter extends DurableObject {
  async check(): Promise<{ success: boolean }> {
    const now = Date.now();
    const previous = (await this.ctx.storage.get<QuotaState>(STATE_KEY)) ?? null;
    const { allowed, state } = applyQuota(previous, now, AI_CLIENT_QUOTA);
    if (allowed) {
      await this.ctx.storage.put(STATE_KEY, state);
      if (previous?.utcDay !== state.utcDay) {
        await this.ctx.storage.setAlarm(nextUtcMidnight(now));
      }
    }
    return { success: allowed };
  }

  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
