/**
 * Pin placement and external map links for the results-page map
 * (docs/working/DECISIONS.md ADR-036). Pins use the shared projection, so they
 * land where public/world-map.svg draws their place.
 */
import { MAP_HEIGHT, MAP_WIDTH, toMapPoint } from "../../shared/map-projection";

export interface MapLocation {
  latitude: number;
  longitude: number;
}

export interface MapPin {
  rank: number;
  /** The projected point in the map's viewBox. */
  x: number;
  y: number;
  /** Centre of the numbered badge; moved away from the point when badges would overlap. */
  labelX: number;
  labelY: number;
}

/** Badge radius in viewBox units (the map is MAP_WIDTH units wide). */
export const PIN_RADIUS = 28;

const DIRECTIONS = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4 - Math.PI / 2);

function inFrame(x: number, y: number) {
  return x >= PIN_RADIUS && x <= MAP_WIDTH - PIN_RADIUS && y >= PIN_RADIUS && y <= MAP_HEIGHT - PIN_RADIUS;
}

/**
 * Places a numbered badge for each item in rank order. A badge sits on its
 * point unless it would overlap a badge already placed; then it moves to the
 * nearest free spot on rings around the point, and the map draws a leader line.
 */
export function layoutPins(items: readonly { rank: number; location: MapLocation }[]): MapPin[] {
  const placed: MapPin[] = [];
  const free = (x: number, y: number) =>
    placed.every((pin) => Math.hypot(pin.labelX - x, pin.labelY - y) >= 2 * PIN_RADIUS + 2);
  for (const { rank, location } of [...items].sort((a, b) => a.rank - b.rank)) {
    const { x, y } = toMapPoint(location.latitude, location.longitude);
    let label = { x, y };
    search: for (let ring = 1; !free(label.x, label.y) && ring <= 4; ring++) {
      for (const angle of DIRECTIONS) {
        const candidate = { x: x + Math.cos(angle) * ring * 2.2 * PIN_RADIUS, y: y + Math.sin(angle) * ring * 2.2 * PIN_RADIUS };
        if (inFrame(candidate.x, candidate.y) && free(candidate.x, candidate.y)) {
          label = candidate;
          break search;
        }
      }
    }
    placed.push({ rank, x, y, labelX: label.x, labelY: label.y });
  }
  return placed;
}

/**
 * Google Maps URL for a point (documented "Maps URLs", no key). It carries only
 * the coordinates, never the user's answers or constraints.
 */
export function externalMapUrl(location: MapLocation): string {
  return `https://www.google.com/maps/search/?api=1&query=${String(location.latitude)},${String(location.longitude)}`;
}
