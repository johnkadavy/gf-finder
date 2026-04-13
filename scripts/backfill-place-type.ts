/**
 * Backfill place_type from stored cuisine_types (Google Places API types).
 *
 * Usage:
 *   npx tsx scripts/backfill-place-type.ts           # live run
 *   npx tsx scripts/backfill-place-type.ts --dry-run  # preview only
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 200;

/**
 * Map an array of Google Places types to our place_type vocabulary.
 * Priority order matters — more specific types win.
 */
function mapToPlaceType(types: string[]): string | null {
  const t = new Set(types.map((x) => x.toLowerCase()));

  // Bakery / dessert (check before bar/cafe — some bakeries also show as cafes)
  if (t.has("bakery") || t.has("confectionery") || t.has("pastry_shop") || t.has("dessert_shop")) return "bakery";

  // Fine dining
  if (t.has("fine_dining_restaurant")) return "fine_dining";

  // Bar
  if (
    t.has("bar") || t.has("cocktail_bar") || t.has("wine_bar") || t.has("bar_and_grill") ||
    t.has("sports_bar") || t.has("pub") || t.has("dive_bar") || t.has("lounge_bar") ||
    t.has("night_club")
  ) return "bar";

  // Cafe
  if (t.has("cafe") || t.has("coffee_shop") || t.has("tea_house")) return "cafe";

  // Food truck
  if (t.has("food_truck")) return "food_truck";

  // Deli
  if (t.has("deli") || t.has("delicatessen") || t.has("sandwich_shop")) return "deli";

  // Fast food / fast casual
  if (t.has("fast_food_restaurant")) return "fast_casual";

  // Generic restaurant — any *_restaurant type
  if ([...t].some((x) => x.endsWith("_restaurant"))) return "restaurant";

  // Delivery/takeaway only (no dine-in type found above)
  if (t.has("meal_takeaway") || t.has("meal_delivery")) return "fast_casual";

  return null;
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}\n`);

  // Fetch all rows with cuisine_types but no place_type yet
  const { data: rows, error } = await supabase
    .from("restaurants")
    .select("id, name, cuisine_types")
    .not("cuisine_types", "is", null)
    .is("place_type", null);

  if (error) { console.error("Fetch error:", error.message); process.exit(1); }

  console.log(`Restaurants with cuisine_types but no place_type: ${rows!.length}`);

  const mapped: { id: number; name: string; place_type: string }[] = [];
  const unmapped: { id: number; name: string; types: string[] }[] = [];

  for (const row of rows!) {
    const pt = mapToPlaceType(row.cuisine_types as string[]);
    if (pt) {
      mapped.push({ id: row.id, name: row.name, place_type: pt });
    } else {
      unmapped.push({ id: row.id, name: row.name, types: row.cuisine_types as string[] });
    }
  }

  // Count by place_type
  const byType: Record<string, number> = {};
  for (const r of mapped) byType[r.place_type] = (byType[r.place_type] ?? 0) + 1;

  console.log("\nMapped breakdown:");
  Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([k, v]) =>
    console.log(`  ${k.padEnd(15)} ${v}`)
  );
  console.log(`\nUnmapped (no recognizable type): ${unmapped.length}`);
  if (unmapped.length > 0 && unmapped.length <= 10) {
    unmapped.forEach((r) => console.log(`  ${r.name}: [${r.types.join(", ")}]`));
  }

  if (DRY_RUN) {
    console.log("\nDry run — no updates written.");
    return;
  }

  // Update in batches
  let updated = 0;
  for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
    const batch = mapped.slice(i, i + BATCH_SIZE);
    for (const row of batch) {
      const { error: upErr } = await supabase
        .from("restaurants")
        .update({ place_type: row.place_type })
        .eq("id", row.id);
      if (upErr) console.error(`  Failed to update ${row.name}:`, upErr.message);
      else updated++;
    }
    console.log(`  Updated ${Math.min(i + BATCH_SIZE, mapped.length)} / ${mapped.length}...`);
  }

  console.log(`\nDone. Updated ${updated} restaurants.`);

  // Summary of remaining nulls
  const { count: stillNull } = await supabase
    .from("restaurants")
    .select("*", { count: "exact", head: true })
    .is("place_type", null);
  console.log(`place_type still null: ${stillNull} (these have no cuisine_types stored — would need Google Places re-fetch)`);
}

main();
