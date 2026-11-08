import { describe, expect, it } from "vitest";
import { readLocation } from "../../server/db/location";

describe("readLocation", () => {
  it("returns two stored coordinates as a location", () => {
    expect(readLocation(25.04, 121.56)).toEqual({ location: { latitude: 25.04, longitude: 121.56 }, invalid: false });
    expect(readLocation(-90, 180)).toEqual({ location: { latitude: -90, longitude: 180 }, invalid: false });
  });

  it("treats two empty columns as no location", () => {
    expect(readLocation(null, null)).toEqual({ location: null, invalid: false });
  });

  it.each([
    ["latitude", "longitude"],
    [25.04, null],
    [null, 121.56],
    [Number.NaN, 121.56],
    [91, 0],
    [0, -180.5],
  ])("drops unusable values (%s, %s) and flags them", (latitude, longitude) => {
    expect(readLocation(latitude, longitude)).toEqual({ location: null, invalid: true });
  });
});
