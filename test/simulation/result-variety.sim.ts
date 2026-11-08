/**
 * Phase 23 tasks 1 and 2 (prompts/23-result-variety.md): the current rule
 * against near-fit bands with a seeded draw, on random answers and on
 * simulated respondents. Runs with `npm run quiz:simulate` only when
 * `QUIZ_SIMULATE_RESULTS=1`; never part of `npm test` or `npm run check`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { prepareContent } from "../../domain/diagnosis/content";
import { nextQuestion, type Answer } from "../../domain/diagnosis";
import { DEFAULT_QUIZ_SETTINGS } from "../../shared/quiz-settings";
import { DEFAULT_QUALITY, runQuiz } from "./quiz-quality";
import { DEFAULT_SIMULATION, randomStream, toSimulationContent, type SimulationBundle } from "./quiz-variety";
import { makeRespondent } from "./respondents";
import { evaluateRule, rankAll, type RankedCandidate, type SelectionRule } from "./result-variety";

const bundleName = process.env.QUIZ_SIMULATE_BUNDLES?.split(",")[0]?.trim() || "initial-v10.json";
const RESPONDENT_SEED_SALT = 0x5bd1e995;
const ANSWER_SEED_SALT = 0xa5a5a5a5;
const SELECTION_SEED_SALT = 0x3c6ef372;

const RULES: SelectionRule[] = [
  { label: "current", band: null, weighting: "uniform", preferNewCountry: false },
  ...[5, 10, 15].flatMap((delta) =>
    [8, 12].flatMap((size) =>
      (["uniform", "linear"] as const).map((weighting) => ({
        label: `Δ${String(delta)} N${String(size)} ${weighting}`,
        band: { delta, size },
        weighting,
        preferNewCountry: false,
      })),
    ),
  ),
  { label: "Δ10 N8 linear +country", band: { delta: 10, size: 8 }, weighting: "linear", preferNewCountry: true },
  { label: "Δ10 N12 linear +country", band: { delta: 10, size: 12 }, weighting: "linear", preferNewCountry: true },
  { label: "implemented (Δ10 N12 linear)", band: { delta: 10, size: 12 }, weighting: "linear", preferNewCountry: false, implemented: true },
];

const pct = (value: number) => `${(100 * value).toFixed(1)}%`;

test.skipIf(process.env.QUIZ_SIMULATE_RESULTS !== "1")("compare result selection rules", () => {
  const text = readFileSync(path.resolve(import.meta.dirname, "../../content", bundleName), "utf8");
  const bundle = JSON.parse(text) as SimulationBundle;
  const countries = JSON.parse(text) as { destinations: { slug: string; country: string }[] };
  const content = toSimulationContent(bundle);
  const usable = prepareContent(content);
  const countryOf = new Map(countries.destinations.map((item) => [item.slug, item.country]));
  const destinations = usable.destinations.map((item) => item.slug);
  const limits = DEFAULT_QUIZ_SETTINGS;
  const questions = new Map(content.questions.map((question) => [question.slug, question]));

  const populations: Record<string, { ranked: RankedCandidate[]; seed: number }[]> = { random: [], sparse: [], anchored: [] };

  const sessionSeeds = randomStream(DEFAULT_SIMULATION.masterSeed);
  for (let run = 0; run < DEFAULT_SIMULATION.runs; run++) {
    const seed = Math.floor(sessionSeeds() * 2 ** 32) >>> 0;
    const random = randomStream(seed ^ ANSWER_SEED_SALT);
    const answers: Answer[] = [];
    for (;;) {
      const step = nextQuestion(content, answers, limits, seed);
      if (step.done) break;
      const question = questions.get(step.question);
      if (question === undefined) throw new Error(`unknown question ${step.question}`);
      const values = question.options.map((option) => option.value);
      const options =
        question.type === "single_choice"
          ? [values[Math.floor(random() * values.length)] ?? ""]
          : (() => {
              for (;;) {
                const picked = values.filter(() => random() < 0.5);
                if (picked.length > 0) return picked;
              }
            })();
      answers.push({ question: question.slug, options });
    }
    populations.random?.push({ ranked: rankAll(content, answers, limits, countryOf), seed: (seed ^ SELECTION_SEED_SALT) >>> 0 });
  }

  for (const family of ["sparse", "anchored"] as const) {
    const seeds = randomStream(DEFAULT_QUALITY.masterSeed);
    for (let index = 0; index < DEFAULT_QUALITY.respondents; index++) {
      const seed = Math.floor(seeds() * 2 ** 32) >>> 0;
      const respondent = makeRespondent(usable, family, index, (seed ^ RESPONDENT_SEED_SALT) >>> 0);
      const answers = runQuiz(content, usable, respondent, DEFAULT_QUALITY.behaviour, limits, nextQuestion, seed);
      populations[family]?.push({ ranked: rankAll(content, answers, limits, countryOf), seed: (seed ^ SELECTION_SEED_SALT) >>> 0 });
    }
  }

  for (const [name, quizzes] of Object.entries(populations)) {
    console.info(`${bundleName} ${name}: ${String(quizzes.length)} quizzes, ${String(destinations.length)} destinations, ${String(limits.resultCount)} results`);
    const firsts = new Map<string, number>();
    const inBand = new Map<string, number>();
    for (const { ranked } of quizzes) {
      const first = ranked[0];
      if (first === undefined) continue;
      firsts.set(first.slug, (firsts.get(first.slug) ?? 0) + 1);
      for (const item of ranked.slice(1, 12).filter((candidate) => candidate.fit >= first.fit - 10)) inBand.set(item.slug, (inBand.get(item.slug) ?? 0) + 1);
    }
    const top = (counts: Map<string, number>) =>
      [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([slug, n]) => `${slug} ${pct(n / quizzes.length)}`).join(", ");
    console.info(`  first place: ${top(firsts)}`);
    console.info(`  in the Δ10 N12 band (excluding first): ${top(inBand)}`);
    console.info("  rule | highest | lowest shown | never | share SD | mean fit loss | worst gap fit1-min | best first | mean band | distinct sets /30 seeds | µs");
    for (const rule of RULES) {
      const report = evaluateRule(quizzes, destinations, limits.resultCount, rule, 30, 100);
      console.info(
        `  ${report.label} | ${report.highest.slug} ${pct(report.highest.share)} | ${report.lowest.slug} ${pct(report.lowest.share)} | ${report.never.join(" ") || "none"} | ${pct(report.spread)} | ${report.meanFitLoss.toFixed(2)} | ${report.worstGap.toFixed(1)} | ${pct(report.bestFirst)} | ${report.meanBandSize.toFixed(1)} | ${report.meanDistinctSets.toFixed(1)} | ${report.microsecondsPerSelection.toFixed(1)}`,
      );
      expect(report.bestFirst).toBe(1);
    }
  }
}, 600_000);
