/**
 * Detects new restaurant openings from Airtable sources table.
 *
 * Reads records from an Airtable "sources" table where each record contains
 * a JSON list of restaurants extracted from a new openings digest article.
 * For each restaurant, looks up the Google Place ID, checks if it already
 * exists in Supabase, and pushes net-new ones to the main Airtable
 * restaurants table for GF scoring.
 *
 * Usage:
 *   npx tsx scripts/detect-new-restaurants.ts --city "New York"
 *   npx tsx scripts/detect-new-restaurants.ts --city "New York" --dry-run
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY!;
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY!;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME!; // main restaurants table

const SOURCES_TABLE_NAME = process.env.AIRTABLE_SOURCES_TABLE_NAME ?? "New Restaurant Sources";
const SOURCES_VIEW_ID = "viwUfgmqHKb6cP7Fy";
const FIELD_CITY = "City";
const FIELD_RESTAURANTS_JSON = "Output";

function getArg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

const city = getArg("--city");
const dryRun = process.argv.includes("--dry-run");

if (!city) {
  console.error("Usage: npx tsx scripts/detect-new-restaurants.ts --city <name> [--dry-run]");
  process.exit(1);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExtractedRestaurant {
  name: string;
  neighborhood: string | null;
  cuisine: string | null;
  notes: string | null;
}

interface PlaceResult {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  websiteUri?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  types?: string[];
}


// ── Airtable helpers ──────────────────────────────────────────────────────────

async function fetchSourceRecords(): Promise<{ city: string; restaurants: ExtractedRestaurant[] }[]> {
  const results: { city: string; restaurants: ExtractedRestaurant[] }[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(SOURCES_TABLE_NAME)}`
    );
    url.searchParams.append("fields[]", FIELD_CITY);
    url.searchParams.append("fields[]", FIELD_RESTAURANTS_JSON);
    url.searchParams.set("view", SOURCES_VIEW_ID);
    url.searchParams.set("filterByFormula", `{${FIELD_CITY}} = "${city}"`);
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });

    if (!res.ok) throw new Error(`Airtable API error: ${res.status} ${await res.text()}`);

    const data = await res.json();

    for (const record of data.records) {
      const recordCity = record.fields[FIELD_CITY] as string | undefined;
      const rawField = record.fields[FIELD_RESTAURANTS_JSON];
      const rawJson = typeof rawField === "string"
        ? rawField
        : (rawField as { state?: string; value?: string | null } | undefined)?.state === "generated"
          ? ((rawField as { value?: string | null }).value ?? null)
          : null;
      if (!recordCity || !rawJson) continue;

      // Airtable AI fields sometimes double-escape quotes ("" → ")
      const cleaned = rawJson.replace(/""/g, '"').trim();
      // Strip surrounding quotes if the whole value is wrapped in them
      const jsonStr = cleaned.startsWith('"') && cleaned.endsWith('"')
        ? cleaned.slice(1, -1)
        : cleaned;

      try {
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) {
          results.push({ city: recordCity, restaurants: parsed });
        }
      } catch {
        console.warn(`  Could not parse JSON for a source record — skipping`);
      }
    }

    offset = data.offset;
  } while (offset);

  return results;
}

async function fetchExistingPlaceIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  let offset: string | undefined;

  do {
    const url = new URL(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`
    );
    url.searchParams.append("fields[]", "google_place_id");
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });

    if (!res.ok) throw new Error(`Airtable API error: ${res.status} ${await res.text()}`);

    const data = await res.json();
    for (const r of data.records) {
      if (r.fields.google_place_id) ids.add(r.fields.google_place_id);
    }
    offset = data.offset;
  } while (offset);

  return ids;
}

async function createAirtableRecord(place: PlaceResult, candidate: ExtractedRestaurant, cityName: string) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        name: place.displayName?.text ?? candidate.name,
        google_place_id: place.id,
        city: cityName,
        address: place.formattedAddress ?? undefined,
        phone: place.nationalPhoneNumber ?? undefined,
        website: place.websiteUri ?? undefined,
        lat: place.location?.latitude != null ? String(place.location.latitude) : undefined,
        lng: place.location?.longitude != null ? String(place.location.longitude) : undefined,
      },
      typecast: true,
    }),
  });
  if (!res.ok) throw new Error(`Airtable create error: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Google Places helpers ─────────────────────────────────────────────────────

async function lookupPlace(name: string, cityName: string): Promise<PlaceResult | null> {
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
        "places.rating",
        "places.userRatingCount",
        "places.types",
      ].join(","),
    },
    body: JSON.stringify({
      textQuery: `${name} restaurant ${cityName}`,
      maxResultCount: 1,
      includedType: "restaurant",
    }),
  });

  if (!res.ok) {
    console.warn(`  Google API error for "${name}": ${res.status}`);
    return null;
  }

  const data = await res.json();
  return data.places?.[0] ?? null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nGF Finder — Detect New Restaurants`);
  console.log(`  City    : ${city}`);
  console.log(`  Dry run : ${dryRun}\n`);

  // 1. Load source records from Airtable
  console.log(`Loading sources from Airtable ("${SOURCES_TABLE_NAME}")...`);
  const sources = await fetchSourceRecords();
  const raw = sources.flatMap((s) => s.restaurants);
  // Dedupe by normalized name (keep first occurrence)
  const seen = new Set<string>();
  const allCandidates = raw.filter((r) => {
    const key = r.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  console.log(`  ${sources.length} source records → ${raw.length} candidates → ${allCandidates.length} after dedup\n`);

  if (allCandidates.length === 0) {
    console.log("No candidates found. Check the table name and field names.");
    return;
  }

  // 2. Load existing place IDs from both Airtable and Supabase
  console.log("Fetching existing place IDs from Airtable...");
  const existingAirtable = await fetchExistingPlaceIds();
  console.log(`  ${existingAirtable.size} existing in Airtable`);

  const { data: supabaseRows } = await supabase
    .from("restaurants")
    .select("google_place_id")
    .eq("city", city);
  const existingSupabase = new Set((supabaseRows ?? []).map((r) => r.google_place_id).filter(Boolean));
  console.log(`  ${existingSupabase.size} existing in Supabase for ${city}\n`);

  // 3. Look up each candidate on Google Places
  console.log("Looking up candidates on Google Places...\n");

  let newCount = 0;
  let alreadyExists = 0;
  let notFound = 0;

  for (const candidate of allCandidates) {
    process.stdout.write(`  ${candidate.name.padEnd(40)}`);

    const place = await lookupPlace(candidate.name, city!);
    await new Promise((r) => setTimeout(r, 200)); // rate limit

    if (!place) {
      console.log("not found on Google");
      notFound++;
      continue;
    }

    if (existingAirtable.has(place.id) || existingSupabase.has(place.id)) {
      console.log(`already exists  (${place.id.slice(-8)})`);
      alreadyExists++;
      continue;
    }

    console.log(`NEW  ${place.displayName?.text ?? candidate.name}  (${place.id.slice(-8)})`);
    newCount++;

    if (dryRun) continue;

    // 4. Upsert to Supabase
    const slug = [candidate.name, city, place.id.slice(-6)]
      .join("-")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    await supabase.from("restaurants").upsert({
      google_place_id: place.id,
      name: place.displayName?.text ?? candidate.name,
      address: place.formattedAddress ?? null,
      lat: place.location?.latitude ?? null,
      lng: place.location?.longitude ?? null,
      website_url: place.websiteUri ?? null,
      google_maps_url: place.googleMapsUri ?? null,
      phone: place.nationalPhoneNumber ?? null,
      city,
      neighborhood: candidate.neighborhood ?? null,
      cuisine: candidate.cuisine ?? null,
      cuisine_types: place.types ?? null,
      slug,
      ingested_at: new Date().toISOString(),
    }, { onConflict: "google_place_id" });

    // 5. Create record in Airtable for GF scoring
    await createAirtableRecord(place, candidate, city!);
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\nDone.`);
  console.log(`  New restaurants added : ${newCount}`);
  console.log(`  Already existed       : ${alreadyExists}`);
  console.log(`  Not found on Google   : ${notFound}`);
  if (dryRun) console.log(`\n  (dry run — nothing written)`);
}

main();
