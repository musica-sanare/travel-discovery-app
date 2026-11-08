/**
 * Phase 25 task 5 (prompts/25-new-attributes.md): how far new attributes reach
 * and what they change, for each bundle in `QUIZ_SIMULATE_BUNDLES` (names in
 * content/, or absolute paths) against the first one. New attributes change
 * the simulated population, so three populations are reported:
 * - respondents built over the bundle's own attributes (who counts as ideal changes);
 * - the same respondents anchored on each destination (the group stays comparable);
 * - a fixed population built over the first bundle's attributes, who are
 *   indifferent to the new ones: the check for harm to everyone else.
 * Runs with `npm run quiz:simulate` only when `QUIZ_SIMULATE_ATTRIBUTES=1`;
 * never part of `npm test` or `npm run check`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { prepareContent, type UsableContent } from "../../domain/diagnosis/content";
import { nextQuestion, rankDestinations, type Answer, type DiagnosisContent } from "../../domain/diagnosis";
import { DEFAULT_QUIZ_SETTINGS } from "../../shared/quiz-settings";
import { DEFAULT_QUALITY, evaluateQuizQuality, idealRanking } from "./quiz-quality";
import { DEFAULT_SIMULATION, randomStream, simulateQuizzes, toSimulationContent, type SimulationBundle } from "./quiz-variety";
import { makeRespondent, optionUtility, respondentAnswer, type ProfileFamily, type Respondent } from "./respondents";

const names = (process.env.QUIZ_SIMULATE_BUNDLES ?? "initial-v11.json").split(",").map((name) => name.trim()).filter(Boolean);
const RESPONDENT_SEED_SALT = 0x5bd1e995;
const ANSWER_SEED_SALT = 0xa5a5a5a5;
const limits = DEFAULT_QUIZ_SETTINGS;
const behaviour = DEFAULT_QUALITY.behaviour;
const WATCHED = ["rome", "maasai-mara", "edinburgh", "copenhagen", "lisbon"];
/** A destination counts as worse below these drops against the first bundle. */
const WORSE_FOUND = 0.05;
const WORSE_SHARE = 0.01;

const pct = (value: number) => `${(100 * value).toFixed(1)}%`;

type Loaded = { name: string; content: DiagnosisContent; usable: UsableContent };

function load(name: string): Loaded {
  const bundle = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../../content", name), "utf8")) as SimulationBundle;
  const content = toSimulationContent(bundle);
  return { name: path.basename(name), content, usable: prepareContent(content) };
}

/** Indifferent to every option of a single-choice question: the middle option, so a new question is not answered with its first option by default. */
function fixedAnswer(usable: UsableContent, respondent: Respondent, slug: string): string[] {
  const question = usable.questions.get(slug);
  if (question === undefined) throw new Error(`unknown question ${slug}`);
  const values = [...question.options.keys()];
  const utilities = values.map((value) => optionUtility(question.options.get(value) ?? new Map<string, number>(), respondent.profile));
  const answer = respondentAnswer(respondent, question, behaviour);
  if (question.type === "single_choice" && answer.length > 0 && Math.max(...utilities) === Math.min(...utilities)) {
    return [values[Math.floor(values.length / 2)] as string];
  }
  return answer;
}

function runFixedQuiz(loaded: Loaded, respondent: Respondent, seed: number): Answer[] {
  const answers: Answer[] = [];
  for (;;) {
    const step = nextQuestion(loaded.content, answers, limits, seed);
    if (step.done) return answers;
    answers.push({ question: step.question, options: fixedAnswer(loaded.usable, respondent, step.question) });
  }
}

function runOwnQuiz(loaded: Loaded, respondent: Respondent, seed: number): Answer[] {
  const answers: Answer[] = [];
  for (;;) {
    const step = nextQuestion(loaded.content, answers, limits, seed);
    if (step.done) return answers;
    const question = loaded.usable.questions.get(step.question);
    if (question === undefined) throw new Error(`unknown question ${step.question}`);
    answers.push({ question: question.slug, options: respondentAnswer(respondent, question, behaviour) });
  }
}

/** Net effect of the answers on an attribute. */
function preference(usable: UsableContent, answers: readonly Answer[], attribute: string): number {
  let total = 0;
  for (const answer of answers) {
    const question = usable.questions.get(answer.question);
    for (const value of answer.options) total += question?.options.get(value)?.get(attribute) ?? 0;
  }
  return total;
}

function randomAnswers(loaded: Loaded, seed: number): Answer[] {
  const random = randomStream((seed ^ ANSWER_SEED_SALT) >>> 0);
  const answers: Answer[] = [];
  for (;;) {
    const step = nextQuestion(loaded.content, answers, limits, seed);
    if (step.done) return answers;
    const question = loaded.usable.questions.get(step.question);
    if (question === undefined) throw new Error(`unknown question ${step.question}`);
    const values = [...question.options.keys()];
    if (random() < DEFAULT_SIMULATION.skipRate) answers.push({ question: question.slug, options: [] });
    else if (question.type === "single_choice") answers.push({ question: question.slug, options: [values[Math.floor(random() * values.length)] as string] });
    else {
      let picked: string[] = [];
      while (picked.length === 0) picked = values.filter(() => random() < 0.5);
      answers.push({ question: question.slug, options: picked });
    }
  }
}

interface Measures {
  random: Record<string, number>;
  sparse: Record<string, number>;
  anchorFound: Record<string, number>;
  anchorFirst: Record<string, number>;
  fixedAnchorFound: Record<string, number>;
}

function anchorRates(loaded: Loaded, built: UsableContent, run: (respondent: Respondent, seed: number) => Answer[]) {
  const respondentsPerAnchor = 100;
  const slugs = built.destinations.map((item) => item.slug);
  const found: Record<string, number> = {};
  const first: Record<string, number> = {};
  const seeds = randomStream(DEFAULT_QUALITY.masterSeed);
  for (let index = 0; index < slugs.length * respondentsPerAnchor; index++) {
    const seed = Math.floor(seeds() * 2 ** 32) >>> 0;
    const respondent = makeRespondent(built, "anchored", index, (seed ^ RESPONDENT_SEED_SALT) >>> 0);
    const top = rankDestinations(loaded.content, run(respondent, seed), {}, limits).results.map((item) => item.slug);
    const anchor = respondent.anchor ?? "";
    if (top.includes(anchor)) found[anchor] = (found[anchor] ?? 0) + 1 / respondentsPerAnchor;
    if (top[0] === anchor) first[anchor] = (first[anchor] ?? 0) + 1 / respondentsPerAnchor;
  }
  return { found, first };
}

/** Quality for respondents built over `baseline`, who answer the middle option of a single-choice question they are indifferent to. */
function fixedPopulation(loaded: Loaded, baseline: UsableContent, family: ProfileFamily) {
  const seeds = randomStream(DEFAULT_QUALITY.masterSeed);
  let overlap = 0;
  let firstFound = 0;
  let fitLoss = 0;
  const shares: Record<string, number> = {};
  const n = DEFAULT_QUALITY.respondents;
  for (let index = 0; index < n; index++) {
    const seed = Math.floor(seeds() * 2 ** 32) >>> 0;
    const respondent = makeRespondent(baseline, family, index, (seed ^ RESPONDENT_SEED_SALT) >>> 0);
    const ideal = idealRanking(loaded.usable, respondent.profile);
    const fits = new Map(ideal.map((item) => [item.slug, item.fit]));
    const idealTop = ideal.slice(0, limits.resultCount).map((item) => item.slug);
    const top = rankDestinations(loaded.content, runFixedQuiz(loaded, respondent, seed), {}, limits).results.map((item) => item.slug);
    const mean = (slugs: readonly string[]) => slugs.reduce((sum, slug) => sum + (fits.get(slug) ?? 0), 0) / Math.max(slugs.length, 1);
    overlap += top.filter((slug) => idealTop.includes(slug)).length;
    firstFound += top.includes(idealTop[0] ?? "") ? 1 : 0;
    fitLoss += mean(idealTop) - mean(top);
    for (const slug of top) shares[slug] = (shares[slug] ?? 0) + 1 / n;
  }
  return { summary: `overlap ${(overlap / n).toFixed(3)}, ideal first found ${pct(firstFound / n)}, fit loss ${(fitLoss / n).toFixed(2)}`, shares };
}

function shareSpread(shares: Record<string, number>) {
  const values = Object.values(shares);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  const sorted = Object.entries(shares).sort((a, b) => b[1] - a[1]);
  return `highest ${sorted[0]?.[0] ?? ""} ${pct(sorted[0]?.[1] ?? 0)}, lowest ${sorted.at(-1)?.[0] ?? ""} ${pct(sorted.at(-1)?.[1] ?? 0)}, SD ${pct(sd)}`;
}

test.skipIf(process.env.QUIZ_SIMULATE_ATTRIBUTES !== "1")("measure new attributes", () => {
  const baseline = load(names[0] ?? "initial-v11.json");
  let first: Measures | undefined;
  for (const name of names) {
    const loaded = load(name);
    const added = loaded.usable.attributes.filter((attribute) => !baseline.usable.attributes.includes(attribute));
    const sparse = evaluateQuizQuality(loaded.content, { ...DEFAULT_QUALITY, family: "sparse", limits, policy: nextQuestion });
    const anchored = evaluateQuizQuality(loaded.content, { ...DEFAULT_QUALITY, family: "anchored", limits, policy: nextQuestion });
    const own = anchorRates(loaded, loaded.usable, (respondent, seed) => runOwnQuiz(loaded, respondent, seed));
    const fixed = anchorRates(loaded, baseline.usable, (respondent, seed) => runFixedQuiz(loaded, respondent, seed));
    const measures: Measures = {
      random: simulateQuizzes(loaded.content, { ...DEFAULT_SIMULATION, limits }).topResultShare,
      sparse: sparse.topResultShare,
      anchorFound: own.found,
      anchorFirst: own.first,
      fixedAnchorFound: fixed.found,
    };
    console.info(`== ${loaded.name}`);
    console.info(`  random ${shareSpread(measures.random)}; sparse ${shareSpread(measures.sparse)}`);
    console.info(`  own attributes: sparse overlap ${sparse.meanIdealOverlap.toFixed(3)}, first found ${pct(sparse.idealFirstFound)}, fit loss ${sparse.meanFitLoss.toFixed(2)}, mean shared ${sparse.meanSharedQuestions.toFixed(2)}; anchored overlap ${anchored.meanIdealOverlap.toFixed(3)}, first found ${pct(anchored.idealFirstFound)}, fit loss ${anchored.meanFitLoss.toFixed(2)}, mean shared ${anchored.meanSharedQuestions.toFixed(2)}`);
    const ownSparse = fixedPopulation(loaded, loaded.usable, "sparse");
    console.info(`  own attributes, indifferent answers in the middle: sparse ${ownSparse.summary}, ${shareSpread(ownSparse.shares)}; anchored ${fixedPopulation(loaded, loaded.usable, "anchored").summary}`);
    console.info(`  fixed population: sparse ${fixedPopulation(loaded, baseline.usable, "sparse").summary}; anchored ${fixedPopulation(loaded, baseline.usable, "anchored").summary}`);
    for (const attribute of added) {
      const reach = { random: 0, sparse: 0, anchored: 0 };
      const positive = { random: 0, sparse: 0, anchored: 0 };
      const runs = 1000;
      const seeds = randomStream(DEFAULT_SIMULATION.masterSeed);
      for (let index = 0; index < runs; index++) {
        const seed = Math.floor(seeds() * 2 ** 32) >>> 0;
        const value = preference(loaded.usable, randomAnswers(loaded, seed), attribute);
        if (value !== 0) reach.random += 1 / runs;
        if (value > 0) positive.random += 1 / runs;
      }
      for (const family of ["sparse", "anchored"] as const) {
        const familySeeds = randomStream(DEFAULT_QUALITY.masterSeed);
        for (let index = 0; index < runs; index++) {
          const seed = Math.floor(familySeeds() * 2 ** 32) >>> 0;
          const respondent = makeRespondent(loaded.usable, family, index, (seed ^ RESPONDENT_SEED_SALT) >>> 0);
          const value = preference(loaded.usable, runFixedQuiz(loaded, respondent, seed), attribute);
          if (value !== 0) reach[family] += 1 / runs;
          if (value > 0) positive[family] += 1 / runs;
        }
      }
      console.info(`  reach ${attribute}: random ${pct(reach.random)} (positive ${pct(positive.random)}), sparse ${pct(reach.sparse)} (${pct(positive.sparse)}), anchored ${pct(reach.anchored)} (${pct(positive.anchored)})`);
    }
    for (const slug of WATCHED) {
      console.info(`  ${slug}: random ${pct(measures.random[slug] ?? 0)}, sparse ${pct(measures.sparse[slug] ?? 0)}, anchor found ${pct(measures.anchorFound[slug] ?? 0)}, first ${pct(measures.anchorFirst[slug] ?? 0)}, fixed anchor found ${pct(measures.fixedAnchorFound[slug] ?? 0)}`);
    }
    if (first !== undefined) {
      const worse = loaded.usable.destinations.map((item) => item.slug).flatMap((slug) => {
        const parts: string[] = [];
        const was = first as Measures;
        if ((measures.anchorFound[slug] ?? 0) < (was.anchorFound[slug] ?? 0) - WORSE_FOUND) parts.push(`found ${pct(was.anchorFound[slug] ?? 0)}→${pct(measures.anchorFound[slug] ?? 0)}`);
        if ((measures.fixedAnchorFound[slug] ?? 0) < (was.fixedAnchorFound[slug] ?? 0) - WORSE_FOUND) parts.push(`fixed ${pct(was.fixedAnchorFound[slug] ?? 0)}→${pct(measures.fixedAnchorFound[slug] ?? 0)}`);
        if ((measures.random[slug] ?? 0) < (was.random[slug] ?? 0) - WORSE_SHARE) parts.push(`random ${pct(was.random[slug] ?? 0)}→${pct(measures.random[slug] ?? 0)}`);
        return parts.length > 0 ? [`${slug} (${parts.join(", ")})`] : [];
      });
      console.info(`  worse: ${worse.join("; ") || "none"}`);
    } else first = measures;
    if (process.env.QUIZ_SIMULATE_FULL === "1") {
      for (const slug of loaded.usable.destinations.map((item) => item.slug)) {
        console.info(`  | ${slug} | ${pct(measures.random[slug] ?? 0)} | ${pct(measures.sparse[slug] ?? 0)} | ${pct(measures.anchorFound[slug] ?? 0)} | ${pct(measures.anchorFirst[slug] ?? 0)} | ${pct(measures.fixedAnchorFound[slug] ?? 0)}`);
      }
    }
    expect(loaded.usable.destinations.length).toBeGreaterThan(0);
  }
}, 1_800_000);
