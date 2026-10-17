import { describe, expect, it } from "vitest";
import { SEARCH_LINKS } from "./searchLinks";

describe("SEARCH_LINKS", () => {
  it("are fixed https start pages on the allowlisted hosts without query strings", () => {
    expect(SEARCH_LINKS.map((link) => new URL(link.url).host)).toEqual(["www.google.com", "www.booking.com"]);
    for (const link of SEARCH_LINKS) {
      const url = new URL(link.url);
      expect(url.protocol).toBe("https:");
      expect(url.search).toBe("");
      expect(url.hash).toBe("");
      expect(url.username + url.password).toBe("");
    }
  });
});
