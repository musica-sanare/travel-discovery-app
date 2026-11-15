/**
 * Phase 26 task 1 (prompts/26-hard-to-find-cities.md): for respondents
 * anchored on each destination in `QUIZ_SIMULATE_DESTINATIONS`, which
 * destinations dominate it, which destinations take the top places instead,
 * and which options its respondents choose. Runs with `npm run quiz:simulate`
 * only when `QUIZ_SIMULATE_HARD_CITIES=1`; never part of `npm test` or
 * `npm run check`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { prepareContent } from "../../domain/diagnosis/content";
import { nextQuestion, rankDestinations, type Answer } from "../../domain/diagnosis";
import { DEFAULT_QUIZ_SETTINGS } from "../../shared/quiz-settings";
import { DEFAULT_QUALITY } from "./quiz-quality";
import { randomStream, toSimulationContent, type SimulationBundle } from "./quiz-variety";
import { anchoredProfile, respondentAnswer } from "./respondents";

const bundleName = process.env.QUIZ_SIMULATE_BUNDLES?.split(",")[0]?.trim() || "initial-v12.json";
const targets = (process.env.QUIZ_SIMULATE_DESTINATIONS ?? "lisbon,edinburgh,copenhagen").split(",").map((item) => item.trim());
const RESPONDENTS = 400;
const pct = (value: number) => `${(100 * value).toFixed(1)}%`;

test.skipIf(process.env.QUIZ_SIMULATE_HARD_CITIES !== "1")("diagnose hard-to-find destinations", () => {
  const bundle = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../../content", bundleName), "utf8")) as SimulationBundle;
  const content = toSimulationContent(bundle);
  const usable = prepareContent(content);
  const limits = DEFAULT_QUIZ_SETTINGS;
  const scores = new Map(usable.destinations.map((item) => [item.slug, new Map(item.attributeScores.map((score) => [score.attribute, score.score]))]));
  const score = (slug: string, attribute: string) => scores.get(slug)?.get(attribute) ?? 0;

  for (const target of targets) {
    const dominators = usable.destinations
      .map((item) => item.slug)
      .filter((other) => other !== target && usable.attributes.every((attribute) => score(other, attribute) >= score(target, attribute)));
    const nearlyDominators = usable.destinations
      .map((item) => item.slug)
      .filter((other) => other !== target && !dominators.includes(other))
      .map((other) => ({ other, wins: usable.attributes.filter((attribute) => score(target, attribute) > score(other, attribute)) }))
      .filter((item) => item.wins.length === 1)
      .map((item) => `${item.other} (only ${item.wins[0] ?? ""})`);
    console.info(`== ${target}: ${usable.attributes.map((attribute) => `${attribute} ${String(score(target, attribute))}`).join(", ")}`);
    console.info(`  dominated by: ${dominators.join(", ") || "none"}; beaten only on one attribute: ${nearlyDominators.join(", ") || "none"}`);

    const above = new Map<string, number>();
    const chosen = new Map<string, number>();
    let found = 0;
    let first = 0;
    const seeds = randomStream(DEFAULT_QUALITY.masterSeed ^ 0x26);
    for (let index = 0; index < RESPONDENTS; index++) {
      const seed = Math.floor(seeds() * 2 ** 32) >>> 0;
      const respondent = { seed, profile: anchoredProfile(usable, target, seed), anchor: target };
      const answers: Answer[] = [];
      for (;;) {
        const step = nextQuestion(content, answers, limits, seed);
        if (step.done) break;
        const question = usable.questions.get(step.question);
        if (question === undefined) throw new Error(`unknown question ${step.question}`);
        const options = respondentAnswer(respondent, question, DEFAULT_QUALITY.behaviour);
        answers.push({ question: question.slug, options });
        for (const value of options) chosen.set(`${question.slug}.${value}`, (chosen.get(`${question.slug}.${value}`) ?? 0) + 1);
      }
      const ranked = rankDestinations(content, answers, {}, limits).results.map((item) => item.slug);
      if (ranked.includes(target)) found += 1;
      if (ranked[0] === target) first += 1;
      const position = ranked.indexOf(target);
      for (const slug of position === -1 ? ranked : ranked.slice(0, position)) above.set(slug, (above.get(slug) ?? 0) + 1);
    }
    console.info(`  ${String(RESPONDENTS)} anchored respondents: found ${pct(found / RESPONDENTS)}, first ${pct(first / RESPONDENTS)}`);
    console.info(`  ranked above it: ${[...above].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([slug, n]) => `${slug} ${pct(n / RESPONDENTS)}`).join(", ")}`);
    console.info(`  most chosen options: ${[...chosen].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([option, n]) => `${option} ${pct(n / RESPONDENTS)}`).join(", ")}`);
  }
  expect(targets.length).toBeGreaterThan(0);
}, 600_000);
