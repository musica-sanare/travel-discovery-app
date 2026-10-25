import type { AiClientLimiter } from "../../worker/ai-client-limiter";

declare global {
  namespace Cloudflare {
    interface Env {
      PUBLIC_DB: D1Database;
      AI_CLIENT_LIMITER: DurableObjectNamespace<AiClientLimiter>;
    }
  }
}
