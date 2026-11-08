/** API-shaped diagnosis snapshot for client tests. */
import type { DiagnosisContentResponse } from "../../shared/diagnosis-content";
import type { Locale } from "../../shared/locales";

const NAMES = {
  ja: { lisbon: "リスボン", iceland: "アイスランド南部", pace: "旅のペースは？", relaxed: "ゆったり", active: "アクティブ", interest: "楽しみたいことは？", food: "食", nature: "自然" },
  en: { lisbon: "Lisbon", iceland: "South Iceland", pace: "Travel pace?", relaxed: "Relaxed", active: "Active", interest: "What do you enjoy?", food: "Food", nature: "Nature" },
  es: { lisbon: "Lisboa", iceland: "Sur de Islandia", pace: "¿Ritmo de viaje?", relaxed: "Tranquilo", active: "Activo", interest: "¿Qué disfrutas?", food: "Comida", nature: "Naturaleza" },
  fr: { lisbon: "Lisbonne", iceland: "Sud de l’Islande", pace: "Rythme de voyage\u202f?", relaxed: "Détendu", active: "Actif", interest: "Qu’aimez-vous\u202f?", food: "Gastronomie", nature: "Nature" },
} as const satisfies Record<Locale, Record<string, string>>;

export function testContent(locale: Locale = "ja", overrides: Partial<DiagnosisContentResponse> = {}): DiagnosisContentResponse {
  const n = NAMES[locale];
  const destination = (
    slug: string,
    name: string,
    scores: Record<string, number>,
    location: { latitude: number; longitude: number } | null = null,
  ) => ({
    slug,
    locale,
    type: "city" as const,
    name,
    summary: `${name} summary`,
    highlights: [],
    cautions: null,
    bestSeason: null,
    recommendedDays: { min: 3, max: 6 },
    bestMonths: [4, 5],
    location,
    country: { slug: "country", name: "Country", locale },
    costs: [],
    image: null,
    attributeScores: Object.entries(scores).map(([attribute, score]) => ({ attribute, score })),
  });
  return {
    locale,
    settings: { minQuestions: 1, targetQuestions: 2, maxQuestions: 2, resultCount: 3 },
    attributes: [
      { slug: "food", name: n.food, locale },
      { slug: "nature", name: n.nature, locale },
    ],
    questions: [
      {
        slug: "pace",
        type: "single_choice",
        priorityWeight: 5,
        prompt: n.pace,
        description: null,
        locale,
        category: { slug: "style", name: null, locale: null },
        options: [
          { value: "relaxed", label: n.relaxed, locale, effects: [{ attribute: "food", weight: 2 }] },
          { value: "active", label: n.active, locale, effects: [{ attribute: "nature", weight: 3 }] },
        ],
      },
      {
        slug: "interest",
        type: "multiple_choice",
        priorityWeight: 5,
        prompt: n.interest,
        description: null,
        locale,
        category: { slug: "interests", name: null, locale: null },
        options: [
          { value: "food", label: n.food, locale, effects: [{ attribute: "food", weight: 3 }] },
          { value: "nature", label: n.nature, locale, effects: [{ attribute: "nature", weight: 3 }] },
        ],
      },
    ],
    destinations: [destination("lisbon", n.lisbon, { food: 5, nature: 2 }, { latitude: 38.71, longitude: -9.14 }), destination("south-iceland", n.iceland, { food: 1, nature: 5 })],
    ...overrides,
  };
}
