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
const count = parseInt(getArg("--count") ?? "9999", 10);

if (!neighborhood || !city) {
  console.error(
    "Usage: npx tsx scripts/ingest-neighborhood.ts --neighborhood <name> --city <name> [--count <n>]"
  );
  process.exit(1);
}

interface RawPlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  websiteUri?: string;
  nationalPhoneNumber?: string;
  businessStatus?: string;
  rating?: number;
  userRatingCount?: number;
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
          "places.nationalPhoneNumber",
          "places.businessStatus",
          "places.rating",
          "places.userRatingCount",
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

async function main() {
  if (!GOOGLE_API_KEY) {
    console.error("GOOGLE_MAPS_API_KEY is not set in .env.local");
    process.exit(1);
  }

  console.log(`\nGF Finder — Neighborhood Ingest`);
  console.log(`  Neighborhood : ${neighborhood}`);
  console.log(`  City         : ${city}`);
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

  // Upsert into restaurants
  const rows = top.map((place) => ({
    google_place_id: place.id,
    name: place.displayName?.text ?? "Unknown",
    address: place.formattedAddress ?? null,
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
    website_url: place.websiteUri ?? null,
    phone: place.nationalPhoneNumber ?? null,
    city,
    neighborhood,
    slug: [place.displayName?.text ?? "", city, neighborhood]
      .join("-")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, ""),
    ingested_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await supabase
    .from("restaurants")
    .upsert(rows, { onConflict: "google_place_id" });

  if (upsertError) {
    console.error("Upsert failed:", upsertError.message);
    process.exit(1);
  }

  console.log(`✓ Upserted ${rows.length} restaurants\n`);

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
