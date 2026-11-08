import { DurableObject } from "cloudflare:workers";
import {
  AI_CLIENT_QUOTA,
  AI_GLOBAL_DAILY_CAP,
  applyGlobalCap,
  applyQuota,
  nextUtcMidnight,
  type GlobalCapState,
  type GlobalDecision,
  type QuotaDecision,
  type QuotaState,
} from "../server/public/client-quota";

const STATE_KEY = "quota";
const GLOBAL_STATE_KEY = "global";

/**
 * AI quota object (docs/working/DECISIONS.md ADR-029). One instance per
 * rate-limit key runs `check`; one instance named GLOBAL_OBJECT_NAME runs
 * `checkGlobal` for the app-wide daily cap. Reusing the class needs no
 * Wrangler migration. Counts are kept in the object's SQLite storage because
 * in-memory state is lost when an idle object hibernates; an alarm deletes
 * them at the next UTC midnight.
 */
export class AiClientLimiter extends DurableObject {
  async check(): Promise<QuotaDecision> {
    const now = Date.now();
    const previous = (await this.ctx.storage.get<QuotaState>(STATE_KEY)) ?? null;
    const result = applyQuota(previous, now, AI_CLIENT_QUOTA);
    if (!result.allowed) {
      return { success: false, ...result.refusal };
    }
    const { state } = result;
    await this.ctx.storage.put(STATE_KEY, state);
    if (previous?.utcDay !== state.utcDay) {
      await this.ctx.storage.setAlarm(nextUtcMidnight(now));
    }
    return { success: true };
  }

  async checkGlobal(): Promise<GlobalDecision> {
    const now = Date.now();
    const previous = (await this.ctx.storage.get<GlobalCapState>(GLOBAL_STATE_KEY)) ?? null;
    const result = applyGlobalCap(previous, now, AI_GLOBAL_DAILY_CAP);
    if (!result.allowed) {
      return { success: false, retryAt: result.retryAt };
    }
    await this.ctx.storage.put(GLOBAL_STATE_KEY, result.state);
    if (previous?.utcDay !== result.state.utcDay) {
      await this.ctx.storage.setAlarm(nextUtcMidnight(now));
    }
    return { success: true };
  }

  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
