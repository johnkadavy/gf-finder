/**
 * Adds newly opened restaurants found by the discovery routine
 * (docs/prompts/discover-openings.md) to Supabase and the main Airtable table.
 *
 * Input (JSON, via --file or stdin):
 *   {
 *     "city": "New York",
 *     "articles": [
 *       {
 *         "source": "Eater",
 *         "url": "https://ny.eater.com/...",
 *         "title": "The Hottest New Restaurants in NYC",   // optional
 *         "published_at": "2026-11-03",                    // optional, YYYY-MM-DD
 *         "restaurants": [
 *           { "name": "...", "neighborhood": "...", "cuisine": "...", "notes": "..." }
 *         ]
 *       }
 *     ]
 *   }
 *
 * For each restaurant:
 *   1. Look it up on Google Places (name + neighborhood + city).
 *   2. Skip if not found, not a food business, or not OPERATIONAL yet — it will be
 *      retried on the next run if the articles still list it.
 *   3. Skip if its google_place_id is already in Supabase or the main Airtable table.
 *   4. Otherwise insert into Supabase `restaurants` (source = "new_openings") and
 *      create a record in the main Airtable table for GF enrichment.
 *
 * The whole payload is validated first; any problem → exit 1, nothing written.
 *
 * Usage:
 *   npx tsx scripts/detect-new-restaurants.ts --file openings.json --dry-run
 *   npx tsx scripts/detect-new-restaurants.ts --file openings.json
 *
 * "city" must be an enabled entry in lib/openings-cities.json, which also gives its region.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { readFileSync } from "fs";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY!;
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY!;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME!; // main restaurants table

// Cities the discovery routine covers, with their region (see docs/prompts/discover-openings.md).
const CITIES_CONFIG = "lib/openings-cities.json";
interface CityConfig { city: string; region: string; enabled: boolean }

// Google Places types that count as a food business.
const FOOD_TYPES = new Set([
  "restaurant", "cafe", "bakery", "food", "meal_takeaway", "meal_delivery",
  "coffee_shop", "bar", "bistro", "diner", "deli", "food_court",
]);

function getArg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

const filePath = getArg("--file");
const dryRun = process.argv.includes("--dry-run");

// ── Types + validation ────────────────────────────────────────────────────────

interface Restaurant {
  name: string;
  neighborhood: string | null;
  cuisine: string | null;
  notes: string | null;
}

interface Article {
  source: string;
  url: string;
  title: string | null;
  published_at: string | null;
  restaurants: Restaurant[];
}

interface Payload {
  city: string;
  articles: Article[];
}

interface Candidate extends Restaurant {
  source: string;
  source_url: string;
}

interface PlaceResult {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  websiteUri?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  types?: string[];
  businessStatus?: string;
}

function optString(v: unknown, path: string, errors: string[]): string | null {
  if (v == null || v === "") return null;
  if (typeof v !== "string") {
    errors.push(`${path} must be a string or null`);
    return null;
  }
  return v.trim() || null;
}

function validate(raw: unknown): { payload: Payload | null; errors: string[] } {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null) return { payload: null, errors: ["payload must be a JSON object"] };
  const obj = raw as Record<string, unknown>;

  const city = typeof obj.city === "string" ? obj.city.trim() : "";
  if (!city) errors.push("city is required");

  if (!Array.isArray(obj.articles)) {
    errors.push("articles must be an array");
    return { payload: null, errors };
  }

  const articles: Article[] = obj.articles.map((a, i) => {
    const p = `articles[${i}]`;
    const art = (typeof a === "object" && a !== null ? a : {}) as Record<string, unknown>;

    const source = typeof art.source === "string" ? art.source.trim() : "";
    if (!source) errors.push(`${p}.source is required`);

    const url = typeof art.url === "string" ? art.url.trim() : "";
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
    } catch {
      errors.push(`${p}.url must be an http(s) URL (got ${JSON.stringify(art.url)})`);
    }

    const published_at = optString(art.published_at, `${p}.published_at`, errors);
    if (published_at && !/^\d{4}-\d{2}-\d{2}$/.test(published_at)) {
      errors.push(`${p}.published_at must be YYYY-MM-DD`);
    }

    if (!Array.isArray(art.restaurants) || art.restaurants.length === 0) {
      errors.push(`${p}.restaurants must be a non-empty array`);
    }
    const restaurants: Restaurant[] = (Array.isArray(art.restaurants) ? art.restaurants : []).map((r, j) => {
      const rp = `${p}.restaurants[${j}]`;
      const rr = (typeof r === "object" && r !== null ? r : {}) as Record<string, unknown>;
      const name = typeof rr.name === "string" ? rr.name.trim() : "";
      if (!name) errors.push(`${rp}.name is required`);
      else if (name.length > 120) errors.push(`${rp}.name is suspiciously long`);
      return {
        name,
        neighborhood: optString(rr.neighborhood, `${rp}.neighborhood`, errors),
        cuisine: optString(rr.cuisine, `${rp}.cuisine`, errors),
        notes: optString(rr.notes, `${rp}.notes`, errors),
      };
    });

    return { source, url, title: optString(art.title, `${p}.title`, errors), published_at, restaurants };
  });

  return { payload: errors.length ? null : { city, articles }, errors };
}

/** Normalise a restaurant name so the same place listed by two articles is looked up once. */
function nameKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Existing-record checks ────────────────────────────────────────────────────

async function fetchAirtablePlaceIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  let offset: string | undefined;
  do {
    const url = new URL(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`
    );
    url.searchParams.append("fields[]", "google_place_id");
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
    if (!res.ok) throw new Error(`Airtable API error: ${res.status} ${await res.text()}`);

    const data = await res.json();
    for (const r of data.records ?? []) {
      if (r.fields?.google_place_id) ids.add(r.fields.google_place_id);
    }
    offset = data.offset;
  } while (offset);
  return ids;
}

/** Which of these place IDs already exist in Supabase (any city). */
async function fetchSupabasePlaceIds(placeIds: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  const CHUNK = 100;
  for (let i = 0; i < placeIds.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("restaurants")
      .select("google_place_id")
      .in("google_place_id", placeIds.slice(i, i + CHUNK));
    if (error) throw new Error(`Supabase error: ${error.message}`);
    for (const r of data ?? []) if (r.google_place_id) found.add(r.google_place_id);
  }
  return found;
}

// ── Google Places ─────────────────────────────────────────────────────────────

async function lookupPlace(c: Candidate, cityName: string): Promise<PlaceResult | null> {
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
        "places.types",
        "places.businessStatus",
      ].join(","),
    },
    body: JSON.stringify({
      textQuery: [c.name, c.neighborhood, cityName].filter(Boolean).join(" "),
      maxResultCount: 1,
    }),
  });

  if (!res.ok) {
    console.warn(`  Google API error for "${c.name}": ${res.status}`);
    return null;
  }
  const data = await res.json();
  return data.places?.[0] ?? null;
}

const GENERIC_WORDS = new Set([
  "and", "restaurant", "cafe", "bar", "kitchen", "bakery", "nyc", "new", "york", "brooklyn",
  "pizza", "pizzeria", "grill", "house", "shop", "co", "of", "la", "le", "el", "di",
]);

/**
 * Google returns its closest match even for names it doesn't know, so a place that
 * isn't listed yet can match an unrelated business. Require the names to agree.
 */
function namesMatch(candidate: string, googleName: string): boolean {
  const a = nameKey(candidate);
  const b = nameKey(googleName);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const tokens = (s: string) => s.split(" ").filter((t) => t.length >= 3 && !GENERIC_WORDS.has(t));
  const bTokens = new Set(tokens(b));
  return tokens(a).some((t) => bTokens.has(t));
}

function isFoodPlace(p: PlaceResult): boolean {
  return (p.types ?? []).some((t) => FOOD_TYPES.has(t) || t.endsWith("_restaurant"));
}

// ── Writes ────────────────────────────────────────────────────────────────────

async function insertSupabase(place: PlaceResult, c: Candidate, cityName: string, region: string) {
  const name = place.displayName?.text ?? c.name;
  const slug = [name, cityName, place.id.slice(-6)]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const { error } = await supabase.from("restaurants").insert({
    google_place_id: place.id,
    name,
    address: place.formattedAddress ?? null,
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
    website_url: place.websiteUri ?? null,
    google_maps_url: place.googleMapsUri ?? null,
    phone: place.nationalPhoneNumber ?? null,
    city: cityName,
    region,
    neighborhood: c.neighborhood,
    cuisine: c.cuisine,
    cuisine_types: place.types ?? null,
    slug,
    source: "new_openings",
    ingested_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Supabase insert failed for "${name}": ${error.message}`);
}

async function createAirtableRecord(place: PlaceResult, c: Candidate, cityName: string) {
  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          name: place.displayName?.text ?? c.name,
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
    }
  );
  if (!res.ok) throw new Error(`Airtable create error: ${res.status} ${await res.text()}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

function readInput(): string {
  if (filePath) return readFileSync(filePath, "utf8");
  if (process.stdin.isTTY) {
    console.error(
      "Usage: npx tsx scripts/detect-new-restaurants.ts --file <path> [--dry-run]  (or pipe JSON on stdin)"
    );
    process.exit(1);
  }
  return readFileSync(0, "utf8");
}

async function main() {
  let raw: unknown;
  try {
    raw = JSON.parse(readInput());
  } catch (e) {
    console.error(`Input is not valid JSON: ${(e as Error).message}`);
    process.exit(1);
  }

  const { payload, errors } = validate(raw);
  if (!payload) {
    console.error(`Rejected — ${errors.length} problem(s), nothing written:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const city = payload.city;
  const cities: CityConfig[] = JSON.parse(readFileSync(CITIES_CONFIG, "utf8"));
  const cityConfig = cities.find((c) => c.city === city);
  if (!cityConfig || !cityConfig.enabled) {
    const enabled = cities.filter((c) => c.enabled).map((c) => `"${c.city}"`).join(", ");
    console.error(`"${city}" is not an enabled city in ${CITIES_CONFIG} (enabled: ${enabled || "none"}). Nothing written.`);
    process.exit(1);
  }
  const region = cityConfig.region;

  // Flatten + dedupe by name across articles (first mention wins)
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  let received = 0;
  for (const art of payload.articles) {
    for (const r of art.restaurants) {
      received++;
      const key = nameKey(r.name);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ ...r, source: art.source, source_url: art.url });
    }
  }

  console.log(`\nCleanPlate — Detect New Restaurants${dryRun ? "  (dry run)" : ""}`);
  console.log(`  City     : ${city}  (region: ${region})`);
  console.log(`  Articles : ${payload.articles.length}  →  ${received} restaurants  →  ${candidates.length} after name dedupe\n`);

  // 1. Google Places lookups
  console.log("Looking up on Google Places...\n");
  const resolved: { c: Candidate; place: PlaceResult }[] = [];
  const skipped = { notFound: [] as string[], notFood: [] as string[], notOpen: [] as string[] };

  for (const c of candidates) {
    const place = await lookupPlace(c, city);
    await new Promise((r) => setTimeout(r, 200)); // rate limit
    const label = c.name.padEnd(36);

    if (!place) {
      console.log(`  ${label}not found on Google`);
      skipped.notFound.push(c.name);
    } else if (!namesMatch(c.name, place.displayName?.text ?? "")) {
      console.log(`  ${label}Google's best match is "${place.displayName?.text}" — name mismatch, skipped`);
      skipped.notFound.push(c.name);
    } else if (!isFoodPlace(place)) {
      console.log(`  ${label}matched a non-food place ("${place.displayName?.text}") — skipped`);
      skipped.notFood.push(c.name);
    } else if (place.businessStatus !== "OPERATIONAL") {
      console.log(`  ${label}not open yet (${place.businessStatus ?? "no status"}) — will retry next run`);
      skipped.notOpen.push(c.name);
    } else {
      resolved.push({ c, place });
    }
  }

  // 2. Existing-record checks (Airtable main table + Supabase), deduping by place ID
  const airtableIds = await fetchAirtablePlaceIds();
  const supabaseIds = await fetchSupabasePlaceIds(resolved.map((r) => r.place.id));

  console.log("");
  const toAdd: typeof resolved = [];
  const seenPlaceIds = new Set<string>();
  let alreadyExists = 0;
  for (const r of resolved) {
    if (airtableIds.has(r.place.id) || supabaseIds.has(r.place.id) || seenPlaceIds.has(r.place.id)) {
      console.log(`  = ${r.c.name}  → already in DB as "${r.place.displayName?.text ?? "?"}"`);
      alreadyExists++;
      continue;
    }
    seenPlaceIds.add(r.place.id);
    toAdd.push(r);
  }

  console.log(`\nNew restaurants (${toAdd.length}):`);
  for (const { c, place } of toAdd) {
    console.log(`  + ${place.displayName?.text ?? c.name}  [${c.neighborhood ?? "?"}]  ${place.formattedAddress ?? ""}  (via ${c.source})`);
  }

  // 3. Writes
  let added = 0;
  const failures: string[] = [];
  if (!dryRun) {
    for (const { c, place } of toAdd) {
      try {
        await insertSupabase(place, c, city, region);
        await createAirtableRecord(place, c, city);
        added++;
      } catch (e) {
        failures.push((e as Error).message);
        console.error(`  ✗ ${(e as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  console.log(`\nSummary`);
  console.log(`  Candidates            : ${candidates.length}`);
  console.log(`  Already in DB         : ${alreadyExists}`);
  console.log(`  Not open yet          : ${skipped.notOpen.length}`);
  console.log(`  Not found / non-food  : ${skipped.notFound.length + skipped.notFood.length}`);
  console.log(`  New                   : ${toAdd.length}${dryRun ? "  (dry run — nothing written)" : `  (${added} written)`}`);
  if (failures.length) {
    console.log(`  Failed                : ${failures.length}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
