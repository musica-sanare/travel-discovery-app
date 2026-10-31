/**
 * Deterministic quiz-variety simulation (prompts/12-attributes-and-questions.md
 * task 1). Runs the engine on a content bundle with seeded random answers and
 * measures how varied the question sets and the top results are. Node only,
 * no network; the same options always give the same report.
 */
import { prepareContent } from "../../domain/diagnosis/content";
import { mulberry32 } from "../../domain/diagnosis/random";
import {
  nextQuestion,
  rankDestinations,
  type Answer,
  type ContentStatus,
  type DiagnosisContent,
  type NextStep,
  type QuestionType,
  type QuizLimits,
  type TaxonomyStatus,
} from "../../domain/diagnosis";

/** The fields of a content bundle (ADR-028) that the engine reads. */
export interface SimulationBundle {
  attributes: { slug: string; status: TaxonomyStatus }[];
  categories: { slug: string; status: TaxonomyStatus }[];
  destinations: {
    slug: string;
    status: ContentStatus;
    attributeScores: { attribute: string; score: number }[];
    recommendedDays: { min: number | null; max: number | null };
    bestMonths: number[] | null;
  }[];
  questions: {
    slug: string;
    category: string;
    type: QuestionType;
    status: ContentStatus;
    priorityWeight: number;
    options: { value: string; effects: { attribute: string; weight: number }[] }[];
  }[];
}

/** Same signature as `nextQuestion`, so candidate rules can be compared with the current one. */
export type SelectionPolicy = (
  content: DiagnosisContent,
  answers: readonly Answer[],
  limits: QuizLimits,
  seed: number,
) => NextStep;

export interface SimulationOptions {
  runs: number;
  /** Seed from which every session seed is derived. */
  masterSeed: number;
  /** Share of shown questions answered as skipped, 0-1. */
  skipRate: number;
  limits: QuizLimits;
  /** Selection rule; default: the current `nextQuestion`. */
  policy?: SelectionPolicy;
}

export interface SimulationReport {
  runs: number;
  usableQuestions: number;
  distinctQuestionSets: number;
  /** Mean number of questions two sessions have in common. */
  meanSharedQuestions: number;
  meanJaccard: number;
  /** Share of sessions showing each question, by slug. */
  questionShownShare: Record<string, number>;
  /** Share of sessions with each destination in the top `resultCount`, by slug. */
  topResultShare: Record<string, number>;
  neverInTopResults: string[];
}

export const DEFAULT_SIMULATION: Omit<SimulationOptions, "limits"> = {
  runs: 1000,
  masterSeed: 20261025,
  skipRate: 0,
};

/** Bundle items are published and active as stored; costs are left out because no budget is simulated. */
export function toSimulationContent(bundle: SimulationBundle): DiagnosisContent {
  const categoryStatus = new Map(bundle.categories.map((category) => [category.slug, category.status]));
  return {
    attributes: bundle.attributes.map(({ slug, status }) => ({ slug, status })),
    questions: bundle.questions.map((question) => ({
      slug: question.slug,
      category: question.category,
      categoryStatus: categoryStatus.get(question.category) ?? "archived",
      type: question.type,
      status: question.status,
      priorityWeight: question.priorityWeight,
      options: question.options.map((option) => ({ value: option.value, status: "active", effects: option.effects })),
    })),
    destinations: bundle.destinations.map((destination) => ({
      slug: destination.slug,
      status: destination.status,
      attributeScores: destination.attributeScores,
      recommendedDays: destination.recommendedDays,
      bestMonths: destination.bestMonths,
      costs: [],
    })),
  };
}

/** A stream of numbers in [0, 1) from consecutive mulberry32 states. */
export function randomStream(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    const value = mulberry32(state);
    state = (state + 0x6d2b79f5) >>> 0;
    return value;
  };
}

function pickOptions(type: QuestionType, values: readonly string[], random: () => number): string[] {
  if (type === "single_choice") {
    const value = values[Math.floor(random() * values.length)];
    return value === undefined ? [] : [value];
  }
  for (;;) {
    const picked = values.filter(() => random() < 0.5);
    if (picked.length > 0) return picked;
  }
}

export interface QuestionVariety {
  distinctQuestionSets: number;
  /** Mean number of questions two sessions have in common. */
  meanSharedQuestions: number;
  meanJaccard: number;
}

/** @param sets the question slugs shown in each session, each sorted */
export function questionVariety(sets: readonly (readonly string[])[]): QuestionVariety {
  let shared = 0;
  let jaccard = 0;
  let pairs = 0;
  for (const [i, set] of sets.entries()) {
    const first = new Set(set);
    for (const second of sets.slice(i + 1)) {
      const common = second.filter((slug) => first.has(slug)).length;
      shared += common;
      jaccard += common / (first.size + second.length - common);
      pairs++;
    }
  }
  return {
    distinctQuestionSets: new Set(sets.map((set) => set.join(","))).size,
    meanSharedQuestions: pairs === 0 ? 0 : shared / pairs,
    meanJaccard: pairs === 0 ? 0 : jaccard / pairs,
  };
}

const ANSWER_SEED_SALT = 0xa5a5a5a5;

export function simulateQuizzes(content: DiagnosisContent, options: SimulationOptions): SimulationReport {
  const questions = new Map(content.questions.map((question) => [question.slug, question]));
  const sessionSeeds = randomStream(options.masterSeed);
  const sets: string[][] = [];
  const shown = new Map<string, number>();
  const top = new Map<string, number>();

  for (let run = 0; run < options.runs; run++) {
    const seed = Math.floor(sessionSeeds() * 2 ** 32) >>> 0;
    const random = randomStream(seed ^ ANSWER_SEED_SALT);
    const answers: Answer[] = [];
    for (;;) {
      const step = (options.policy ?? nextQuestion)(content, answers, options.limits, seed);
      if (step.done) break;
      const question = questions.get(step.question);
      if (question === undefined) throw new Error(`unknown question ${step.question}`);
      const values = question.options.map((option) => option.value);
      const skipped = random() < options.skipRate;
      answers.push({ question: question.slug, options: skipped ? [] : pickOptions(question.type, values, random) });
    }
    const set = answers.map((answer) => answer.question).sort();
    sets.push(set);
    for (const slug of set) shown.set(slug, (shown.get(slug) ?? 0) + 1);
    for (const result of rankDestinations(content, answers, {}, options.limits).results) {
      top.set(result.slug, (top.get(result.slug) ?? 0) + 1);
    }
  }

  const share = (counts: ReadonlyMap<string, number>, slugs: readonly string[]) =>
    Object.fromEntries(slugs.map((slug) => [slug, (counts.get(slug) ?? 0) / options.runs]));
  const usableQuestions = [...prepareContent(content).questions.keys()];
  const destinations = content.destinations.filter((d) => d.status === "published").map((d) => d.slug);
  return {
    runs: options.runs,
    usableQuestions: usableQuestions.length,
    ...questionVariety(sets),
    questionShownShare: share(shown, usableQuestions),
    topResultShare: share(top, destinations),
    neverInTopResults: destinations.filter((slug) => !top.has(slug)),
  };
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export function formatReport(label: string, options: SimulationOptions, report: SimulationReport): string {
  const sortedShares = (shares: Record<string, number>) =>
    Object.entries(shares)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .map(([slug, value]) => `${slug} ${percent(value)}`)
      .join(", ");
  const { minQuestions, targetQuestions, maxQuestions, resultCount } = options.limits;
  return [
    `${label}: ${String(report.runs)} runs, master seed ${String(options.masterSeed)}, skip rate ${percent(options.skipRate)}, ` +
      `settings ${String(minQuestions)}/${String(targetQuestions)}/${String(maxQuestions)}/${String(resultCount)}`,
    `  usable questions ${String(report.usableQuestions)}, distinct question sets ${String(report.distinctQuestionSets)}, ` +
      `mean shared questions ${report.meanSharedQuestions.toFixed(2)}, mean Jaccard ${report.meanJaccard.toFixed(3)}`,
    `  questions shown: ${sortedShares(report.questionShownShare)}`,
    `  top ${String(resultCount)}: ${sortedShares(report.topResultShare)}`,
    `  never in the top ${String(resultCount)}: ${report.neverInTopResults.join(", ") || "none"}`,
  ].join("\n");
}
