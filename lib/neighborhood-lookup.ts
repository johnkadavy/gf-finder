/**
 * NYC neighborhood lookup by lat/lng.
 *
 * Resolution order:
 *   1. Custom zones (nyc-custom-zones.ts) — splits compound NTAs into
 *      colloquial sub-neighborhoods (SoHo, DUMBO, Hell's Kitchen, etc.)
 *   2. NTA polygon lookup (nyc-neighborhoods.json) — official 2020 boundaries
 *   3. Alias map (nyc-nta-aliases.ts) — translates bureaucratic NTA names to
 *      the colloquial names New Yorkers actually use
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import nycNeighborhoods from "./nyc-neighborhoods.json";
import { CUSTOM_ZONES } from "./nyc-custom-zones";
import { NTA_ALIASES } from "./nyc-nta-aliases";

type Ring = [number, number][];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

interface NtaFeature {
  type: "Feature";
  properties: { name: string; borough: string };
  geometry:
    | { type: "Polygon"; coordinates: Polygon }
    | { type: "MultiPolygon"; coordinates: MultiPolygon };
}

// ── Point-in-polygon (ray casting) ───────────────────────────────────────────

function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lng: number, lat: number, polygon: Polygon): boolean {
  const [outerRing, ...holes] = polygon;
  if (!pointInRing(lng, lat, outerRing)) return false;
  return !holes.some((hole) => pointInRing(lng, lat, hole));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the colloquial neighborhood name for the given coordinates, or null
 * if the point falls outside all known NYC boundaries.
 *
 * @param lat  latitude  (e.g. 40.7267)
 * @param lng  longitude (e.g. -74.0025)
 */
export function lookupNycNeighborhood(lat: number, lng: number): string | null {
  // 1. Custom zones — sub-neighborhood splits for compound NTAs
  for (const zone of CUSTOM_ZONES) {
    if (pointInPolygon(lng, lat, [zone.polygon as Ring])) {
      return zone.name;
    }
  }

  // 2. NTA polygon lookup
  const features = (nycNeighborhoods as any).features as NtaFeature[];
  for (const feature of features) {
    const { geometry } = feature;
    let matched = false;

    if (geometry.type === "Polygon") {
      matched = pointInPolygon(lng, lat, geometry.coordinates);
    } else if (geometry.type === "MultiPolygon") {
      matched = geometry.coordinates.some((poly) =>
        pointInPolygon(lng, lat, poly)
      );
    }

    if (matched) {
      // 3. Apply alias map
      const ntaName = feature.properties.name;
      return NTA_ALIASES[ntaName] ?? ntaName;
    }
  }

  return null;
}
