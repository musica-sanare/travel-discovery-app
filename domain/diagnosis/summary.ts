/**
 * Preference summary for optional AI explanations (docs/working/DECISIONS.md
 * ADR-026). It reads the same preference vector as scoring but has no effect
 * on ranking.
 */
import { compareSlugs, prepareContent } from "./content";
import { buildPreferences } from "./preferences";
import type { AttributeContribution } from "./scoring";
import type { Answer, DiagnosisContent } from "./types";

/** Attributes with a positive preference P[a], strongest first, ties by slug. */
export function topPreferences(
  content: DiagnosisContent,
  answers: readonly Answer[],
  count: number,
): readonly AttributeContribution[] {
  const { values } = buildPreferences(prepareContent(content), answers);
  return [...values]
    .filter(([, value]) => value > 0)
    .map(([attribute, value]) => ({ attribute, value }))
    .sort((a, b) => b.value - a.value || compareSlugs(a.attribute, b.attribute))
    .slice(0, count);
}
