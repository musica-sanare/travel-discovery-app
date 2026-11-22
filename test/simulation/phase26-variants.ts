/**
 * Phase 26 candidate changes (prompts/26-hard-to-find-cities.md), applied in
 * memory to the fields of `initial-v12.json` the engine reads, so candidates
 * can be simulated without writing bundle files. Simulation only; the bundle
 * for the owner is written separately after approval.
 */
import type { SimulationBundle } from "./quiz-variety";

type Patch = (bundle: SimulationBundle) => void;

export function setScore(bundle: SimulationBundle, slug: string, attribute: string, score: number) {
  const destination = bundle.destinations.find((item) => item.slug === slug);
  const entry = destination?.attributeScores.find((item) => item.attribute === attribute);
  if (entry === undefined) throw new Error(`no ${attribute} score for ${slug}`);
  entry.score = score;
}

/** Compact towns and cities: a centre small enough to explore on foot, without big-city crowds. */
export const COMPACT: Record<string, number> = {
  edinburgh: 5, prague: 5, copenhagen: 5, lisbon: 5, "hoi-an": 5, cusco: 5, "siem-reap": 4, "chiang-mai": 4, marrakech: 4, santorini: 4,
  provence: 4, queenstown: 4, "jungfrau-region": 4, "norwegian-fjords": 4, cairns: 4,
  rome: 3, barcelona: 3, andalusia: 3, sicily: 3, vancouver: 3, honolulu: 3, madeira: 3, "finnish-lapland": 3, "galapagos-islands": 3, jaipur: 2,
  taipei: 2, singapore: 2, sydney: 2, "cape-town": 2, bali: 2, maldives: 2, uyuni: 2, paris: 2,
  seoul: 1, london: 1, istanbul: 1, "buenos-aires": 1, "rio-de-janeiro": 1, phuket: 1, "riviera-maya": 1,
  bangkok: 0, "new-york": 0, dubai: 0, "maasai-mara": 0,
};

const addCompact: Patch = (bundle) => {
  bundle.attributes.push({ slug: "compact-city", status: "active" });
  for (const destination of bundle.destinations) {
    const score = COMPACT[destination.slug];
    if (score === undefined) throw new Error(`no compact score for ${destination.slug}`);
    destination.attributeScores.push({ attribute: "compact-city", score });
  }
};

const cityScaleQuestion = (big: { attribute: string; weight: number }[]): Patch => (bundle) => {
  bundle.questions.push({
    slug: "city-scale", category: "scenery", type: "single_choice", status: "published", priorityWeight: 5,
    options: [
      { value: "compact", effects: [{ attribute: "compact-city", weight: 3 }] },
      { value: "either", effects: [] },
      { value: "big", effects: big },
    ],
  });
};

const scores: Patch = (bundle) => {
  setScore(bundle, "lisbon", "history-culture", 5);
  setScore(bundle, "copenhagen", "relaxation", 4);
  setScore(bundle, "edinburgh", "easy-getting-around", 5);
};

export const VARIANTS: Record<string, Patch[]> = {
  "s1-lisbon-history": [(bundle) => { setScore(bundle, "lisbon", "history-culture", 5); }],
  "s2-copenhagen-relaxation": [(bundle) => { setScore(bundle, "copenhagen", "relaxation", 4); }],
  "s3-edinburgh-easy": [(bundle) => { setScore(bundle, "edinburgh", "easy-getting-around", 5); }],
  "s4-scores": [scores],
  "a1-compact-question": [addCompact, cityScaleQuestion([{ attribute: "compact-city", weight: -2 }])],
  "a2-compact-question-city": [addCompact, cityScaleQuestion([{ attribute: "compact-city", weight: -2 }, { attribute: "city-life", weight: 2 }])],
  "a3-compact-scores": [scores, addCompact, cityScaleQuestion([{ attribute: "compact-city", weight: -2 }])],
};

export function applyVariant(bundle: SimulationBundle, name: string): SimulationBundle {
  const patches = VARIANTS[name];
  if (patches === undefined) throw new Error(`unknown variant ${name}`);
  const copy = structuredClone(bundle);
  for (const patch of patches) patch(copy);
  return copy;
}
