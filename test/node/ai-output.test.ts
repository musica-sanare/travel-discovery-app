/**
 * Text guards and structural checks for model output (docs/working/DECISIONS.md
 * ADR-026). These cases document known patterns only; passing them does not
 * mean a text is accurate.
 */
import { describe, expect, it } from "vitest";
import { checkExplanationText, parseModelOutput, validateModelOutput } from "../../server/ai/output";

const JA = "ゆったりとした街歩きと豊かな食文化があり、あなたが挙げた好みによく合いそうな旅行先です。";
const EN = "Relaxed walks through historic streets and a rich food culture make this a natural fit for what you enjoy.";
const ES = "Sus calles históricas y su cocina variada encajan muy bien con lo que más disfrutas al viajar.";

describe("checkExplanationText", () => {
  it.each([
    [JA, "ja"],
    [EN, "en"],
    [ES, "es"],
    [`${EN} Lisboa`, "es"],
    [`${JA}Lisboa`, "ja"],
    ["ミレトは小さな港町です。", "ja"],
  ] as const)("accepts %s (%s)", (text, locale) => {
    expect(checkExplanationText(text, locale)).toBeNull();
  });

  it.each([
    ["短すぎる説明です。", "ja", "too_short"],
    ["Too short", "en", "too_short"],
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
  ] as const)("rejects %s (%s) as %s", (text, locale, reason) => {
    expect(checkExplanationText(text, locale)).toBe(reason);
  });

  it("does not catch numbers written in words (auxiliary guard only)", () => {
    expect(checkExplanationText(`${JA}三日あれば十分に楽しめます。`, "ja")).toBeNull();
  });
});

describe("parseModelOutput", () => {
  const ids = ["d1", "d2"];
  const output = (items: { id: string; text: string }[]) => ({ explanations: items });

  it("returns texts by ID for exact, valid output (object or JSON text)", () => {
    const value = output([{ id: "d2", text: JA }, { id: "d1", text: JA }]);
    expect(parseModelOutput(value, ids, "ja")).toEqual(new Map([["d2", JA], ["d1", JA]]));
    expect(parseModelOutput(JSON.stringify(value), ids, "ja")).toEqual(new Map([["d2", JA], ["d1", JA]]));
  });

  it("trims texts before checking them", () => {
    expect(parseModelOutput(output([{ id: "d1", text: `  ${EN}  ` }, { id: "d2", text: EN }]), ids, "en")?.get("d1")).toBe(EN);
  });

  it.each([
    ["one invalid text", output([{ id: "d1", text: JA }, { id: "d2", text: `${JA}１位です。` }])],
    ["a missing ID", output([{ id: "d1", text: JA }])],
    ["an extra ID", output([{ id: "d1", text: JA }, { id: "d2", text: JA }, { id: "d3", text: JA }])],
    ["a duplicate ID", output([{ id: "d1", text: JA }, { id: "d1", text: JA }])],
    ["a wrong shape", { explanations: { d1: JA, d2: JA } }],
    ["broken JSON text", '{"explanations": ['],
    ["undefined", undefined],
  ])("discards the whole output for %s", (_, value) => {
    expect(parseModelOutput(value, ids, "ja")).toBeNull();
  });
});

describe("validateModelOutput", () => {
  const ids = ["d1", "d2"];
  const items = (list: string[], text = JA) => ({ explanations: list.map((id) => ({ id, text })) });

  it("accepts valid output", () => {
    expect(validateModelOutput(items(ids), ids, "ja")).toEqual({ ok: true, texts: new Map([["d1", JA], ["d2", JA]]) });
  });

  it.each([
    ["non-JSON text", "Here are your explanations", "json"],
    ["null", null, "shape"],
    ["an extra field", { explanations: [{ id: "d1", text: JA, rank: 1 }, { id: "d2", text: JA }] }, "shape"],
    ["empty text", items(ids, "   "), "shape"],
    ["text over the length limit", items(ids, "x".repeat(401)), "too_long"],
    ["a duplicate ID", items(["d1", "d1"]), "duplicate_id"],
    ["a missing ID", items(["d1"]), "id_set"],
    ["an unknown ID", items(["d1", "d9"]), "id_set"],
    ["a short text", items(ids, "短い説明です。"), "too_short"],
    ["a digit", items(ids, `${JA}一泊１万円です。`), "digit"],
    ["a link", items(ids, `${JA}www.example.org`), "link"],
    ["markup", items(ids, `${JA}**おすすめ**`), "markup"],
    ["the wrong script", items(ids, EN), "script"],
  ] as const)("reports %s as %s", (_, raw, reason) => {
    expect(validateModelOutput(raw, ids, "ja")).toEqual({ ok: false, reason });
  });
});
