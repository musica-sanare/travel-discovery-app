/**
 * Entry point for `npm run ai:eval` only (docs/working/AI_EVALUATION.md). Calls real
 * models and consumes Neurons; never part of `npm test` or `npm run check`.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { assertNewRun, buildJobs, readEvalConfig, runEvaluation, type EvaluationCase } from "./runner";

const root = path.resolve(import.meta.dirname, "../..");

test("evaluate candidate models on test/ai-eval/cases.json", { timeout: 60 * 60 * 1000 }, async () => {
  const config = readEvalConfig(process.env, new Date());
  const { cases } = JSON.parse(readFileSync(path.join(root, "test/ai-eval/cases.json"), "utf8")) as {
    cases: EvaluationCase[];
  };
  const outputDir = path.join(root, ".ai-eval");
  const outputFile = path.join(outputDir, `${config.runId}.jsonl`);
  assertNewRun(existsSync(outputFile), config.runId);
  mkdirSync(outputDir, { recursive: true });

  const summary = await runEvaluation(config, buildJobs(cases, config.models, config.repetitions, config.runId), {
    fetchImpl: fetch,
    now: () => performance.now(),
    clock: () => new Date(),
    write: (record) => {
      appendFileSync(outputFile, `${JSON.stringify(record)}\n`);
    },
  });
  console.info(
    `AI evaluation ${config.runId}: ${String(summary.completed)} calls, about ${String(Math.round(summary.estimatedNeurons))} Neurons` +
      `${summary.stoppedForBudget ? ", stopped at the budget" : ""}. Records: ${path.relative(root, outputFile)}`,
  );
  expect(summary.completed).toBeGreaterThan(0);
});
