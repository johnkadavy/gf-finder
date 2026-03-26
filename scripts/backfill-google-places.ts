/**
 * Backfill script — fetches Google Places details for restaurants that are
 * missing data and updates Supabase.
 *
 * - If a row has no google_place_id: searches by name + city to find it first
 * - If a row already has google_place_id: fetches details directly
 *
 * Updates: google_place_id, address, lat, lng, website_url, phone, ingested_at
 *
 * Usage:
 *   npx tsx scripts/backfill-google-places.ts
 *   npx tsx scripts/backfill-google-places.ts --force   # re-fetches all rows
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY!;
const DETAILS_FIELD_MASK =
  "id,displayName,formattedAddress,location,websiteUri,googleMapsUri,nationalPhoneNumber,rating,priceLevel,types,regularOpeningHours";

const force = process.argv.includes("--force");

interface PlaceDetails {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  websiteUri?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  rating?: number;
  priceLevel?: string;
  types?: string[];
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
    periods?: unknown[];
    openNow?: boolean;
  };
}

// Search for a place by name and city, return the best match place ID
async function searchPlaceId(
  name: string,
  neighborhood: string | null,
  city: string
): Promise<string | null> {
  const query = `${name} ${neighborhood ?? ""} ${city}`.trim();
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_API_KEY,
      "X-Goog-FieldMask": "places.id,places.displayName",
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
  });

  if (!res.ok) {
    console.error(`  ✗ Search API error (${res.status}):`, (await res.text()).slice(0, 200));
    return null;
  }

  const data = await res.json();
  const placeId = data.places?.[0]?.id ?? null;
  if (placeId) {
    console.log(`  → Found place ID: ${placeId} (${data.places[0].displayName?.text})`);
  } else {
    console.log(`  → No results from Places search`);
  }
  return placeId;
}

// Fetch full place details by place ID
async function fetchPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": GOOGLE_API_KEY,
      "X-Goog-FieldMask": DETAILS_FIELD_MASK,
    },
  });

  if (!res.ok) {
    console.error(`  ✗ Details API error (${res.status}):`, (await res.text()).slice(0, 200));
    return null;
  }

  return res.json();
}

async function main() {
  if (!GOOGLE_API_KEY) {
    console.error("GOOGLE_MAPS_API_KEY is not set in .env.local");
    process.exit(1);
  }

  console.log("GF Finder — Google Places Backfill");
  console.log(`  Force mode: ${force}\n`);

  let query = supabase
    .from("restaurants")
    .select("id, google_place_id, name, neighborhood, city")
    .order("neighborhood, name");

  if (!force) {
    // Only rows missing address — haven't been backfilled yet
    query = query.is("address", null);
  }

  const { data: restaurants, error } = await query;

  if (error) {
    console.error("Failed to fetch restaurants:", error.message);
    process.exit(1);
  }

  if (!restaurants || restaurants.length === 0) {
    console.log("No restaurants need backfilling.");
    process.exit(0);
  }

  console.log(`Found ${restaurants.length} restaurant(s) to backfill.\n`);

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < restaurants.length; i++) {
    const r = restaurants[i];
    console.log(`[${i + 1}/${restaurants.length}] ${r.name} — ${r.neighborhood ?? "—"}, ${r.city}`);

    let placeId: string | null = r.google_place_id;

    // Step 1: find place ID if missing
    if (!placeId) {
      console.log(`  No place ID — searching Google Places...`);
      placeId = await searchPlaceId(r.name, r.neighborhood, r.city);
      if (!placeId) {
        console.log(`  ✗ Skipping — couldn't find on Google Places`);
        failed++;
        continue;
      }
      await new Promise((res) => setTimeout(res, 300));
    }

    // Step 2: fetch full details
    const details = await fetchPlaceDetails(placeId);
    if (!details) {
      failed++;
      continue;
    }

    // Step 3: build update object (only columns that exist in the schema)
    const updates: Record<string, unknown> = {
      google_place_id: placeId,
      ingested_at: new Date().toISOString(),
    };
    if (details.formattedAddress) updates.address = details.formattedAddress;
    if (details.location) {
      updates.lat = details.location.latitude;
      updates.lng = details.location.longitude;
    }
    if (details.websiteUri) updates.website_url = details.websiteUri;
    if (details.googleMapsUri) updates.google_maps_url = details.googleMapsUri;
    if (details.nationalPhoneNumber) updates.phone = details.nationalPhoneNumber;
    if (details.rating != null) updates.google_rating = details.rating;
    if (details.priceLevel) {
      const priceLevelMap: Record<string, number> = {
        PRICE_LEVEL_FREE: 0,
        PRICE_LEVEL_INEXPENSIVE: 1,
        PRICE_LEVEL_MODERATE: 2,
        PRICE_LEVEL_EXPENSIVE: 3,
        PRICE_LEVEL_VERY_EXPENSIVE: 4,
      };
      updates.price_level = priceLevelMap[details.priceLevel] ?? null;
    }
    if (details.types?.length) {
      // Filter out generic types, keep cuisine/place-specific ones
      const exclude = new Set(["establishment", "point_of_interest", "food", "restaurant", "store"]);
      updates.cuisine_types = details.types.filter((t) => !exclude.has(t));
    }
    if (details.regularOpeningHours) {
      updates.opening_hours = details.regularOpeningHours;
    }

    const { error: updateError } = await supabase
      .from("restaurants")
      .update(updates)
      .eq("id", r.id);

    if (updateError) {
      console.error(`  ✗ Save failed: ${updateError.message}`);
      failed++;
    } else {
      console.log(`  ✓ ${details.formattedAddress ?? "no address"}`);
      if (details.rating) console.log(`    ★ ${details.rating}  ${details.priceLevel ?? ""}`);
      if (details.websiteUri) console.log(`    ${details.websiteUri}`);
      succeeded++;
    }

    // Pause between requests
    if (i < restaurants.length - 1) {
      await new Promise((res) => setTimeout(res, 300));
    }
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`Done. ${succeeded} updated, ${failed} failed.`);
}

main();
