// Waits until a URL answers with a 2xx status (used to start E2E servers in
// order, playwright.config.ts). Usage: node scripts/wait-for-url.mjs <url> [timeoutMs]
const [url, timeoutArg] = process.argv.slice(2);
if (!url) {
  console.error("Usage: node scripts/wait-for-url.mjs <url> [timeoutMs]");
  process.exit(2);
}
const deadline = Date.now() + Number(timeoutArg ?? 180_000);

while (Date.now() < deadline) {
  try {
    const response = await fetch(url);
    if (response.ok) process.exit(0);
  } catch {
    // Not up yet.
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
console.error(`Timed out waiting for ${url}`);
process.exit(1);
