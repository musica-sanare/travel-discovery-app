/**
 * Text guards and structural checks for model output (docs/working/DECISIONS.md
 * ADR-026). These cases document known patterns only; passing them does not
 * mean a text is accurate.
 */
import { describe, expect, it } from "vitest";
import { allowedDigitSequences, checkExplanationText, digitSequences, validateModelOutput } from "../../server/ai/output";
import type { ExplanationDestination, ExplanationInput } from "../../server/ai/provider";
import type { Locale } from "../../shared/locales";

const JA = "ゆったりとした街歩きと豊かな食文化があり、あなたが挙げた好みによく合いそうな旅行先です。";
const EN = "Relaxed walks through historic streets and a rich food culture make this a natural fit for what you enjoy.";
const FR = "Ses rues historiques et sa cuisine variée correspondent tout à fait à ce que vous aimez en voyage.";
const ES = "Sus calles históricas y su cocina variada encajan muy bien con lo que más disfrutas al viajar.";

describe("checkExplanationText", () => {
  it.each([
    [JA, "ja"],
    [EN, "en"],
    [ES, "es"],
    [`${EN} Lisboa`, "es"],
    [FR, "fr"],
    [`${JA}Lisboa`, "ja"],
    ["ミレトは小さな港町です。", "ja"],
  ] as const)("accepts %s (%s)", (text, locale) => {
    expect(checkExplanationText(text, locale)).toBeNull();
  });

  it.each([
    ["短すぎる説明です。", "ja", "too_short"],
    ["Too short", "en", "too_short"],
    ["あ".repeat(401), "ja", "too_long"],
    [`${JA}三泊なら一泊１万円ほどです。`, "ja", "digit"],
    [`${EN} Rooms start at 120 euros.`, "en", "digit"],
    [`${EN} See https://example.com for more.`, "en", "link"],
    [`${EN} Visit www.example.org today.`, "en", "link"],
    [`${EN} **Top pick**`, "en", "markup"],
    [`${EN} <b>bold</b>`, "en", "markup"],
    [`${EN} [more](x)`, "en", "markup"],
    [EN, "ja", "script"],
    [`${EN} 東京`, "en", "script"],
    [`${ES} 東京`, "es", "script"],
    [`${FR} 東京`, "fr", "script"],
  ] as const)("rejects %s (%s) as %s", (text, locale, reason) => {
    expect(checkExplanationText(text, locale)).toBe(reason);
  });

  it("does not catch numbers written in words (auxiliary guard only)", () => {
    expect(checkExplanationText(`${JA}三日あれば十分に楽しめます。`, "ja")).toBeNull();
  });
});

describe("digit sequences from the destination's own data", () => {
  // Authored highlights of Lisbon and Uyuni in content/initial-v10.json.
  const lisbon: Record<Locale, ExplanationDestination> = {
    ja: { id: "d1", name: "リスボン", country: "ポルトガル", summary: "坂道を路面電車が走る街。", highlights: ["路面電車28番"] },
    en: { id: "d1", name: "Lisbon", country: "Portugal", summary: "Trams climb steep hills.", highlights: ["Tram 28"] },
    es: { id: "d1", name: "Lisboa", country: "Portugal", summary: "Los tranvías suben cuestas.", highlights: ["El tranvía 28"] },
    fr: { id: "d1", name: "Lisbonne", country: "Portugal", summary: "Les tramways gravissent des pentes.", highlights: ["Le tramway 28"] },
  };
  const uyuni: Record<Locale, ExplanationDestination> = {
    ja: { id: "d2", name: "ウユニ塩湖", country: "ボリビア", summary: "四輪駆動車のツアーで巡ります。", highlights: ["四輪駆動車での周遊ツアー"] },
    en: { id: "d2", name: "Uyuni Salt Flat", country: "Bolivia", summary: "Visited on 4x4 tours.", highlights: ["4x4 tours"] },
    es: { id: "d2", name: "Salar de Uyuni", country: "Bolivia", summary: "Se recorre en excursiones en 4x4.", highlights: ["Excursiones en 4x4"] },
    fr: { id: "d2", name: "Salar d’Uyuni", country: "Bolivie", summary: "Il se visite en circuit en 4x4.", highlights: ["Circuits en 4x4"] },
  };
  const lisbonNotes: Record<Locale, string> = {
    ja: "坂の多い街並みを路面電車28番で巡れるので、街歩きを楽しみたい方に合いそうです。",
    en: "Riding Tram 28 up the steep hills suits a traveller who enjoys relaxed city walks.",
    es: "Subir las cuestas en el tranvía 28 encaja con quien disfruta de paseos tranquilos por la ciudad.",
    fr: "Gravir les pentes en tramway 28 convient à qui aime flâner tranquillement en ville.",
  };
  const uyuniNotes: Record<Exclude<Locale, "ja">, string> = {
    en: "The white salt flat, explored on 4x4 tours, suits a traveller drawn to wide open nature.",
    es: "El salar blanco, recorrido en excursiones en 4x4, encaja con quien busca naturaleza abierta.",
    fr: "Le salar blanc, parcouru en circuit en 4x4, convient à qui recherche une nature immense.",
  };

  it("finds digit sequences, joining 4x4 and normalizing full-width digits", () => {
    expect(digitSequences("Tram 28 and 4x4 tours, ２８番")).toEqual(["28", "4x4", "28"]);
    expect([...allowedDigitSequences(uyuni.en)]).toEqual(["4x4"]);
    expect([...allowedDigitSequences(uyuni.ja)]).toEqual([]);
  });

  it.each(["ja", "en", "es", "fr"] as const)("accepts a Lisbon note that copies 28 (%s)", (locale) => {
    expect(checkExplanationText(lisbonNotes[locale], locale, allowedDigitSequences(lisbon[locale]))).toBeNull();
  });

  it.each(["en", "es", "fr"] as const)("accepts an Uyuni note that copies 4x4 (%s)", (locale) => {
    expect(checkExplanationText(uyuniNotes[locale], locale, allowedDigitSequences(uyuni[locale]))).toBeNull();
  });

  it("accepts the same digits written full-width in Japanese", () => {
    expect(checkExplanationText("路面電車２８番で坂の街を巡れるので、街歩きを楽しみたい方に合いそうです。", "ja", allowedDigitSequences(lisbon.ja))).toBeNull();
  });

  it.each([
    ["a digit not in the data", lisbonNotes.en.replace("Tram 28", "Tram 15"), "en", lisbon.en],
    ["a price next to an allowed digit", `${lisbonNotes.en} A ride costs 3 euros.`, "en", lisbon.en],
    ["part of an allowed sequence", "The salt flat is best seen over 4 days of guided tours in open nature.", "en", uyuni.en],
    ["4x4 in Japanese, where the data has none", "ウユニ塩湖は4x4のツアーで巡れるので、広い自然を楽しみたい方に合いそうです。", "ja", uyuni.ja],
    ["another destination's digits", "Uyuni suits a traveller who enjoys Tram 28 and wide open nature.", "en", uyuni.en],
  ] as const)("rejects %s", (_, text, locale, destination) => {
    expect(checkExplanationText(text, locale, allowedDigitSequences(destination))).toBe("digit");
  });

  it("rejects every digit when no data is given", () => {
    expect(checkExplanationText(lisbonNotes.en, "en")).toBe("digit");
  });
});

describe("validateModelOutput", () => {
  const destination = (id: string, highlights: string[] = []): ExplanationDestination => ({
    id,
    name: "ベルカ",
    country: null,
    summary: "石畳の街。",
    highlights,
  });
  const input = (locale: Locale = "ja", destinations = [destination("d1"), destination("d2", ["路面電車28番"])]): ExplanationInput => ({
    locale,
    preferences: [],
    destinations,
  });
  const items = (list: string[], text = JA) => ({ explanations: list.map((id) => ({ id, text })) });

  it("accepts valid output (object or JSON text) with nothing dropped", () => {
    const expected = { ok: true, texts: new Map([["d1", JA], ["d2", JA]]), dropped: [] };
    expect(validateModelOutput(items(["d2", "d1"]), input())).toEqual(expected);
    expect(validateModelOutput(JSON.stringify(items(["d1", "d2"])), input())).toEqual(expected);
  });

  it("trims texts before checking them", () => {
    const result = validateModelOutput({ explanations: [{ id: "d1", text: `  ${JA}  ` }, { id: "d2", text: JA }] }, input());
    expect(result.ok && result.texts.get("d1")).toBe(JA);
  });

  it.each([
    ["non-JSON text", "Here are your explanations", "json"],
    ["broken JSON text", '{"explanations": [', "json"],
    ["undefined", undefined, "json"],
    ["null", null, "shape"],
    ["a wrong shape", { explanations: { d1: JA, d2: JA } }, "shape"],
    ["an extra field", { explanations: [{ id: "d1", text: JA, rank: 1 }, { id: "d2", text: JA }] }, "shape"],
    ["a duplicate ID", items(["d1", "d1"]), "duplicate_id"],
    ["a missing ID", items(["d1"]), "id_set"],
    ["an extra ID", items(["d1", "d2", "d3"]), "id_set"],
    ["an unknown ID", items(["d1", "d9"]), "id_set"],
  ] as const)("discards the whole output for %s (%s)", (_, raw, reason) => {
    expect(validateModelOutput(raw, input())).toEqual({ ok: false, reason, dropped: [] });
  });

  it("keeps the structural check ahead of text guards", () => {
    expect(validateModelOutput(items(["d1", "d1"], "短い"), input())).toMatchObject({ ok: false, reason: "duplicate_id" });
  });

  it.each([
    ["empty text", "   ", "too_short"],
    ["a short text", "短い説明です。", "too_short"],
    ["text over the length limit", "あ".repeat(401), "too_long"],
    ["a digit", `${JA}一泊１万円です。`, "digit"],
    ["a link", `${JA}www.example.org`, "link"],
    ["markup", `${JA}**おすすめ**`, "markup"],
    ["the wrong script", EN, "script"],
  ] as const)("drops only the note with %s and keeps the other", (_, text, reason) => {
    const raw = { explanations: [{ id: "d1", text }, { id: "d2", text: JA }] };
    expect(validateModelOutput(raw, input())).toEqual({ ok: true, texts: new Map([["d2", JA]]), dropped: [reason] });
  });

  it("checks digits against each destination's own data", () => {
    const tram = "坂の多い街並みを路面電車28番で巡れるので、街歩きを楽しみたい方に合いそうです。";
    const raw = { explanations: [{ id: "d1", text: tram }, { id: "d2", text: tram }] };
    expect(validateModelOutput(raw, input())).toEqual({ ok: true, texts: new Map([["d2", tram]]), dropped: ["digit"] });
  });

  it("rejects the output as all_dropped when every note fails, with the reasons in input order", () => {
    const raw = { explanations: [{ id: "d2", text: EN }, { id: "d1", text: `${JA}１位です。` }] };
    expect(validateModelOutput(raw, input())).toEqual({ ok: false, reason: "all_dropped", dropped: ["digit", "script"] });
  });
});
