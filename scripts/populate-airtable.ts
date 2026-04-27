/**
 * Populates Airtable with restaurants from Supabase for a given neighborhood or city.
 * Skips any restaurant whose google_place_id already exists in Airtable.
 *
 * Usage:
 *   npx tsx scripts/populate-airtable.ts --neighborhood "West Village" --city "New York"
 *   npx tsx scripts/populate-airtable.ts --city "New York"
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY!;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME!;

function getArg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

const neighborhood = getArg("--neighborhood");
const city = getArg("--city");

if (!city) {
  console.error(
    "Usage: npx tsx scripts/populate-airtable.ts --city <name> [--neighborhood <name>]"
  );
  process.exit(1);
}

// ── Airtable helpers ──────────────────────────────────────────────────────────

async function fetchAirtablePlaceIds(): Promise<Set<string>> {
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

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Airtable API error: ${res.status} ${err}`);
    }

    const data = await res.json();
    for (const record of data.records ?? []) {
      const id = record.fields?.google_place_id;
      if (id) ids.add(id);
    }
    offset = data.offset;
  } while (offset);

  return ids;
}

// Airtable create accepts max 10 records per request
async function createAirtableRecords(records: object[]): Promise<number> {
  const BATCH = 10;
  let created = 0;

  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ records: batch, typecast: true }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Airtable create error: ${res.status} ${err}`);
    }

    const data = await res.json();
    created += data.records?.length ?? 0;

    // Airtable rate limit: 5 requests/sec — be polite
    if (i + BATCH < records.length) await new Promise((r) => setTimeout(r, 250));
  }

  return created;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_NAME) {
    console.error("Missing AIRTABLE_API_KEY, AIRTABLE_BASE_ID, or AIRTABLE_TABLE_NAME in .env.local");
    process.exit(1);
  }

  console.log(`\nGF Finder — Populate Airtable`);
  if (neighborhood) console.log(`  Neighborhood : ${neighborhood}`);
  console.log(`  City         : ${city}\n`);

  // 1. Load restaurants from Supabase
  process.stdout.write("Loading restaurants from Supabase... ");
  let query = supabase
    .from("restaurants")
    .select("id, name, google_place_id, phone, website_url, lat, lng, neighborhood, city, address")
    .eq("city", city)
    .not("google_place_id", "is", null);

  // When neighborhood equals city (e.g. Garden City, Huntington), it's stored as null
  if (neighborhood && neighborhood !== city) query = query.eq("neighborhood", neighborhood);

  const { data: restaurants, error } = await query;
  if (error) {
    console.error("\nSupabase error:", error.message);
    process.exit(1);
  }

  console.log(`${restaurants?.length ?? 0} found`);

  if (!restaurants || restaurants.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  // 2. Fetch existing Airtable place IDs
  process.stdout.write("Fetching existing Airtable records... ");
  const existingIds = await fetchAirtablePlaceIds();
  console.log(`${existingIds.size} existing`);

  // 3. Filter to new restaurants only
  const newRestaurants = restaurants.filter(
    (r) => r.google_place_id && !existingIds.has(r.google_place_id)
  );

  console.log(`\n${newRestaurants.length} new restaurants to add (${restaurants.length - newRestaurants.length} already in Airtable)\n`);

  if (newRestaurants.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  // 4. Build Airtable records
  const records = newRestaurants.map((r) => ({
    fields: {
      name: r.name,
      google_place_id: r.google_place_id,
      phone: r.phone ?? undefined,
      website: r.website_url ?? undefined,
      lat: r.lat != null ? String(r.lat) : undefined,
      lng: r.lng != null ? String(r.lng) : undefined,
      neighborhood: r.neighborhood ?? undefined,
      city: r.city,
      address: r.address ?? undefined,
    },
  }));

  // 5. Create in Airtable
  process.stdout.write(`Creating ${records.length} records in Airtable... `);
  const created = await createAirtableRecords(records);
  console.log(`done (${created} created)\n`);

  console.log("Sample of added restaurants:");
  newRestaurants.slice(0, 10).forEach((r, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${r.name} — ${r.address ?? "no address"}`);
  });
  if (newRestaurants.length > 10) {
    console.log(`  ... and ${newRestaurants.length - 10} more`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
