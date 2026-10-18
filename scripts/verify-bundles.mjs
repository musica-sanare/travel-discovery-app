// Post-build security checks on the production Worker bundles (run by
// `npm run build`). Fails the build if:
// - the admin Worker bundle contains the local-development identity path, or
//   lacks Access JWT verification;
// - the public Worker or public SPA bundle contains admin API code;
// - the public SPA bundle contains the AI prompt, or the public Worker lacks it
//   (keeps the prompt check meaningful). Must match PROMPT_MARKER in
//   server/ai/prompt.ts.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");

function readAll(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...readAll(full));
    } else if (/\.(js|mjs|html)$/.test(entry)) {
      files.push({ file: path.relative(root, full), text: readFileSync(full, "utf8") });
    }
  }
  return files;
}

const AI_PROMPT_MARKER = "travel-discovery explanation editor";

const checks = [
  {
    dir: "dist-admin/admin_worker",
    mustNotContain: ["ADMIN_DEV_IDENTITY_EMAIL", "local-dev"],
    mustContain: ["Cf-Access-Jwt-Assertion"],
  },
  {
    dir: "dist/worker",
    mustNotContain: ["/api/admin", "ADMIN_DB", "Cf-Access-Jwt-Assertion", "ADMIN_DEV_IDENTITY_EMAIL"],
    mustContain: [AI_PROMPT_MARKER],
  },
  {
    dir: "dist/client",
    mustNotContain: ["/api/admin", "ADMIN_DEV_IDENTITY_EMAIL", AI_PROMPT_MARKER],
    mustContain: [],
  },
];

const failures = [];
for (const check of checks) {
  const files = readAll(path.join(root, check.dir));
  if (files.length === 0) {
    failures.push(`${check.dir}: no build output found`);
    continue;
  }
  for (const needle of check.mustNotContain) {
    for (const { file, text } of files) {
      if (text.includes(needle)) {
        failures.push(`${file}: must not contain "${needle}"`);
      }
    }
  }
  for (const needle of check.mustContain) {
    if (!files.some(({ text }) => text.includes(needle))) {
      failures.push(`${check.dir}: must contain "${needle}"`);
    }
  }
}

if (failures.length > 0) {
  console.error("Bundle verification failed:\n" + failures.map((line) => `  - ${line}`).join("\n"));
  process.exit(1);
}
console.log("Bundle verification passed.");
