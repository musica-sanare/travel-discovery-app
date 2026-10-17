/**
 * Read-only snapshot for the in-browser diagnostic engine
 * (`GET /api/diagnosis-content`, docs/DECISIONS.md ADR-022). Returns
 * published, active content only, in the requested locale with ADR-012
 * fallback. Must not import write helpers (ADR-018).
 */
import { and, asc, eq } from "drizzle-orm";
import type { DiagnosisContentResponse } from "../../shared/diagnosis-content";
import type { Locale } from "../../shared/locales";
import { parseStoredQuizSettings, QUIZ_SETTINGS_KEY } from "../../shared/quiz-settings";
import type { Database } from "../db/client";
import { appSettings, attributes, destinationAttributes, destinations, questions } from "../db/schema";
import { pickTranslation } from "../localization";
import { loadPublishedDestinations, toPublicDestination } from "./content";

function compareSlugs(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export async function getDiagnosisContent(db: Database, locale: Locale): Promise<DiagnosisContentResponse> {
  const [settingsRows, attributeRows, questionRows, destinationRows, scoreRows] = await Promise.all([
    db
      .select({ valueJson: appSettings.valueJson })
      .from(appSettings)
      .where(eq(appSettings.key, QUIZ_SETTINGS_KEY))
      .limit(1),
    db.query.attributes.findMany({
      columns: { slug: true },
      where: eq(attributes.status, "active"),
      orderBy: asc(attributes.slug),
      with: { translations: true },
    }),
    db.query.questions.findMany({
      columns: { slug: true, questionType: true, priorityWeight: true, displayOrder: true },
      where: eq(questions.status, "published"),
      orderBy: [asc(questions.displayOrder), asc(questions.slug)],
      with: {
        translations: true,
        category: { columns: { slug: true, status: true }, with: { translations: true } },
        options: {
          columns: { value: true, displayOrder: true, status: true },
          with: {
            translations: true,
            effects: {
              columns: { weight: true },
              with: { attribute: { columns: { slug: true, status: true } } },
            },
          },
        },
      },
    }),
    loadPublishedDestinations(db),
    db
      .select({
        destinationId: destinationAttributes.destinationId,
        attribute: attributes.slug,
        score: destinationAttributes.score,
      })
      .from(destinationAttributes)
      .innerJoin(attributes, eq(attributes.id, destinationAttributes.attributeId))
      .innerJoin(destinations, eq(destinations.id, destinationAttributes.destinationId))
      .where(and(eq(attributes.status, "active"), eq(destinations.status, "published"))),
  ]);

  const scoresByDestination = new Map<number, { attribute: string; score: number }[]>();
  for (const row of scoreRows) {
    const list = scoresByDestination.get(row.destinationId) ?? [];
    list.push({ attribute: row.attribute, score: row.score });
    scoresByDestination.set(row.destinationId, list);
  }

  return {
    locale,
    settings: parseStoredQuizSettings(settingsRows[0]?.valueJson),
    attributes: attributeRows.flatMap((row) => {
      const text = pickTranslation(row.translations, locale);
      return text ? [{ slug: row.slug, name: text.name, locale: text.locale }] : [];
    }),
    questions: questionRows.flatMap((row) => {
      const text = pickTranslation(row.translations, locale);
      if (!text || row.category.status !== "active") {
        return [];
      }
      const categoryText = pickTranslation(row.category.translations, locale);
      const options = row.options
        .filter((option) => option.status === "active")
        .sort((a, b) => a.displayOrder - b.displayOrder || compareSlugs(a.value, b.value))
        .flatMap((option) => {
          const label = pickTranslation(option.translations, locale);
          if (!label) {
            return [];
          }
          const effects = option.effects
            .filter((effect) => effect.attribute.status === "active")
            .map((effect) => ({ attribute: effect.attribute.slug, weight: effect.weight }))
            .sort((a, b) => compareSlugs(a.attribute, b.attribute));
          return [{ value: option.value, label: label.label, locale: label.locale, effects }];
        });
      return [
        {
          slug: row.slug,
          type: row.questionType,
          priorityWeight: row.priorityWeight,
          prompt: text.prompt,
          description: text.description,
          locale: text.locale,
          category: {
            slug: row.category.slug,
            name: categoryText?.name ?? null,
            locale: categoryText?.locale ?? null,
          },
          options,
        },
      ];
    }),
    destinations: destinationRows.flatMap((row) => {
      const destination = toPublicDestination(row, locale);
      if (!destination) {
        return [];
      }
      const attributeScores = (scoresByDestination.get(row.id) ?? []).sort((a, b) =>
        compareSlugs(a.attribute, b.attribute),
      );
      return [{ ...destination, attributeScores }];
    }),
  };
}
