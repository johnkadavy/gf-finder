/**
 * Tiled geo ingest — divides the neighborhood polygon into a grid of small
 * cells and runs one Google Places query per cell. Each cell returns up to 60
 * results (3 paginated pages of 20), so tiling breaks through the single-query
 * result cap and gives systematic spatial coverage regardless of street layout.
 *
 * Compare to the street-based ingest:
 *   Street: 13 queries × 60 results = ~780 raw, biased toward named streets
 *   Tiled:  20 tiles  × 60 results = ~1200 raw, uniform spatial coverage
 *
 * Deduplicates by google_place_id — safe to run on already-ingested
 * neighborhoods as a top-up pass.
 *
 * Usage:
 *   npx tsx scripts/ingest-neighborhood-geo.ts --neighborhood "West Village" --city "New York" --region "New York City"
 *   npx tsx scripts/ingest-neighborhood-geo.ts --neighborhood "Williamsburg" --city "New York" --region "New York City" --types restaurant,cafe,bakery
 *   npx tsx scripts/ingest-neighborhood-geo.ts --neighborhood "Astoria" --city "New York" --region "New York City" --cell-size 300
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY!;

function getArg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

const neighborhood = getArg("--neighborhood");
const city         = getArg("--city");
const region       = getArg("--region");
const geoName      = getArg("--geo-name"); // GeoJSON polygon name if different from --neighborhood
const bboxArg      = getArg("--bbox");     // "minLat,maxLat,minLng,maxLng" — bypasses GeoJSON lookup
const typesArg     = getArg("--types") ?? "restaurant";
const cellSizeM    = parseInt(getArg("--cell-size") ?? "400", 10);
const placeTypes   = typesArg.split(",").map((s) => s.trim()).filter(Boolean);

if (!neighborhood || !city) {
  console.error(
    "Usage: npx tsx scripts/ingest-neighborhood-geo.ts --neighborhood <name> --city <name> [--region <name>] [--geo-name <geojson-name>] [--bbox minLat,maxLat,minLng,maxLng] [--types restaurant,cafe,bakery] [--cell-size 400]"
  );
  process.exit(1);
}

// ── GeoJSON types ─────────────────────────────────────────────────────────────

type Position = [number, number]; // [lng, lat]
type Ring = Position[];

interface NbrhdFeature {
  type: "Feature";
  properties: { name: string; borough: string };
  geometry:
    | { type: "Polygon"; coordinates: Ring[] }
    | { type: "MultiPolygon"; coordinates: Ring[][] };
}

interface FeatureCollection {
  type: "FeatureCollection";
  features: NbrhdFeature[];
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

function exteriorRings(geometry: NbrhdFeature["geometry"]): Ring[] {
  if (geometry.type === "Polygon") return [geometry.coordinates[0]];
  return geometry.coordinates.map((poly) => poly[0]);
}

// Ray-casting point-in-polygon test against a single ring.
function pointInRing(lat: number, lng: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; // GeoJSON is [lng, lat]
    const [xj, yj] = ring[j];
    if (((yi > lat) !== (yj > lat)) &&
        (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// Returns true if (lat, lng) is inside any of the provided rings.
function pointInPolygon(lat: number, lng: number, rings: Ring[]): boolean {
  return rings.some((ring) => pointInRing(lat, lng, ring));
}

// ── Tile grid ─────────────────────────────────────────────────────────────────

interface Tile { minLat: number; maxLat: number; minLng: number; maxLng: number }

const OVERLAP = 0.10; // 10 % overlap so nothing falls through seams

function buildTileGrid(rings: Ring[], cellM: number): Tile[] {
  // Bounding box
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }

  const cosLat  = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const tileLat  = cellM / 111_320;
  const tileLng  = cellM / (111_320 * cosLat);
  const stepLat  = tileLat * (1 - OVERLAP);
  const stepLng  = tileLng * (1 - OVERLAP);

  const tiles: Tile[] = [];

  for (let lat = minLat; lat < maxLat; lat += stepLat) {
    for (let lng = minLng; lng < maxLng; lng += stepLng) {
      const tileMaxLat = Math.min(lat + tileLat, maxLat);
      const tileMaxLng = Math.min(lng + tileLng, maxLng);

      // Skip tiles whose centre is outside the polygon — saves API calls on
      // neighbourhoods with large water or park edges.
      const centreLat = (lat + tileMaxLat) / 2;
      const centreLng = (lng + tileMaxLng) / 2;
      if (!pointInPolygon(centreLat, centreLng, rings)) continue;

      tiles.push({ minLat: lat, maxLat: tileMaxLat, minLng: lng, maxLng: tileMaxLng });
    }
  }

  return tiles;
}

// ── Google Places ─────────────────────────────────────────────────────────────

interface RawPlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  websiteUri?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  businessStatus?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  regularOpeningHours?: { periods?: unknown[]; weekdayDescriptions?: string[] };
  types?: string[];
}

const PRICE_LEVEL_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.nationalPhoneNumber",
  "places.businessStatus",
  "places.rating",
  "places.userRatingCount",
  "places.types",
  "places.priceLevel",
  "places.regularOpeningHours",
  "nextPageToken",
].join(",");

const TYPE_QUERY: Record<string, string> = {
  restaurant: "restaurants",
  cafe:       "cafes",
  bakery:     "bakeries",
  bar:        "bars",
  deli:       "delis",
};

async function searchTile(tile: Tile, includedType: string): Promise<RawPlace[]> {
  const all: RawPlace[] = [];
  let pageToken: string | undefined;

  do {
    const body: Record<string, unknown> = {
      textQuery:   TYPE_QUERY[includedType] ?? `${includedType}s`,
      maxResultCount: 20,
      includedType,
      locationRestriction: {
        rectangle: {
          low:  { latitude: tile.minLat, longitude: tile.minLng },
          high: { latitude: tile.maxLat, longitude: tile.maxLng },
        },
      },
    };
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_API_KEY,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error(`\n    API error (${res.status}): ${(await res.text()).slice(0, 200)}`);
      break;
    }

    const data = await res.json();
    all.push(...(data.places ?? []));
    pageToken = data.nextPageToken;
    if (pageToken) await new Promise((r) => setTimeout(r, 500));
  } while (pageToken);

  return all;
}

// ── Slug helpers (mirrors ingest-neighborhood.ts) ─────────────────────────────

function toSlugPart(s: string): string {
  return s
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildBaseSlug(name: string, nbhd: string | null, c: string): string {
  const namePart     = toSlugPart(name);
  const locationPart = toSlugPart(nbhd ?? c);
  if (namePart.endsWith(locationPart)) return namePart;
  return `${namePart}-${locationPart}`;
}

function assignSlug(name: string, nbhd: string | null, c: string, taken: Set<string>): string {
  const base = buildBaseSlug(name, nbhd, c);
  let candidate = base;
  let suffix = 2;
  while (taken.has(candidate)) { candidate = `${base}-${suffix}`; suffix++; }
  taken.add(candidate);
  return candidate;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!GOOGLE_API_KEY) {
    console.error("GOOGLE_MAPS_API_KEY is not set in .env.local");
    process.exit(1);
  }

  console.log(`\nGF Finder — Tiled Geo Ingest`);
  console.log(`  Neighborhood : ${neighborhood}${geoName ? ` (polygon: ${geoName})` : ""}${bboxArg ? ` (bbox: ${bboxArg})` : ""}`);
  console.log(`  City         : ${city}`);
  console.log(`  Region       : ${region ?? "(not set)"}`);
  console.log(`  Types        : ${placeTypes.join(", ")}`);
  console.log(`  Cell size    : ${cellSizeM}m\n`);

  // 1. Resolve rings — either from explicit --bbox or from GeoJSON polygon
  let rings: Ring[];

  if (bboxArg) {
    const parts = bboxArg.split(",").map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) {
      console.error('--bbox must be four numbers: minLat,maxLat,minLng,maxLng');
      process.exit(1);
    }
    const [minLat, maxLat, minLng, maxLng] = parts;
    // Build a rectangular ring (GeoJSON: [lng, lat], closed)
    rings = [[
      [minLng, minLat], [maxLng, minLat],
      [maxLng, maxLat], [minLng, maxLat],
      [minLng, minLat],
    ]];
    console.log(`Using explicit bounding box`);
  } else {
    const geojsonPath = path.join(process.cwd(), "lib", "nyc-neighborhoods.json");
    process.stdout.write("Loading neighborhood polygon... ");
    const geojson = JSON.parse(fs.readFileSync(geojsonPath, "utf8")) as FeatureCollection;

    const feature =
      geojson.features.find((f) => f.properties.name === (geoName ?? neighborhood)) ??
      geojson.features.find(
        (f) => f.properties.name.toLowerCase() === (geoName ?? neighborhood)!.toLowerCase()
      );

    if (!feature) {
      console.error(`\nNeighborhood "${geoName ?? neighborhood}" not found in nyc-neighborhoods.json.`);
      console.error(
        `Sample names: ${geojson.features.slice(0, 10).map((f) => f.properties.name).join(", ")}`
      );
      process.exit(1);
    }

    rings = exteriorRings(feature.geometry);
    console.log(`found (${feature.properties.borough})`);
  }

  const tiles = buildTileGrid(rings, cellSizeM);
  console.log(`  ${tiles.length} tiles at ${cellSizeM}m (${Math.round(cellSizeM * (1 - OVERLAP))}m step, 10% overlap)\n`);

  // 2. Query each tile for each place type
  const allPlaces = new Map<string, RawPlace>();

  for (const type of placeTypes) {
    let typeNew = 0;
    let totalResults = 0;

    for (let i = 0; i < tiles.length; i++) {
      const results = await searchTile(tiles[i], type);
      const operational = results.filter(
        (p) => !p.businessStatus || p.businessStatus === "OPERATIONAL"
      );
      totalResults += operational.length;

      for (const place of operational) {
        if (!allPlaces.has(place.id)) { allPlaces.set(place.id, place); typeNew++; }
      }

      process.stdout.write(
        `\r  ${type}: tile ${String(i + 1).padStart(2)}/${tiles.length}  ` +
        `${String(totalResults).padStart(4)} results  ${String(typeNew).padStart(4)} unique`
      );
      await new Promise((r) => setTimeout(r, 300));
    }

    console.log(); // newline after tile progress
  }

  const total = allPlaces.size;
  console.log(`\nTotal unique operational places: ${total}`);

  if (total === 0) {
    console.log("Nothing to upsert.");
    return;
  }

  // Sort by review count descending
  const sorted = [...allPlaces.values()].sort(
    (a, b) => (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0)
  );

  // 3. Load all existing slugs and place_ids (paginated to bypass Supabase max-rows cap)
  process.stdout.write("Loading existing DB records... ");

  async function fetchAllPages<T extends object>(
    table: string,
    selectCols: string,
    filters: (q: ReturnType<typeof supabase.from>) => ReturnType<typeof supabase.from>,
  ): Promise<T[]> {
    const PAGE = 1000;
    const results: T[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await filters(
        supabase.from(table).select(selectCols)
      ).range(from, from + PAGE - 1);
      if (error) break;
      results.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
    return results;
  }

  const existingSlugsRows = await fetchAllPages<{ slug: string }>(
    "restaurants", "slug",
    (q) => q.not("slug", "is", null),
  );
  const takenSlugs = new Set(existingSlugsRows.map((r) => r.slug));

  const existingPlaces = await fetchAllPages<{ google_place_id: string; name: string; slug: string | null }>(
    "restaurants", "google_place_id, name, slug",
    (q) => q.not("google_place_id", "is", null),
  );

  const existingSlugByPlaceId = new Map(
    existingPlaces.map((r) => [r.google_place_id, r.slug])
  );
  const existingPlaceIds = new Set(existingPlaces.map((r) => r.google_place_id));
  const existingNameToPlaceId = new Map(
    existingPlaces.map((r) => [r.name.toLowerCase(), r.google_place_id])
  );
  console.log(`${existingPlaces.length} restaurants loaded\n`);

  // 4. Build rows
  const nbhdForSlug = neighborhood !== city ? neighborhood : null;
  const seenNames   = new Set<string>();

  const rows = sorted
    .filter((place) => {
      const nameLower = (place.displayName?.text ?? "").toLowerCase();

      if (existingPlaceIds.has(place.id)) return true;

      if (
        existingNameToPlaceId.has(nameLower) &&
        existingNameToPlaceId.get(nameLower) !== place.id
      ) {
        return false; // name exists with different place_id — skip silently
      }

      if (seenNames.has(nameLower)) return false;
      seenNames.add(nameLower);
      return true;
    })
    .map((place) => {
      const existingSlug = existingSlugByPlaceId.get(place.id);
      const slug = existingSlug ?? assignSlug(
        place.displayName?.text ?? "unknown",
        nbhdForSlug,
        city!,
        takenSlugs
      );

      return {
        google_place_id: place.id,
        name:            place.displayName?.text ?? "Unknown",
        address:         place.formattedAddress ?? null,
        lat:             place.location?.latitude ?? null,
        lng:             place.location?.longitude ?? null,
        website_url:     place.websiteUri ?? null,
        google_maps_url: place.googleMapsUri ?? null,
        phone:           place.nationalPhoneNumber ?? null,
        city:            city!,
        neighborhood:    nbhdForSlug,
        region:          region ?? null,
        cuisine_types:   place.types ?? null,
        google_rating:   place.rating ?? null,
        price_level:     place.priceLevel ? (PRICE_LEVEL_MAP[place.priceLevel] ?? null) : null,
        opening_hours:   place.regularOpeningHours ?? null,
        source:          "geo_ingest",
        slug,
        ingested_at:     new Date().toISOString(),
      };
    });

  const newRows     = rows.filter((r) => !existingPlaceIds.has(r.google_place_id));
  const refreshRows = rows.filter((r) =>  existingPlaceIds.has(r.google_place_id));

  console.log(`  ${newRows.length} new  |  ${refreshRows.length} existing (metadata refresh)\n`);

  // 5a. Refresh existing rows — update without touching slug
  let refreshed = 0;
  await Promise.all(refreshRows.map(async ({ slug: _slug, ...fields }) => {
    const { error } = await supabase
      .from("restaurants")
      .update(fields)
      .eq("google_place_id", fields.google_place_id);
    if (error) console.error(`  Refresh error for "${fields.name}":`, error.message);
    else refreshed++;
  }));

  // 5b. Insert new rows individually with conflict handling.
  //     - Slug collision → retry with place_id suffix
  //     - Any other unique constraint → already in DB elsewhere, skip
  let inserted = 0;
  let alreadyElsewhere = 0;

  for (const row of newRows) {
    const { error } = await supabase.from("restaurants").insert(row);
    if (!error) { inserted++; continue; }
    if (error.code !== "23505") { console.error(`  Insert error for "${row.name}":`, error.message); continue; }

    if (error.message.includes("restaurants_slug_key")) {
      const fallback = `${row.slug}-${row.google_place_id.slice(-6)}`;
      const { error: e2 } = await supabase.from("restaurants").insert({ ...row, slug: fallback });
      if (!e2) { inserted++; continue; }
      if (e2.code !== "23505") { console.error(`  Insert error for "${row.name}":`, e2.message); continue; }
    }

    // google_place_id or name+city+neighborhood conflict — already in DB
    alreadyElsewhere++;
  }

  console.log(`✓ Inserted ${inserted} new  |  refreshed ${refreshed} existing  |  ${alreadyElsewhere} already in DB elsewhere\n`);

  if (inserted > 0) {
    console.log(`New restaurants (top 10 by review count):`);
    newRows
      .filter((r) => !existingPlaceIds.has(r.google_place_id))
      .slice(0, 10)
      .forEach((r, i) => {
        const place = allPlaces.get(r.google_place_id)!;
        console.log(
          `  ${String(i + 1).padStart(2)}. ${r.name.padEnd(35)} ` +
          `${String(place.userRatingCount ?? 0).padStart(6)} reviews  ${place.rating ?? "?"} ★`
        );
      });
  }

  console.log(`
Next steps:
  1. Push new restaurants to Airtable for GF enrichment:
     npx tsx scripts/populate-airtable.ts --neighborhood "${neighborhood}" --city "${city}"
  2. Wait for Airtable AI fields, then sync back:
     npx tsx scripts/sync-airtable.ts
`);
}

main();
