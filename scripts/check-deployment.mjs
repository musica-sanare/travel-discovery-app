// Unauthenticated checks of a deployed environment (docs/DEPLOYMENT.md
// "6. Checks after each deployment", docs/OPERATIONS.md "3. Routine checks").
// Sends only anonymous GET/POST/DELETE requests; never signs in or changes data.
//
// Usage: node scripts/check-deployment.mjs <account subdomain> <preview|production> [--watch-admin <seconds>]
// --watch-admin repeats the admin Access checks every 10 s for that long (use it
// right after deploying an admin Worker). Exits 1 if any check fails.
const WORKERS = {
  preview: { public: "travel-discovery-preview", admin: "travel-discovery-admin-preview" },
  production: { public: "travel-discovery", admin: "travel-discovery-admin" },
};
const LOCALES = ["ja", "en", "es"];
const ADMIN_PATHS = ["/", "/destinations", "/api/admin/me"];

const [subdomain, environment, flag, seconds] = process.argv.slice(2);
const workers = WORKERS[environment];
if (!subdomain || !workers || (flag !== undefined && (flag !== "--watch-admin" || !(Number(seconds) > 0)))) {
  console.error("Usage: node scripts/check-deployment.mjs <account subdomain> <preview|production> [--watch-admin <seconds>]");
  process.exit(2);
}
const publicBase = `https://${workers.public}.${subdomain}.workers.dev`;
const adminBase = `https://${workers.admin}.${subdomain}.workers.dev`;

let failures = 0;
function report(ok, name, detail) {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` (${detail})`}`);
}

async function request(url, init = {}) {
  return fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000), ...init });
}

async function expectStatus(name, url, status, init) {
  try {
    const response = await request(url, init);
    report(response.status === status, name, `status ${response.status}, expected ${status}`);
    return response;
  } catch (error) {
    report(false, name, error instanceof Error ? error.message : String(error));
    return undefined;
  }
}

async function checkPublic() {
  const health = await expectStatus("public /api/health 200", `${publicBase}/api/health`, 200);
  if (health) {
    report(health.headers.get("cache-control") === "no-store", "public API Cache-Control no-store", health.headers.get("cache-control"));
  }
  for (const locale of LOCALES) {
    const response = await expectStatus(`public /api/destinations ${locale} 200`, `${publicBase}/api/destinations?locale=${locale}`, 200);
    if (response) {
      const body = await response.json().catch(() => null);
      const count = Array.isArray(body?.items) ? body.items.length : -1;
      report(count >= 0, `public /api/destinations ${locale} has items (${count})`, "no items array");
    }
  }
  await expectStatus("public /api/questions 200", `${publicBase}/api/questions`, 200);
  await expectStatus("public /api/diagnosis-content 200", `${publicBase}/api/diagnosis-content`, 200);
  for (const path of ["/", "/results"]) {
    const page = await expectStatus(`public ${path} 200`, `${publicBase}${path}`, 200);
    if (page) {
      for (const header of ["content-security-policy", "x-content-type-options", "referrer-policy", "permissions-policy"]) {
        report(page.headers.has(header), `public ${path} ${header}`, "missing");
      }
    }
  }
  await expectStatus("public /api/admin/me 404", `${publicBase}/api/admin/me`, 404);
  await expectStatus("public DELETE /api/destinations 405", `${publicBase}/api/destinations`, 405, { method: "DELETE" });
  const aiInit = (origin) => ({
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: "{}",
  });
  const ai = await expectStatus("public AI same-origin 503 (AI disabled)", `${publicBase}/api/ai/explanations`, 503, aiInit(publicBase));
  if (ai) {
    const body = await ai.json().catch(() => null);
    report(body?.error === "ai_unavailable", "public AI error code ai_unavailable", JSON.stringify(body));
  }
  await expectStatus("public AI cross-origin 403", `${publicBase}/api/ai/explanations`, 403, aiInit("https://example.com"));
}

async function checkAdmin(label) {
  for (const path of ADMIN_PATHS) {
    try {
      const response = await request(`${adminBase}${path}`);
      const location = response.headers.get("location") ?? "";
      const redirected = response.status === 302 && /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com\//.test(location);
      report(redirected, `${label}admin ${path} redirects to Access`, `status ${response.status}`);
      if (response.status === 200) {
        console.log("ALERT admin Worker answers without Access: follow docs/OPERATIONS.md 4.2 now.");
      }
    } catch (error) {
      report(false, `${label}admin ${path} redirects to Access`, error instanceof Error ? error.message : String(error));
    }
  }
}

await checkPublic();
await checkAdmin("");
if (flag === "--watch-admin") {
  const rounds = Math.ceil(Number(seconds) / 10);
  for (let round = 1; round <= rounds; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    await checkAdmin(`[${round * 10}s] `);
  }
}
console.log(failures === 0 ? "All checks passed." : `${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
