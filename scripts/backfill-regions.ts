/**
 * Backfills the `region` column on the restaurants table.
 * Maps each city to its region — edit REGION_MAP to add new cities.
 *
 * Usage:
 *   npx tsx scripts/backfill-regions.ts              # live run
 *   npx tsx scripts/backfill-regions.ts --dry-run    # preview only
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Add new cities here as you expand to new markets */
const REGION_MAP: Record<string, string> = {
  "New York":  "New York City",
  "Huntington": "Long Island",
};

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`\nRegion Backfill${DRY_RUN ? "  [DRY RUN]" : ""}\n`);

  for (const [city, region] of Object.entries(REGION_MAP)) {
    // Count total rows for this city
    const { count: totalCount } = await supabase
      .from("restaurants")
      .select("id", { count: "exact", head: true })
      .eq("city", city);

    console.log(`  "${city}" → "${region}"  (${totalCount ?? "?"} restaurants)`);

    if (!DRY_RUN) {
      const { error } = await supabase
        .from("restaurants")
        .update({ region })
        .eq("city", city);

      if (error) {
        console.error(`    ✗ Failed:`, error.message);
        continue;
      }
      console.log(`    ✓ Done`);
    }
  }

  if (!DRY_RUN) {
    // Verify
    console.log("\nVerification:");
    for (const [city, region] of Object.entries(REGION_MAP)) {
      const { count } = await supabase
        .from("restaurants")
        .select("id", { count: "exact", head: true })
        .eq("city", city)
        .eq("region", region);
      console.log(`  "${region}" / "${city}": ${count ?? "?"} rows set`);
    }
  }

  console.log(`\nDone.${DRY_RUN ? " (dry run — no changes made)" : ""}`);
}

main();
