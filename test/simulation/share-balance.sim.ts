/**
 * Phase 24 tasks 1 and 3 (prompts/24-share-balance.md): per-destination
 * shares, how often respondents whose ideal a destination is find it, its
 * nearest competitors, and the quiz-quality summary, for each bundle in
 * `QUIZ_SIMULATE_BUNDLES`. Runs with `npm run quiz:simulate` only when
 * `QUIZ_SIMULATE_BALANCE=1`; never part of `npm test` or `npm run check`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { prepareContent } from "../../domain/diagnosis/content";
import { nextQuestion, rankDestinations } from "../../domain/diagnosis";
import { DEFAULT_QUIZ_SETTINGS } from "../../shared/quiz-settings";
import { DEFAULT_QUALITY, evaluateQuizQuality, idealRanking, runQuiz } from "./quiz-quality";
import { DEFAULT_SIMULATION, randomStream, simulateQuizzes, toSimulationContent, type SimulationBundle } from "./quiz-variety";
import { makeRespondent } from "./respondents";

const bundles = (process.env.QUIZ_SIMULATE_BUNDLES ?? "initial-v10.json").split(",").map((name) => name.trim()).filter(Boolean);
const RESPONDENT_SEED_SALT = 0x5bd1e995;
/** 100 anchored respondents per destination on average, so per-destination rates are readable. */
const ANCHORED_RESPONDENTS = 4200;

const pct = (value: number) => `${(100 * value).toFixed(1)}%`;

function shareStats(shares: Record<string, number>) {
  const values = Object.values(shares);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  const sorted = Object.entries(shares).sort((a, b) => b[1] - a[1]);
  return { sd, highest: sorted[0], lowest: sorted.at(-1) };
}

test.skipIf(process.env.QUIZ_SIMULATE_BALANCE !== "1")("diagnose share balance", () => {
  for (const name of bundles) {
    const bundle = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../../content", name), "utf8")) as SimulationBundle;
    const content = toSimulationContent(bundle);
    const usable = prepareContent(content);
    const limits = DEFAULT_QUIZ_SETTINGS;
    const slugs = usable.destinations.map((item) => item.slug);

    const random = simulateQuizzes(content, { ...DEFAULT_SIMULATION, limits }).topResultShare;
    const quality = Object.fromEntries(
      (["sparse", "anchored"] as const).map((family) => [
        family,
        evaluateQuizQuality(content, { ...DEFAULT_QUALITY, family, limits, policy: nextQuestion }),
      ]),
    );

    // Respondents grouped by their ideal first destination (under the hidden profile).
    const ideal = new Map(slugs.map((slug) => [slug, { n: 0, found: 0, first: 0 }]));
    const seeds = randomStream(DEFAULT_QUALITY.masterSeed);
    for (let index = 0; index < ANCHORED_RESPONDENTS; index++) {
      const seed = Math.floor(seeds() * 2 ** 32) >>> 0;
      const respondent = makeRespondent(usable, "anchored", index, (seed ^ RESPONDENT_SEED_SALT) >>> 0);
      const answers = runQuiz(content, usable, respondent, DEFAULT_QUALITY.behaviour, limits, nextQuestion, seed);
      const top = rankDestinations(content, answers, {}, limits).results.map((item) => item.slug);
      const best = idealRanking(usable, respondent.profile)[0]?.slug ?? "";
      const entry = ideal.get(best);
      if (entry === undefined) continue;
      entry.n += 1;
      if (top.includes(best)) entry.found += 1;
      if (top[0] === best) entry.first += 1;
    }

    const scores = new Map(
      usable.destinations.map((item) => [item.slug, new Map(item.attributeScores.map((score) => [score.attribute, score.score]))]),
    );
    const distance = (a: string, b: string) =>
      Math.sqrt(usable.attributes.reduce((sum, attribute) => sum + ((scores.get(a)?.get(attribute) ?? 0) - (scores.get(b)?.get(attribute) ?? 0)) ** 2, 0));

    const stats = shareStats(random);
    console.info(
      `${name}: random top-5 share highest ${stats.highest?.[0] ?? ""} ${pct(stats.highest?.[1] ?? 0)}, lowest ${stats.lowest?.[0] ?? ""} ${pct(stats.lowest?.[1] ?? 0)}, SD ${pct(stats.sd)}; ` +
        `sparse SD ${pct(shareStats(quality.sparse?.topResultShare ?? {}).sd)}`,
    );
    for (const family of ["sparse", "anchored"] as const) {
      const report = quality[family];
      if (report === undefined) continue;
      console.info(
        `  ${family}: ideal overlap ${report.meanIdealOverlap.toFixed(3)}, ideal first found ${pct(report.idealFirstFound)}, fit loss ${report.meanFitLoss.toFixed(2)}, distinct question sets ${String(report.distinctQuestionSets)}, mean shared ${report.meanSharedQuestions.toFixed(2)}`,
      );
    }
    console.info("  destination | random | sparse | ideal for (anchored) | found in top 5 | first | nearest (distance): attributes where this one is ≥1 higher");
    const rows = [...slugs].sort((a, b) => (random[b] ?? 0) - (random[a] ?? 0));
    for (const slug of rows) {
      const entry = ideal.get(slug) ?? { n: 0, found: 0, first: 0 };
      const nearest = slugs
        .filter((other) => other !== slug)
        .map((other) => ({ other, d: distance(slug, other) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3)
        .map(({ other, d }) => {
          const higher = usable.attributes.filter((attribute) => (scores.get(slug)?.get(attribute) ?? 0) - (scores.get(other)?.get(attribute) ?? 0) >= 1);
          return `${other} (${d.toFixed(1)}): ${higher.join(" ") || "-"}`;
        });
      console.info(
        `  ${slug} | ${pct(random[slug] ?? 0)} | ${pct(quality.sparse?.topResultShare[slug] ?? 0)} | ${String(entry.n)} | ${entry.n === 0 ? "n/a" : pct(entry.found / entry.n)} | ${entry.n === 0 ? "n/a" : pct(entry.first / entry.n)} | ${nearest.join("; ")}`,
      );
    }
    expect(slugs.length).toBeGreaterThan(0);
  }
}, 600_000);
