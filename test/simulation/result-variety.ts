/**
 * Phase 23 task 2 (prompts/23-result-variety.md): candidate rules that pick
 * the shown results from a near-fit band with a seed, and the measures used
 * to compare them with the current rule. Node only; the same options always
 * give the same report.
 */
import { rankDestinations, type Answer, type DiagnosisContent, type QuizLimits } from "../../domain/diagnosis";
import { compareByFit } from "../../domain/diagnosis/ranking";
import { fnv1a, mix32, pickResults } from "../../domain/diagnosis/variety";

export interface RankedCandidate {
  slug: string;
  fit: number;
  coverage: number;
  country: string;
}

export interface SelectionRule {
  label: string;
  /** null: the current rule (the first `count` by fit). */
  band: { delta: number; size: number } | null;
  weighting: "uniform" | "linear";
  preferNewCountry: boolean;
  /** Use the implemented rule (domain/diagnosis/variety.ts, first draw) instead of the prototype. */
  implemented?: boolean;
}

/** Seeded number in (0, 1) for a destination; depends only on the seed and the slug. */
export function seededUniform(seed: number, slug: string): number {
  return (mix32(mix32(seed) ^ fnv1a(slug)) + 0.5) / 2 ** 32;
}

/**
 * The best fit first; the other slots from the band (fit ≥ fit₁ − delta,
 * among the best `size`), by a weighted draw without replacement
 * (key u^(1/w)); optionally a destination of a country not yet shown first.
 * Slots the band cannot fill take the next destinations by fit. The result is
 * in fit order.
 */
export function selectResults(ranked: readonly RankedCandidate[], count: number, seed: number, rule: SelectionRule): RankedCandidate[] {
  const [first, ...rest] = ranked;
  if (first === undefined) return [];
  if (rule.implemented === true) return pickResults(ranked, count, { seed, draw: 0 }).shown;
  if (rule.band === null) return ranked.slice(0, count);
  const { delta, size } = rule.band;
  const floor = first.fit - delta;
  const band = rest.slice(0, size - 1).filter((item) => item.fit >= floor);
  if (band.length <= count - 1) return ranked.slice(0, count);

  const weight = (item: RankedCandidate) => (rule.weighting === "uniform" ? 1 : 1 + (item.fit - floor) / Math.max(delta, 1e-9));
  const keyed = band.map((item) => ({ item, key: Math.log(seededUniform(seed, item.slug)) / weight(item) }));
  const chosen = [first];
  const countries = new Set([first.country]);
  while (chosen.length < count && keyed.length > 0) {
    let bestIndex = 0;
    for (let index = 1; index < keyed.length; index++) {
      const a = keyed[index];
      const b = keyed[bestIndex];
      if (a === undefined || b === undefined) continue;
      const newA = rule.preferNewCountry && !countries.has(a.item.country) ? 1 : 0;
      const newB = rule.preferNewCountry && !countries.has(b.item.country) ? 1 : 0;
      if (newA > newB || (newA === newB && a.key > b.key)) bestIndex = index;
    }
    const [pick] = keyed.splice(bestIndex, 1);
    if (pick === undefined) break;
    chosen.push(pick.item);
    countries.add(pick.item.country);
  }
  return chosen.sort(compareByFit);
}

/** Every eligible destination in the current order. */
export function rankAll(content: DiagnosisContent, answers: readonly Answer[], limits: QuizLimits, countryOf: ReadonlyMap<string, string>): RankedCandidate[] {
  return rankDestinations(content, answers, {}, { ...limits, resultCount: content.destinations.length }).results.map((result) => ({
    slug: result.slug,
    fit: result.fit,
    coverage: result.coverage,
    country: countryOf.get(result.slug) ?? result.slug,
  }));
}

export interface RuleReport {
  label: string;
  highest: { slug: string; share: number };
  lowest: { slug: string; share: number };
  never: string[];
  /** Standard deviation of the per-destination shares. */
  spread: number;
  /** Mean over quizzes of (mean fit of the current top N − mean fit of the shown results). */
  meanFitLoss: number;
  /** Largest gap between the best fit and the lowest shown fit, over all quizzes. */
  worstGap: number;
  /** Share of quizzes whose best fit is shown first. */
  bestFirst: number;
  meanBandSize: number;
  /** Mean number of distinct result sets one answer set gets over the variety seeds. */
  meanDistinctSets: number;
  microsecondsPerSelection: number;
}

export function evaluateRule(
  quizzes: readonly { ranked: readonly RankedCandidate[]; seed: number }[],
  destinations: readonly string[],
  count: number,
  rule: SelectionRule,
  varietySeeds: number,
  varietyQuizzes: number,
): RuleReport {
  const shown = new Map(destinations.map((slug) => [slug, 0]));
  let fitLoss = 0;
  let worstGap = 0;
  let bestFirst = 0;
  let bandSize = 0;
  const started = performance.now();
  for (const { ranked, seed } of quizzes) {
    const selected = selectResults(ranked, count, seed, rule);
    const current = ranked.slice(0, count);
    for (const item of selected) shown.set(item.slug, (shown.get(item.slug) ?? 0) + 1);
    const mean = (items: readonly RankedCandidate[]) => items.reduce((sum, item) => sum + item.fit, 0) / Math.max(items.length, 1);
    fitLoss += mean(current) - mean(selected);
    const first = ranked[0];
    if (first !== undefined) {
      worstGap = Math.max(worstGap, first.fit - Math.min(...selected.map((item) => item.fit)));
      if (selected[0]?.slug === first.slug) bestFirst += 1;
      if (rule.band) bandSize += ranked.slice(1, rule.band.size).filter((item) => item.fit >= first.fit - (rule.band?.delta ?? 0)).length;
    }
  }
  const elapsed = performance.now() - started;
  let distinct = 0;
  for (const { ranked } of quizzes.slice(0, varietyQuizzes)) {
    const sets = new Set<string>();
    for (let seed = 0; seed < varietySeeds; seed++) sets.add(selectResults(ranked, count, seed, rule).map((item) => item.slug).join(","));
    distinct += sets.size;
  }
  const shares = [...shown].map(([slug, n]) => ({ slug, share: n / quizzes.length }));
  shares.sort((a, b) => b.share - a.share || (a.slug < b.slug ? -1 : 1));
  const meanShare = shares.reduce((sum, item) => sum + item.share, 0) / shares.length;
  const spread = Math.sqrt(shares.reduce((sum, item) => sum + (item.share - meanShare) ** 2, 0) / shares.length);
  return {
    label: rule.label,
    highest: shares[0] ?? { slug: "", share: 0 },
    lowest: shares.filter((item) => item.share > 0).at(-1) ?? { slug: "", share: 0 },
    never: shares.filter((item) => item.share === 0).map((item) => item.slug),
    spread,
    meanFitLoss: fitLoss / quizzes.length,
    worstGap,
    bestFirst: bestFirst / quizzes.length,
    meanBandSize: bandSize / quizzes.length,
    meanDistinctSets: distinct / Math.min(varietyQuizzes, quizzes.length),
    microsecondsPerSelection: (1000 * elapsed) / quizzes.length,
  };
}
