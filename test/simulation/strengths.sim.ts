/**
 * Phase 19 task 1 (prompts/19-results-and-page-basics.md): how often each
 * candidate score margin gives the shown results a distinctive strength. Runs
 * with `npm run quiz:simulate` only when `QUIZ_SIMULATE_STRENGTHS=1`; never
 * part of `npm test` or `npm run check`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { prepareContent } from "../../domain/diagnosis/content";
import { buildPreferences } from "../../domain/diagnosis/preferences";
import { distinctiveStrengths } from "../../domain/diagnosis/ranking";
import { scoreDestination } from "../../domain/diagnosis/scoring";
import { nextQuestion, rankDestinations } from "../../domain/diagnosis";
import { DEFAULT_QUIZ_SETTINGS } from "../../shared/quiz-settings";
import { DEFAULT_QUALITY, runQuiz } from "./quiz-quality";
import { randomStream, toSimulationContent, type SimulationBundle } from "./quiz-variety";
import { makeRespondent } from "./respondents";

const bundle = process.env.QUIZ_SIMULATE_BUNDLES?.split(",")[0]?.trim() || "initial-v8.json";
const MARGINS = [0.5, 0.75, 1, 1.5];
const RESPONDENT_SEED_SALT = 0x5bd1e995;

test.skipIf(process.env.QUIZ_SIMULATE_STRENGTHS !== "1")("compare strength margins", () => {
  const content = toSimulationContent(
    JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../../content", bundle), "utf8")) as SimulationBundle,
  );
  const usable = prepareContent(content);
  for (const family of ["sparse", "anchored"] as const) {
    const seeds = randomStream(DEFAULT_QUALITY.masterSeed);
    const quizzes: { contributions: ReturnType<typeof scoreDestination>["contributions"][]; values: ReadonlyMap<string, number>; sameMatches: boolean }[] = [];
    for (let index = 0; index < DEFAULT_QUALITY.respondents; index++) {
      const seed = Math.floor(seeds() * 2 ** 32) >>> 0;
      const respondent = makeRespondent(usable, family, index, (seed ^ RESPONDENT_SEED_SALT) >>> 0);
      const answers = runQuiz(content, usable, respondent, DEFAULT_QUALITY.behaviour, DEFAULT_QUIZ_SETTINGS, nextQuestion, seed);
      const { values } = buildPreferences(usable, answers);
      const { results } = rankDestinations(content, answers, {}, DEFAULT_QUIZ_SETTINGS);
      const destinations = new Map(usable.destinations.map((item) => [item.slug, item]));
      const contributions = results.map((result) => {
        const destination = destinations.get(result.slug);
        if (destination === undefined) throw new Error(`unknown destination ${result.slug}`);
        return scoreDestination(destination, usable.attributes, values).contributions;
      });
      const matchSets = results.map((result) => result.topAttributes.map((item) => item.attribute).sort().join(","));
      quizzes.push({ contributions, values, sameMatches: new Set(matchSets).size === 1 });
    }
    const alike = quizzes.filter((quiz) => quiz.sameMatches).length;
    console.info(`${bundle} ${family}: ${String(quizzes.length)} quizzes, identical "Why it fits" on every card in ${pct(alike, quizzes.length)}`);
    for (const margin of MARGINS) {
      let cards = 0;
      let withStrength = 0;
      let quizzesAllWithout = 0;
      let alikeHelped = 0;
      const perCard: number[] = [0, 0, 0];
      for (const quiz of quizzes) {
        const strengths = distinctiveStrengths(quiz.contributions, quiz.values, margin);
        cards += strengths.length;
        withStrength += strengths.filter((list) => list.length > 0).length;
        for (const list of strengths) perCard[list.length] = (perCard[list.length] ?? 0) + 1;
        const cardsWith = strengths.filter((list) => list.length > 0).length;
        if (cardsWith === 0) quizzesAllWithout += 1;
        if (quiz.sameMatches && cardsWith >= 2) alikeHelped += 1;
      }
      console.info(
        `  margin ${String(margin)}: cards with a strength ${pct(withStrength, cards)} (0/1/2: ${perCard.map((n) => pct(n, cards)).join(" / ")}), quizzes with none ${pct(quizzesAllWithout, quizzes.length)}, alike quizzes with 2+ cards told apart ${pct(alikeHelped, alike)}`,
      );
    }
    expect(quizzes.length).toBe(DEFAULT_QUALITY.respondents);
  }
}, 120_000);

function pct(part: number, whole: number): string {
  return whole === 0 ? "n/a" : `${((100 * part) / whole).toFixed(1)}%`;
}
