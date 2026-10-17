import { describe, expect, it } from "vitest";
import { durationStatus, seasonStatus } from "./annotations";
import { destination } from "./test-fixtures";

describe("seasonStatus (E1)", () => {
  const spring = destination("x", {}, { bestMonths: [3, 4, 5] });

  it("compares travel months with best months", () => {
    expect(seasonStatus(spring, [4])).toBe("in_season");
    expect(seasonStatus(spring, [5, 6])).toBe("partly_in_season");
    expect(seasonStatus(spring, [8])).toBe("off_season");
  });

  it("distinguishes missing data from no input", () => {
    expect(seasonStatus(destination("y"), [4])).toBe("unknown");
    expect(seasonStatus(spring, undefined)).toBe("not_applicable");
    expect(seasonStatus(spring, [])).toBe("not_applicable");
  });
});

describe("durationStatus (E1)", () => {
  const place = destination("x", {}, { recommendedDays: { min: 3, max: 6 } });

  it("compares trip days with the recommended range", () => {
    expect(durationStatus(place, 2)).toBe("shorter_than_recommended");
    expect(durationStatus(place, 3)).toBe("within_recommended");
    expect(durationStatus(place, 6)).toBe("within_recommended");
    expect(durationStatus(place, 7)).toBe("longer_than_recommended");
  });

  it("handles open and missing ranges", () => {
    expect(durationStatus(destination("y", {}, { recommendedDays: { min: 4, max: null } }), 30)).toBe("within_recommended");
    expect(durationStatus(destination("z"), 5)).toBe("unknown");
    expect(durationStatus(place, undefined)).toBe("not_applicable");
  });
});
