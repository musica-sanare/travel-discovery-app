/**
 * Entry point for `npm run quiz:simulate` only
 * (prompts/15-question-selection-and-early-stopping.md task 2). Prints the
 * quiz-quality report for the newest bundle (or `QUIZ_SIMULATE_BUNDLES`) with
 * the current selection rule. Never part of `npm test` or `npm run check`.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { expect, test } from "vitest";
import { nextQuestion } from "../../domain/diagnosis";
import { DEFAULT_QUIZ_SETTINGS } from "../../shared/quiz-settings";
import { DEFAULT_QUALITY, evaluateQuizQuality, formatQualityReport, timePolicy, type QualityOptions } from "./quiz-quality";
import { toSimulationContent, type SimulationBundle } from "./quiz-variety";

const contentDir = path.resolve(import.meta.dirname, "../../content");

function bundleNames(): string[] {
  const requested = process.env.QUIZ_SIMULATE_BUNDLES?.split(",").map((name) => name.trim()).filter(Boolean);
  if (requested && requested.length > 0) return requested;
  const all = readdirSync(contentDir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  return all.slice(-1);
}

/** Primary scenario on two master seeds, then the noise and skip sensitivity runs. */
const SCENARIOS: Pick<QualityOptions, "masterSeed" | "behaviour">[] = [
  { masterSeed: DEFAULT_QUALITY.masterSeed, behaviour: DEFAULT_QUALITY.behaviour },
  { masterSeed: DEFAULT_QUALITY.masterSeed + 1, behaviour: DEFAULT_QUALITY.behaviour },
  { masterSeed: DEFAULT_QUALITY.masterSeed, behaviour: { noise: 0, skipRate: 0 } },
  { masterSeed: DEFAULT_QUALITY.masterSeed, behaviour: { noise: 0.25, skipRate: 0 } },
];

test("evaluate quiz quality with simulated respondents", () => {
  for (const name of bundleNames()) {
    const content = toSimulationContent(
      JSON.parse(readFileSync(path.join(contentDir, name), "utf8")) as SimulationBundle,
    );
    for (const family of ["sparse", "anchored"] as const) {
      for (const scenario of SCENARIOS) {
        const options: QualityOptions = {
          ...DEFAULT_QUALITY,
          ...scenario,
          family,
          limits: DEFAULT_QUIZ_SETTINGS,
          policy: nextQuestion,
        };
        const report = evaluateQuizQuality(content, options);
        console.info(formatQualityReport(`${name} current rule`, options, report));
        expect(report.respondents).toBe(options.respondents);
      }
    }
    const timing = timePolicy(
      content,
      { ...DEFAULT_QUALITY, family: "sparse", limits: DEFAULT_QUIZ_SETTINGS, policy: nextQuestion },
      200,
      () => performance.now(),
    );
    console.info(
      `${name} current rule: one selection step median ${timing.median.toFixed(1)} µs, ` +
        `p99 ${timing.p99.toFixed(1)} µs over ${String(timing.calls)} calls (Node, this machine)`,
    );
  }
}, 120_000);
