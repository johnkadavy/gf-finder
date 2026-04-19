/**
 * Re-calculates neighborhoods for restaurants in a given city using NTA polygon
 * boundaries (NYC only for now). Overwrites whatever is currently stored.
 *
 * Usage:
 *   npx tsx scripts/backfill-neighborhoods.ts              # defaults to New York
 *   npx tsx scripts/backfill-neighborhoods.ts --dry-run    # preview without writing
 *   npx tsx scripts/backfill-neighborhoods.ts --city "New York"
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { lookupNycNeighborhood } from "../lib/neighborhood-lookup";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const cityIdx = args.indexOf("--city");
const CITY = cityIdx !== -1 ? args[cityIdx + 1] : "New York";
const BATCH_SIZE = 500;

async function main() {
  console.log(`Neighborhood Backfill — city: "${CITY}"${DRY_RUN ? "  [DRY RUN]" : ""}\n`);

  let offset = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalNoCoords = 0;
  let totalNoMatch = 0;

  while (true) {
    const { data, error } = await supabase
      .from("restaurants")
      .select("id, name, lat, lng, neighborhood")
      .eq("city", CITY)
      .not("lat", "is", null)
      .not("lng", "is", null)
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error("Fetch error:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (row.lat == null || row.lng == null) {
        totalNoCoords++;
        continue;
      }

      const resolved = lookupNycNeighborhood(row.lat, row.lng);

      if (!resolved) {
        console.log(`  NO MATCH  ${row.name} (${row.lat}, ${row.lng})`);
        totalNoMatch++;
        continue;
      }

      if (resolved === row.neighborhood) {
        totalSkipped++;
        continue;
      }

      console.log(`  ${DRY_RUN ? "[dry]" : "UPDATE"} ${row.name}  |  "${row.neighborhood ?? "(none)"}" → "${resolved}"`);

      if (!DRY_RUN) {
        const { error: updateError } = await supabase
          .from("restaurants")
          .update({ neighborhood: resolved })
          .eq("id", row.id);

        if (updateError) {
          console.error(`    ✗ Update failed for id=${row.id}:`, updateError.message);
          continue;
        }
      }

      totalUpdated++;
    }

    offset += BATCH_SIZE;
    if (data.length < BATCH_SIZE) break;
  }

  console.log(`\nDone.`);
  console.log(`  Updated : ${totalUpdated}`);
  console.log(`  Skipped : ${totalSkipped} (already correct)`);
  console.log(`  No match: ${totalNoMatch} (outside NTA boundaries)`);
  if (totalNoCoords > 0) console.log(`  No coords: ${totalNoCoords}`);
}

main();
