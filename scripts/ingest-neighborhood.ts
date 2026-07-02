/**
 * Ingests restaurants for a neighborhood using street-level Google Places queries.
 * Reads streets from the `neighborhood_streets` table, runs one query per street,
 * deduplicates by google_place_id, sorts by review count, and upserts into `restaurants`.
 *
 * Usage:
 *   npx tsx scripts/ingest-neighborhood.ts --neighborhood "West Village" --city "New York"
 *   npx tsx scripts/ingest-neighborhood.ts --neighborhood "West Village" --city "New York" --count 200
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

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
const city = getArg("--city");
const region = getArg("--region");
const count = parseInt(getArg("--count") ?? "9999", 10);

if (!neighborhood || !city) {
  console.error(
    "Usage: npx tsx scripts/ingest-neighborhood.ts --neighborhood <name> --city <name> --region <name> [--count <n>]"
  );
  process.exit(1);
}

const PRICE_LEVEL_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

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


async function searchStreet(query: string): Promise<RawPlace[]> {
  const all: RawPlace[] = [];
  let pageToken: string | undefined;

  do {
    const body: Record<string, unknown> = {
      textQuery: query,
      maxResultCount: 20,
      includedType: "restaurant",
    };
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_API_KEY,
        "X-Goog-FieldMask": [
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
        ].join(","),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error(`    API error (${res.status}): ${(await res.text()).slice(0, 200)}`);
      break;
    }

    const data = await res.json();
    all.push(...(data.places ?? []));
    pageToken = data.nextPageToken;
    if (pageToken) await new Promise((r) => setTimeout(r, 500));
  } while (pageToken);

  return all;
}

// ── Slug generation (mirrors backfill-slugs.ts logic) ────────────────────────

function toSlugPart(s: string): string {
  return s
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildBaseSlug(name: string, nbhd: string | null, c: string): string {
  const namePart = toSlugPart(name);
  const locationPart = toSlugPart(nbhd ?? c);
  if (namePart.endsWith(locationPart)) return namePart;
  return `${namePart}-${locationPart}`;
}

function assignSlug(name: string, nbhd: string | null, c: string, taken: Set<string>): string {
  const base = buildBaseSlug(name, nbhd, c);
  let candidate = base;
  let suffix = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix++;
  }
  taken.add(candidate);
  return candidate;
}

async function main() {
  if (!GOOGLE_API_KEY) {
    console.error("GOOGLE_MAPS_API_KEY is not set in .env.local");
    process.exit(1);
  }

  console.log(`\nGF Finder — Neighborhood Ingest`);
  console.log(`  Neighborhood : ${neighborhood}`);
  console.log(`  City         : ${city}`);
  console.log(`  Region       : ${region ?? "(not set)"}`);
  console.log(`  Count cap    : ${count === 9999 ? "none" : count}\n`);

  // Load neighborhood
  const { data: nbhd, error: nbhdError } = await supabase
    .from("neighborhoods")
    .select("id")
    .eq("name", neighborhood)
    .eq("city", city)
    .maybeSingle();

  if (nbhdError || !nbhd) {
    console.error(
      `Neighborhood "${neighborhood}, ${city}" not found in DB.\nRun setup-neighborhood.ts first.`
    );
    process.exit(1);
  }

  // Load active streets ordered by priority
  const { data: streets, error: streetsError } = await supabase
    .from("neighborhood_streets")
    .select("street_name, priority")
    .eq("neighborhood_id", nbhd.id)
    .eq("active", true)
    .order("priority", { ascending: true });

  if (streetsError || !streets || streets.length === 0) {
    console.error("No active streets found. Add streets via setup-neighborhood.ts or Supabase.");
    process.exit(1);
  }

  console.log(`Running ${streets.length} street queries:\n`);

  // Run one query per street, track yield
  const allPlaces = new Map<string, RawPlace>();
  const streetStats: { street: string; raw: number; new: number }[] = [];

  for (const { street_name } of streets) {
    const query = `restaurants on ${street_name}, ${neighborhood}, ${city}`;
    process.stdout.write(`  ${street_name.padEnd(35)}`);

    const results = await searchStreet(query);
    const operational = results.filter(
      (p) => !p.businessStatus || p.businessStatus === "OPERATIONAL"
    );

    let newCount = 0;
    for (const place of operational) {
      if (!allPlaces.has(place.id)) {
        allPlaces.set(place.id, place);
        newCount++;
      }
    }

    streetStats.push({ street: street_name, raw: operational.length, new: newCount });
    console.log(`${String(operational.length).padStart(3)} results  (+${newCount} new)`);

    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\nTotal unique operational restaurants: ${allPlaces.size}`);

  // Sort by review count (popularity)
  const sorted = [...allPlaces.values()].sort(
    (a, b) => (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0)
  );

  const top = sorted.slice(0, count);
  console.log(`Upserting ${top.length} restaurants...\n`);

  // Load all existing slugs so new ones don't collide (paginated — PostgREST caps at 1000/page)
  const slugAccum: string[] = [];
  const placeAccum: { google_place_id: string; slug: string | null }[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: slugPage } = await supabase
      .from("restaurants")
      .select("slug")
      .not("slug", "is", null)
      .range(from, from + PAGE - 1);
    slugAccum.push(...(slugPage ?? []).map((r) => r.slug as string));
    if (!slugPage || slugPage.length < PAGE) break;
  }
  const takenSlugs = new Set(slugAccum);

  // Also load existing place_ids so we can reuse their existing slugs on re-ingest (paginated)
  for (let from = 0; ; from += PAGE) {
    const { data: placePage } = await supabase
      .from("restaurants")
      .select("google_place_id, slug")
      .not("google_place_id", "is", null)
      .range(from, from + PAGE - 1);
    placeAccum.push(...(placePage ?? []));
    if (!placePage || placePage.length < PAGE) break;
  }
  const existingSlugByPlaceId = new Map(
    placeAccum.map((r) => [r.google_place_id, r.slug as string | null])
  );

  // Build rows
  const nbhdForSlug = neighborhood !== city ? neighborhood : null;
  const rows = top.map((place) => {
    // Reuse existing slug if this place was already ingested
    const existingSlug = existingSlugByPlaceId.get(place.id);
    const slug = existingSlug ?? assignSlug(place.displayName?.text ?? "unknown", nbhdForSlug, city, takenSlugs);

    return {
      google_place_id: place.id,
      name: place.displayName?.text ?? "Unknown",
      address: place.formattedAddress ?? null,
      lat: place.location?.latitude ?? null,
      lng: place.location?.longitude ?? null,
      website_url: place.websiteUri ?? null,
      google_maps_url: place.googleMapsUri ?? null,
      phone: place.nationalPhoneNumber ?? null,
      city,
      neighborhood: nbhdForSlug,
      region: region ?? null,
      cuisine_types: place.types ?? null,
      google_rating: place.rating ?? null,
      price_level: place.priceLevel ? (PRICE_LEVEL_MAP[place.priceLevel] ?? null) : null,
      opening_hours: place.regularOpeningHours ?? null,
      source: "neighborhood_ingest",
      slug,
      ingested_at: new Date().toISOString(),
    };
  });

  // Fetch all existing rows for this city+neighborhood to detect conflicts
  const { data: existing } = await supabase
    .from("restaurants")
    .select("name, google_place_id")
    .eq("city", city)
    .eq("neighborhood", neighborhood);

  const existingByPlaceId = new Set((existing ?? []).map((r) => r.google_place_id).filter(Boolean));
  // All existing names — include rows with null place_id so they're caught by the name conflict check
  const existingNameToPlaceId = new Map(
    (existing ?? []).map((r) => [r.name.toLowerCase(), r.google_place_id ?? null])
  );

  // Also deduplicate new rows by name (keep first = highest review count)
  const seenNames = new Set<string>();
  const safeRows = rows.filter((r) => {
    const nameLower = r.name.toLowerCase();

    // Already in DB with same place_id → safe update, but still track name so a
    // second row in this batch with the same name doesn't slip through
    if (existingByPlaceId.has(r.google_place_id)) {
      seenNames.add(nameLower);
      return true;
    }

    // Name exists in DB with a different place_id → skip to avoid constraint violation
    if (existingNameToPlaceId.has(nameLower) && existingNameToPlaceId.get(nameLower) !== r.google_place_id) {
      console.log(`  Skipping "${r.name}" — name already exists with different place_id`);
      return false;
    }

    // Duplicate name within new rows (e.g. two Starbucks) → keep only first
    if (seenNames.has(nameLower)) {
      console.log(`  Skipping duplicate "${r.name}"`);
      return false;
    }
    seenNames.add(nameLower);
    return true;
  });

  let upserted = 0;
  let upsertSkipped = 0;
  for (const row of safeRows) {
    const { error: upsertError } = await supabase
      .from("restaurants")
      .upsert(row, { onConflict: "google_place_id" });
    if (upsertError) {
      if (upsertError.code === "23505") {
        console.log(`  Skipping "${row.name}" — constraint conflict`);
        upsertSkipped++;
      } else {
        console.error("Upsert failed:", upsertError.message);
        process.exit(1);
      }
    } else {
      upserted++;
    }
  }

  console.log(`✓ Upserted ${upserted} restaurants${upsertSkipped ? ` (${upsertSkipped} skipped due to conflicts)` : ""}\n`);

  // Street yield summary
  console.log("Street yield summary:");
  console.log("  " + "Street".padEnd(35) + "Results  New");
  console.log("  " + "─".repeat(50));
  for (const s of streetStats) {
    console.log(
      `  ${s.street.padEnd(35)}${String(s.raw).padStart(4)}     ${String(s.new).padStart(4)}`
    );
  }

  console.log("\nTop 10 by review count:");
  top.slice(0, 10).forEach((p, i) => {
    console.log(
      `  ${String(i + 1).padStart(2)}. ${(p.displayName?.text ?? "?").padEnd(35)} ` +
        `${String(p.userRatingCount ?? 0).padStart(6)} reviews  ${p.rating ?? "?"} ★`
    );
  });
}

main();
