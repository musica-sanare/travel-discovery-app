import { describe, expect, it } from "vitest";
import {
  equalEarth,
  equalEarthInverse,
  fromMapPoint,
  MAP_HEIGHT,
  MAP_SOUTH_LIMIT,
  MAP_WIDTH,
  toMapPoint,
} from "../../shared/map-projection";

describe("equalEarth", () => {
  it("matches published values of the projection", () => {
    // Šavrič et al. (2018): the unit-sphere map is 2 × 2.7066 wide and 2 × 1.31736 tall.
    expect(equalEarth(0, 0)).toEqual({ x: 0, y: 0 });
    expect(equalEarth(0, 180).x).toBeCloseTo(2.7066, 4);
    expect(equalEarth(90, 0).y).toBeCloseTo(1.31736, 4);
    // The poles are straight lines, shorter than the equator.
    expect(equalEarth(90, 180).x).toBeGreaterThan(0);
    expect(equalEarth(90, 180).x).toBeLessThan(equalEarth(0, 180).x);
    expect(equalEarth(90, -90).y).toBe(equalEarth(90, 90).y);
  });

  it("is symmetric about the equator and the central meridian", () => {
    const point = equalEarth(35.68, 139.69);
    expect(equalEarth(-35.68, -139.69)).toEqual({ x: -point.x, y: -point.y });
  });

  it.each([
    [0, 0],
    [25.04, 121.56],
    [-45.03, 168.66],
    [60.39, -179.99],
    [-89.9, 180],
  ])("inverts (%s, %s)", (latitude, longitude) => {
    const { x, y } = equalEarth(latitude, longitude);
    const back = equalEarthInverse(x, y);
    expect(back.latitude).toBeCloseTo(latitude, 9);
    expect(back.longitude).toBeCloseTo(longitude, 9);
  });
});

describe("map frame", () => {
  it("spans the world from the antimeridian, the North Pole, and the southern limit", () => {
    expect(toMapPoint(0, -180).x).toBeCloseTo(0, 9);
    expect(toMapPoint(0, 180).x).toBeCloseTo(MAP_WIDTH, 9);
    expect(toMapPoint(90, 0)).toEqual({ x: MAP_WIDTH / 2, y: 0 });
    expect(toMapPoint(MAP_SOUTH_LIMIT, 0).y).toBeCloseTo(MAP_HEIGHT, 0);
    expect(MAP_HEIGHT).toBe(444);
  });

  it("places the equator and prime meridian proportionally", () => {
    const origin = toMapPoint(0, 0);
    expect(origin.x).toBe(MAP_WIDTH / 2);
    expect(origin.y / MAP_WIDTH).toBeCloseTo(1.31736 / (2 * 2.7066), 4);
  });

  it("round-trips pin placement", () => {
    for (const [latitude, longitude] of [
      [25.04, 121.56],
      [-33.87, 151.21],
      [40.71, -74.01],
      [-20.46, -66.83],
    ] as const) {
      const { x, y } = toMapPoint(latitude, longitude);
      const back = fromMapPoint(x, y);
      expect(back.latitude).toBeCloseTo(latitude, 9);
      expect(back.longitude).toBeCloseTo(longitude, 9);
    }
  });
});
