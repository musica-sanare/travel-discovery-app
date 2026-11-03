import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ja } from "../../src/i18n/messages/ja";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const ORIGIN = "https://travel-discovery.apps.musica-sanare.com/";

describe("public page basics (ADR-034, Phase 19)", () => {
  const html = read("index.html");
  const meta = (attribute: "name" | "property", key: string) =>
    new RegExp(`<meta ${attribute}="${key}" content="([^"]*)"`).exec(html)?.[1];

  it("carries the default-locale title, description, and Open Graph tags", () => {
    expect(html).toContain(`<title>${ja.meta.title}</title>`);
    expect(meta("name", "description")).toBe(ja.meta.description);
    expect(meta("property", "og:title")).toBe(ja.meta.title);
    expect(meta("property", "og:description")).toBe(ja.meta.description);
    expect(meta("property", "og:type")).toBe("website");
    expect(meta("property", "og:url")).toBe(ORIGIN);
    expect(meta("property", "og:locale")).toBe("ja_JP");
  });

  it("points the canonical URL at the custom domain and links the favicon", () => {
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}" />`);
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />');
  });

  it("ships a favicon without scripts and a robots.txt that allows crawlers", () => {
    const favicon = read("public/favicon.svg");
    expect(favicon.startsWith("<svg")).toBe(true);
    expect(favicon).not.toMatch(/<script|href=|xlink/i);
    expect(read("public/robots.txt")).toBe("User-agent: *\nAllow: /\n");
  });
});
