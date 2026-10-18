# Prompt 07 — Post-launch operations and open verifications

Do not run remote Cloudflare commands, deploy, change account settings, push, commit, add dependencies, download browsers, or enable AI without the owner's explicit approval for that action. Dashboard and Access changes are the owner's steps; describe them, do not perform them.

## Tasks
1. Content publishing: derive the minimum content and a publishing checklist from `docs/SPEC.md` and `docs/DATA_MODEL.md`. The owner enters production content in the admin console. Record a Time Travel bookmark before and after. Verify the public API in `ja`, `en`, and `es`, and run the public journey in a browser. Never load `db/seed/dev.sql` into production.
2. Open deploy-only checks, on preview first: Workers Logs lines for the `disabled` outcome without addresses or answers; the 429 response of `ADMIN_RATE_LIMITER`; rejection of an address outside the Access policy; why the admin Worker's `workers.dev` URL was disabled after Access settings were saved (`docs/DECISIONS.md` "Phase 6 verification log"). Do not deliberately exhaust account-wide free-tier limits.
3. End-to-end tests in CI: prefer the runner's preinstalled Google Chrome over a browser download. Document the duration, caching, failure artifacts, and any download. Pin every action to a full commit SHA (ADR-027).
4. Operations runbook (`docs/OPERATIONS.md`): monitoring, routine checks, incident response, the AI kill switch, backups, and the Workers Logs pricing change on 2026-12-01 (re-check the official page before that date).
5. AI enablement readiness: the status of every precondition in ADR-026 "Stage 5 preparation decisions" A. The owner decides on the Gemma terms of use. Enabling AI in production is out of scope.
6. After any admin Worker deployment, immediately send an unauthenticated request to `/` and `/api/admin/me`; both must redirect to the Access login. On a 200, redeploy at once with `workers_dev: false` and report.

## Acceptance
Every open check is recorded as verified, or as 要確認 with the reason and the next opportunity to verify it. The runbook exists and is dated. Production has published content verified in all three locales and contains no seed data. CI runs E2E, or the reason it does not is recorded. AI stays disabled in all environments.
