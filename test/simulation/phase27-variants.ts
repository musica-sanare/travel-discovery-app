/**
 * Phase 27 candidate changes (prompts/27-low-reach-cities.md), applied in
 * memory to `initial-v13.json`, so candidates can be simulated without writing
 * bundle files. Simulation only; the bundle for the owner is written
 * separately after approval.
 */
import { setScore } from "./phase26-variants";
import type { SimulationBundle } from "./quiz-variety";

type Patch = (bundle: SimulationBundle) => void;

const score = (slug: string, attribute: string, value: number): Patch => (bundle) => {
  setScore(bundle, slug, attribute, value);
};

const taipeiHistory = score("taipei", "history-culture", 4);
const taipeiNature = score("taipei", "nature", 3);
const taipeiCity = score("taipei", "city-life", 5);
const buenosAiresCity = score("buenos-aires", "city-life", 5);
const pragueFood = score("prague", "food", 4);
const sydneyArt = score("sydney", "art-architecture", 4);

export const VARIANTS_27: Record<string, Patch[]> = {
  "t1-taipei-history": [taipeiHistory],
  "t2-taipei-nature": [taipeiNature],
  "t3-taipei-city": [taipeiCity],
  "b1-buenos-aires-city": [buenosAiresCity],
  "p1-prague-food": [pragueFood],
  "y1-sydney-art": [sydneyArt],
  "safe": [taipeiHistory, pragueFood, sydneyArt],
  "safe-b1": [taipeiHistory, pragueFood, sydneyArt, buenosAiresCity],
  "set": [taipeiHistory, taipeiNature, buenosAiresCity, pragueFood, sydneyArt],
  "set-t3": [taipeiHistory, taipeiNature, taipeiCity, buenosAiresCity, pragueFood, sydneyArt],
};

export function applyVariant27(bundle: SimulationBundle, name: string): SimulationBundle {
  const patches = VARIANTS_27[name];
  if (patches === undefined) throw new Error(`unknown Phase 27 variant ${name}`);
  const copy = structuredClone(bundle);
  for (const patch of patches) patch(copy);
  return copy;
}
