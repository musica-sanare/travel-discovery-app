/**
 * Phase 15 task 3 comparison (prompts/15-question-selection-and-early-stopping.md):
 * the current rule against discrimination-based selection, stability-based
 * early stopping, and their combinations, on the quiz-quality measures. Runs
 * with `npm run quiz:simulate` only when `QUIZ_SIMULATE_CANDIDATES=1`; never
 * part of `npm test` or `npm run check`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { expect, test } from "vitest";
import { DEFAULT_QUIZ_SETTINGS } from "../../shared/quiz-settings";
import {
  cappedPolicy,
  currentPolicy,
  discriminationPolicy,
  earlyStoppingPolicy,
  type DiscriminationOptions,
  type StabilityOptions,
} from "./candidates";
import { DEFAULT_QUALITY, evaluateQuizQuality, timePolicy, type QualityOptions } from "./quiz-quality";
import { DEFAULT_SIMULATION, simulateQuizzes, toSimulationContent, type SelectionPolicy, type SimulationBundle } from "./quiz-variety";

const bundle = process.env.QUIZ_SIMULATE_BUNDLES?.split(",")[0]?.trim() || "initial-v6.json";
const masterSeeds = (process.env.QUIZ_SIMULATE_SEEDS ?? String(DEFAULT_QUALITY.masterSeed)).split(",").map(Number);

interface Candidate {
  label: string;
  policy: SelectionPolicy;
  reference: SelectionPolicy;
}

const DISCRIMINATION: [string, DiscriminationOptions][] = [
  ["D-plain-top", { mode: { kind: "plain" }, pool: "top" }],
  ["D-plain", { mode: { kind: "plain" }, pool: "topOrAll" }],
  ["D-floor0.25", { mode: { kind: "floor", floor: 0.25 }, pool: "topOrAll" }],
  ["D-cap2", { mode: { kind: "capped", cap: 2 }, pool: "topOrAll" }],
];

const stabilityLabel = (s: StabilityOptions) =>
  `S-gap${String(s.gap)}-w${String(s.window)}-${s.cap}${s.countSkips ? "-skips" : ""}`;

function candidates(): Candidate[] {
  const list: Candidate[] = [{ label: "current", policy: currentPolicy, reference: currentPolicy }];
  const selections: [string, SelectionPolicy][] = [["current", currentPolicy]];
  for (const [label, options] of DISCRIMINATION) {
    const policy = discriminationPolicy(options);
    selections.push([label, policy]);
    list.push({ label, policy, reference: policy });
  }
  // Always maxQuestions questions, to separate the effect of asking more from that of stopping.
  for (const [label, selection] of selections) {
    const policy = cappedPolicy(selection, "max");
    list.push({ label: `${label}-max`, policy, reference: policy });
  }
  const stabilities: StabilityOptions[] = [{ gap: 5, window: 2, countSkips: true, cap: "target" }];
  for (const cap of ["target", "max"] as const) {
    for (const gap of [3, 5, 8]) {
      for (const window of [1, 2, 3]) stabilities.push({ gap, window, countSkips: false, cap });
    }
  }
  for (const stability of stabilities) {
    list.push({
      label: stabilityLabel(stability),
      policy: earlyStoppingPolicy(currentPolicy, stability),
      reference: cappedPolicy(currentPolicy, stability.cap),
    });
  }
  const combined: StabilityOptions[] = [
    { gap: 3, window: 2, countSkips: false, cap: "target" },
    { gap: 5, window: 2, countSkips: false, cap: "target" },
    { gap: 5, window: 2, countSkips: false, cap: "max" },
  ];
  for (const [label, selection] of selections.slice(1)) {
    for (const stability of combined) {
      list.push({
        label: `${label}+${stabilityLabel(stability)}`,
        policy: earlyStoppingPolicy(selection, stability),
        reference: cappedPolicy(selection, stability.cap),
      });
    }
  }
  const only = process.env.QUIZ_SIMULATE_ONLY?.split(",").map((label) => label.trim());
  return only ? list.filter((candidate) => only.includes(candidate.label)) : list;
}

test.skipIf(process.env.QUIZ_SIMULATE_CANDIDATES !== "1")(
  "compare candidate selection and stopping rules",
  () => {
    const content = toSimulationContent(
      JSON.parse(
        readFileSync(path.resolve(import.meta.dirname, "../../content", bundle), "utf8"),
      ) as SimulationBundle,
    );
    const limits = DEFAULT_QUIZ_SETTINGS;
    console.info(
      `${bundle}, settings ${String(limits.minQuestions)}/${String(limits.targetQuestions)}/${String(limits.maxQuestions)}/${String(limits.resultCount)}, ` +
        `noise ${String(DEFAULT_QUALITY.behaviour.noise)}, skip rate ${String(DEFAULT_QUALITY.behaviour.skipRate)}, ` +
        `${String(DEFAULT_QUALITY.respondents)} respondents per family\n` +
        "label | family | seed | ideal overlap | ideal first | fit loss | full-length overlap | same top | questions mean/median | " +
        "distinct sets | shared | top-5 high/low (never) | random answers: distinct, shared, top-5 high/low (never) | µs median/p99",
    );
    const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
    for (const candidate of candidates()) {
      const random = simulateQuizzes(content, { ...DEFAULT_SIMULATION, limits, policy: candidate.policy });
      const randomShares = Object.values(random.topResultShare);
      for (const family of ["sparse", "anchored"] as const) {
        for (const masterSeed of masterSeeds) {
          const options: QualityOptions = {
            ...DEFAULT_QUALITY,
            masterSeed,
            family,
            limits,
            policy: candidate.policy,
            reference: candidate.reference,
          };
          const report = evaluateQuizQuality(content, options);
          const timing = timePolicy(content, options, 100, () => performance.now());
          const shares = Object.values(report.topResultShare);
          console.info(
            [
              candidate.label,
              family,
              String(masterSeed),
              report.meanIdealOverlap.toFixed(3),
              percent(report.idealFirstFound),
              report.meanFitLoss.toFixed(2),
              report.meanReferenceOverlap.toFixed(3),
              percent(report.sameAsReference),
              `${report.meanQuestions.toFixed(2)}/${String(report.medianQuestions)}`,
              String(report.distinctQuestionSets),
              report.meanSharedQuestions.toFixed(2),
              `${percent(Math.max(...shares))}/${percent(Math.min(...shares))} (${String(report.neverInTopResults.length)})`,
              `${String(random.distinctQuestionSets)}, ${random.meanSharedQuestions.toFixed(2)}, ` +
                `${percent(Math.max(...randomShares))}/${percent(Math.min(...randomShares))} (${String(random.neverInTopResults.length)})`,
              `${timing.median.toFixed(0)}/${timing.p99.toFixed(0)}`,
            ].join(" | "),
          );
          expect(report.respondents).toBe(options.respondents);
        }
      }
    }
  },
  3_600_000,
);
