/**
 * Quiz-quality evaluation (prompts/15-question-selection-and-early-stopping.md
 * task 2). Simulated respondents with a hidden preference profile take the
 * quiz under a selection policy; the report measures how well the top results
 * match the respondent's ideal ranking, how many questions were asked, and how
 * varied the quizzes are. Node only, no network; the same options always give
 * the same report. Measured against the same editorial model that defines the
 * attribute scores, not against real travellers.
 */
import { compareSlugs, prepareContent, type UsableContent } from "../../domain/diagnosis/content";
import { scoreDestination } from "../../domain/diagnosis/scoring";
import {
  rankDestinations,
  type Answer,
  type DiagnosisContent,
  type NextStep,
  type QuizLimits,
} from "../../domain/diagnosis";
import { questionVariety, randomStream, type QuestionVariety } from "./quiz-variety";
import { makeRespondent, respondentAnswer, type AnswerBehaviour, type ProfileFamily, type Respondent } from "./respondents";

/** Same signature as `nextQuestion`, so candidate rules can be compared with the current one. */
export type SelectionPolicy = (
  content: DiagnosisContent,
  answers: readonly Answer[],
  limits: QuizLimits,
  seed: number,
) => NextStep;

export interface QualityOptions {
  respondents: number;
  /** Seed from which every respondent and session seed is derived. */
  masterSeed: number;
  family: ProfileFamily;
  behaviour: AnswerBehaviour;
  limits: QuizLimits;
  policy: SelectionPolicy;
  /** Policy giving the full-length quiz for the same respondent and seed; default: `policy` itself. */
  reference?: SelectionPolicy;
}

export interface QualityReport extends QuestionVariety {
  respondents: number;
  /** Mean |quiz top ∩ ideal top|, 0..resultCount. */
  meanIdealOverlap: number;
  /** Share of respondents whose ideal first destination is in the quiz top results. */
  idealFirstFound: number;
  /** Mean of (mean H-fit of the ideal top) − (mean H-fit of the quiz top), in fit points. */
  meanFitLoss: number;
  /** Mean |quiz top ∩ full-length top| and share of identical top sets. */
  meanReferenceOverlap: number;
  sameAsReference: number;
  /** Mean ideal overlap when every usable question is answered: the ceiling for any quiz. */
  meanAllQuestionsOverlap: number;
  meanQuestions: number;
  medianQuestions: number;
  /** Respondents by number of questions shown. */
  questionCounts: Record<number, number>;
  /** Share of respondents with each destination in the quiz top results, by slug. */
  topResultShare: Record<string, number>;
  neverInTopResults: string[];
}

export const DEFAULT_QUALITY: Omit<QualityOptions, "family" | "limits" | "policy"> = {
  respondents: 2000,
  masterSeed: 20261031,
  behaviour: { noise: 0.1, skipRate: 0.1 },
};

/** Destination slugs ranked by fit under the hidden profile (ties as in DIAGNOSTIC_ALGORITHM.md §4). */
export function idealRanking(content: UsableContent, profile: ReadonlyMap<string, number>): { slug: string; fit: number }[] {
  return content.destinations
    .map((destination) => ({ slug: destination.slug, ...scoreDestination(destination, content.attributes, profile) }))
    .sort((a, b) => b.fit - a.fit || b.coverage - a.coverage || compareSlugs(a.slug, b.slug))
    .map(({ slug, fit }) => ({ slug, fit }));
}

export function runQuiz(
  content: DiagnosisContent,
  usable: UsableContent,
  respondent: Respondent,
  behaviour: AnswerBehaviour,
  limits: QuizLimits,
  policy: SelectionPolicy,
  seed: number,
): Answer[] {
  const answers: Answer[] = [];
  for (;;) {
    const step = policy(content, answers, limits, seed);
    if (step.done) return answers;
    const question = usable.questions.get(step.question);
    if (question === undefined) throw new Error(`unknown question ${step.question}`);
    answers.push({ question: question.slug, options: respondentAnswer(respondent, question, behaviour) });
  }
}

const RESPONDENT_SEED_SALT = 0x5bd1e995;

export function evaluateQuizQuality(content: DiagnosisContent, options: QualityOptions): QualityReport {
  const usable = prepareContent(content);
  const { limits, behaviour } = options;
  const top = (answers: readonly Answer[]) =>
    rankDestinations(content, answers, {}, limits).results.map((result) => result.slug);
  const overlap = (a: readonly string[], b: readonly string[]) => a.filter((slug) => b.includes(slug)).length;
  const seeds = randomStream(options.masterSeed);

  let idealOverlap = 0;
  let idealFirst = 0;
  let fitLoss = 0;
  let referenceOverlap = 0;
  let sameReference = 0;
  let allOverlap = 0;
  const counts: number[] = [];
  const sets: string[][] = [];
  const topCounts = new Map<string, number>();

  for (let index = 0; index < options.respondents; index++) {
    const sessionSeed = Math.floor(seeds() * 2 ** 32) >>> 0;
    const respondent = makeRespondent(usable, options.family, index, (sessionSeed ^ RESPONDENT_SEED_SALT) >>> 0);
    const ideal = idealRanking(usable, respondent.profile);
    const idealFit = new Map(ideal.map((item) => [item.slug, item.fit]));
    const idealTop = ideal.slice(0, limits.resultCount).map((item) => item.slug);

    const answers = runQuiz(content, usable, respondent, behaviour, limits, options.policy, sessionSeed);
    const quizTop = top(answers);
    const referenceTop =
      options.reference === undefined
        ? quizTop
        : top(runQuiz(content, usable, respondent, behaviour, limits, options.reference, sessionSeed));
    const allAnswers = [...usable.questions.values()].map((question) => ({
      question: question.slug,
      options: respondentAnswer(respondent, question, behaviour),
    }));

    const meanFit = (slugs: readonly string[]) =>
      slugs.reduce((sum, slug) => sum + (idealFit.get(slug) ?? 0), 0) / Math.max(slugs.length, 1);
    idealOverlap += overlap(quizTop, idealTop);
    idealFirst += quizTop.includes(idealTop[0] ?? "") ? 1 : 0;
    fitLoss += meanFit(idealTop) - meanFit(quizTop);
    referenceOverlap += overlap(quizTop, referenceTop);
    sameReference += overlap(quizTop, referenceTop) === referenceTop.length ? 1 : 0;
    allOverlap += overlap(top(allAnswers), idealTop);
    counts.push(answers.length);
    sets.push(answers.map((answer) => answer.question).sort(compareSlugs));
    for (const slug of quizTop) topCounts.set(slug, (topCounts.get(slug) ?? 0) + 1);
  }

  const n = options.respondents;
  const sortedCounts = [...counts].sort((a, b) => a - b);
  const questionCounts: Record<number, number> = {};
  for (const count of counts) questionCounts[count] = (questionCounts[count] ?? 0) + 1;
  const destinations = usable.destinations.map((destination) => destination.slug);
  return {
    respondents: n,
    meanIdealOverlap: idealOverlap / n,
    idealFirstFound: idealFirst / n,
    meanFitLoss: fitLoss / n,
    meanReferenceOverlap: referenceOverlap / n,
    sameAsReference: sameReference / n,
    meanAllQuestionsOverlap: allOverlap / n,
    meanQuestions: counts.reduce((sum, count) => sum + count, 0) / n,
    medianQuestions: sortedCounts[Math.floor((n - 1) / 2)] ?? 0,
    questionCounts,
    ...questionVariety(sets),
    topResultShare: Object.fromEntries(destinations.map((slug) => [slug, (topCounts.get(slug) ?? 0) / n])),
    neverInTopResults: destinations.filter((slug) => !topCounts.has(slug)),
  };
}

/** Median and 99th percentile of one `policy` call in microseconds, along the quizzes of the first respondents. */
export function timePolicy(
  content: DiagnosisContent,
  options: QualityOptions,
  respondents: number,
  now: () => number,
): { median: number; p99: number; calls: number } {
  const usable = prepareContent(content);
  const seeds = randomStream(options.masterSeed);
  const samples: number[] = [];
  for (let index = 0; index < respondents; index++) {
    const sessionSeed = Math.floor(seeds() * 2 ** 32) >>> 0;
    const respondent = makeRespondent(usable, options.family, index, (sessionSeed ^ RESPONDENT_SEED_SALT) >>> 0);
    const answers: Answer[] = [];
    for (;;) {
      const started = now();
      const step = options.policy(content, answers, options.limits, sessionSeed);
      samples.push((now() - started) * 1000);
      if (step.done) break;
      const question = usable.questions.get(step.question);
      if (question === undefined) throw new Error(`unknown question ${step.question}`);
      answers.push({ question: question.slug, options: respondentAnswer(respondent, question, options.behaviour) });
    }
  }
  samples.sort((a, b) => a - b);
  const at = (share: number) => samples[Math.min(samples.length - 1, Math.floor(share * samples.length))] ?? 0;
  return { median: at(0.5), p99: at(0.99), calls: samples.length };
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export function formatQualityReport(label: string, options: QualityOptions, report: QualityReport): string {
  const { minQuestions, targetQuestions, maxQuestions, resultCount } = options.limits;
  const shares = Object.entries(report.topResultShare).sort((a, b) => b[1] - a[1] || compareSlugs(a[0], b[0]));
  const first = shares[0];
  const last = shares.at(-1);
  const histogram = Object.entries(report.questionCounts)
    .map(([count, respondents]) => `${count}: ${String(respondents)}`)
    .join(", ");
  return [
    `${label}: ${options.family} profiles, ${String(report.respondents)} respondents, master seed ${String(options.masterSeed)}, ` +
      `noise ${percent(options.behaviour.noise)}, skip rate ${percent(options.behaviour.skipRate)}, ` +
      `settings ${String(minQuestions)}/${String(targetQuestions)}/${String(maxQuestions)}/${String(resultCount)}`,
    `  ideal overlap ${report.meanIdealOverlap.toFixed(3)} of ${String(resultCount)}, ideal first found ${percent(report.idealFirstFound)}, ` +
      `fit loss ${report.meanFitLoss.toFixed(2)} points; all questions answered: ideal overlap ${report.meanAllQuestionsOverlap.toFixed(3)}`,
    `  full-length overlap ${report.meanReferenceOverlap.toFixed(3)}, same top set ${percent(report.sameAsReference)}`,
    `  questions mean ${report.meanQuestions.toFixed(2)}, median ${String(report.medianQuestions)} (${histogram})`,
    `  distinct question sets ${String(report.distinctQuestionSets)}, mean shared questions ${report.meanSharedQuestions.toFixed(2)}, ` +
      `mean Jaccard ${report.meanJaccard.toFixed(3)}`,
    `  top ${String(resultCount)} share: highest ${first ? `${first[0]} ${percent(first[1])}` : "-"}, ` +
      `lowest ${last ? `${last[0]} ${percent(last[1])}` : "-"}; never: ${report.neverInTopResults.join(", ") || "none"}`,
  ].join("\n");
}
