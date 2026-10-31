/**
 * Entry point for `npm run quiz:simulate` only (prompts/12-attributes-and-questions.md
 * task 1). Prints the quiz-variety report for each bundle named in
 * `QUIZ_SIMULATE_BUNDLES` (comma-separated file names in content/; default:
 * the newest bundle). Never part of `npm test` or `npm run check`.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { DEFAULT_QUIZ_SETTINGS } from "../../shared/quiz-settings";
import {
  DEFAULT_SIMULATION,
  formatReport,
  simulateQuizzes,
  toSimulationContent,
  type SimulationBundle,
} from "./quiz-variety";

const contentDir = path.resolve(import.meta.dirname, "../../content");

function bundleNames(): string[] {
  const requested = process.env.QUIZ_SIMULATE_BUNDLES?.split(",").map((name) => name.trim()).filter(Boolean);
  if (requested && requested.length > 0) return requested;
  const all = readdirSync(contentDir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  return all.slice(-1);
}

test("simulate quizzes on content bundles", () => {
  for (const name of bundleNames()) {
    const bundle = JSON.parse(readFileSync(path.join(contentDir, name), "utf8")) as SimulationBundle;
    const content = toSimulationContent(bundle);
    for (const skipRate of [0, 0.1]) {
      const options = { ...DEFAULT_SIMULATION, skipRate, limits: DEFAULT_QUIZ_SETTINGS };
      const report = simulateQuizzes(content, options);
      console.info(formatReport(name, options, report));
      expect(report.runs).toBe(options.runs);
    }
  }
}, 120_000);
