import { describe, expect, it } from "vitest";
import { MAP_HEIGHT, MAP_WIDTH, toMapPoint } from "../../shared/map-projection";
import { externalMapUrl, layoutPins, PIN_RADIUS } from "./mapPins";

const TAIPEI = { latitude: 25.04, longitude: 121.56 };
const PARIS = { latitude: 48.86, longitude: 2.35 };
const PROVENCE = { latitude: 43.53, longitude: 5.45 };
const BANGKOK = { latitude: 13.75, longitude: 100.5 };
const PHUKET = { latitude: 7.88, longitude: 98.39 };
const CHIANG_MAI = { latitude: 18.79, longitude: 98.99 };

describe("layoutPins", () => {
  it("puts a badge on its point when nothing overlaps", () => {
    const [pin] = layoutPins([{ rank: 1, location: TAIPEI }]);
    const point = toMapPoint(TAIPEI.latitude, TAIPEI.longitude);
    expect(pin).toEqual({ rank: 1, x: point.x, y: point.y, labelX: point.x, labelY: point.y });
  });

  it("returns pins in rank order whatever the input order", () => {
    const pins = layoutPins([
      { rank: 3, location: TAIPEI },
      { rank: 1, location: PARIS },
    ]);
    expect(pins.map((pin) => pin.rank)).toEqual([1, 3]);
  });

  it("keeps the better rank on its point and moves close badges apart", () => {
    const pins = layoutPins([
      { rank: 2, location: PROVENCE },
      { rank: 1, location: PARIS },
    ]);
    const [paris, provence] = pins;
    if (!paris || !provence) throw new Error("expected two pins");
    expect([paris.labelX, paris.labelY]).toEqual([paris.x, paris.y]);
    expect(Math.hypot(paris.labelX - provence.labelX, paris.labelY - provence.labelY)).toBeGreaterThanOrEqual(2 * PIN_RADIUS);
  });

  it("separates three nearby badges and keeps them inside the map", () => {
    const pins = layoutPins([
      { rank: 1, location: BANGKOK },
      { rank: 2, location: PHUKET },
      { rank: 3, location: CHIANG_MAI },
    ]);
    for (const [i, a] of pins.entries()) {
      expect(a.labelX).toBeGreaterThanOrEqual(PIN_RADIUS);
      expect(a.labelX).toBeLessThanOrEqual(MAP_WIDTH - PIN_RADIUS);
      expect(a.labelY).toBeGreaterThanOrEqual(PIN_RADIUS);
      expect(a.labelY).toBeLessThanOrEqual(MAP_HEIGHT - PIN_RADIUS);
      for (const b of pins.slice(i + 1)) {
        expect(Math.hypot(a.labelX - b.labelX, a.labelY - b.labelY)).toBeGreaterThanOrEqual(2 * PIN_RADIUS);
      }
    }
  });
});

describe("externalMapUrl", () => {
  it("builds a Google Maps search URL with only the coordinates", () => {
    expect(externalMapUrl({ latitude: -33.87, longitude: 151.21 })).toBe(
      "https://www.google.com/maps/search/?api=1&query=-33.87,151.21",
    );
  });
});
