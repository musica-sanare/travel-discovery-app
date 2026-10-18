/** Keeps the bundle check's copy of the prompt marker in sync with the prompt. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { PROMPT_MARKER } from "../../server/ai/prompt";

it("scripts/verify-bundles.mjs uses the current prompt marker", () => {
  const script = readFileSync(path.resolve(import.meta.dirname, "../../scripts/verify-bundles.mjs"), "utf8");
  expect(script).toContain(`const AI_PROMPT_MARKER = ${JSON.stringify(PROMPT_MARKER)};`);
});
