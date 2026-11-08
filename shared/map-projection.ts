/**
 * Equal Earth projection (Šavrič, Patterson & Jenny, 2018) and the frame of the
 * results-page world map (docs/working/DECISIONS.md ADR-036). The map asset
 * script (`scripts/build-world-map.mjs`) and the result pins use the same
 * functions, so a pin lands where the SVG draws its place. Self-contained, with
 * no imports, so that Node can run the script against this file directly.
 */
const A1 = 1.340264;
const A2 = -0.081106;
const A3 = 0.000893;
const A4 = 0.003796;
const M = Math.sqrt(3) / 2;
const RADIANS = Math.PI / 180;

/** Projected point on the unit sphere; `y` grows northwards. */
export interface ProjectedPoint {
  x: number;
  y: number;
}

export function equalEarth(latitude: number, longitude: number): ProjectedPoint {
  const theta = Math.asin(M * Math.sin(latitude * RADIANS));
  const t2 = theta * theta;
  const t6 = t2 * t2 * t2;
  return {
    x: (longitude * RADIANS * Math.cos(theta)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2))),
    y: theta * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)),
  };
}

/** Inverse of `equalEarth`, solving for the parametric latitude with Newton's method. */
export function equalEarthInverse(x: number, y: number): { latitude: number; longitude: number } {
  let theta = y;
  for (let i = 0; i < 12; i++) {
    const t2 = theta * theta;
    const t6 = t2 * t2 * t2;
    const delta =
      (theta * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)) - y) / (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2));
    theta -= delta;
    if (Math.abs(delta) < 1e-12) break;
  }
  const t2 = theta * theta;
  const t6 = t2 * t2 * t2;
  return {
    latitude: Math.asin(Math.sin(theta) / M) / RADIANS,
    longitude: (M * x * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2))) / Math.cos(theta) / RADIANS,
  };
}

/** The map leaves out Antarctica: no destination lies that far south. */
export const MAP_SOUTH_LIMIT = -60;

const X_EDGE = equalEarth(0, 180).x;
const Y_TOP = equalEarth(90, 0).y;
const Y_BOTTOM = equalEarth(MAP_SOUTH_LIMIT, 0).y;

/** The SVG viewBox is `0 0 MAP_WIDTH MAP_HEIGHT`. */
export const MAP_WIDTH = 1000;
const SCALE = MAP_WIDTH / (2 * X_EDGE);
export const MAP_HEIGHT = Math.round((Y_TOP - Y_BOTTOM) * SCALE);

/** Position of a coordinate in the map's viewBox (origin top left). */
export function toMapPoint(latitude: number, longitude: number): ProjectedPoint {
  const point = equalEarth(latitude, longitude);
  return { x: (point.x + X_EDGE) * SCALE, y: (Y_TOP - point.y) * SCALE };
}

/** Inverse of `toMapPoint`. */
export function fromMapPoint(x: number, y: number): { latitude: number; longitude: number } {
  return equalEarthInverse(x / SCALE - X_EDGE, Y_TOP - y / SCALE);
}
