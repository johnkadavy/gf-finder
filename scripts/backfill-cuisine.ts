/**
 * Populates the `cuisine` column from dossier.restaurant.cuisine for all
 * restaurants that have a dossier but no cuisine value yet.
 *
 * Usage:
 *   npx tsx scripts/backfill-cuisine.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BATCH_SIZE = 500;

async function main() {
  console.log("CleanPlate — Cuisine Backfill\n");

  let totalUpdated = 0;
  let totalSkipped = 0;
  let batch = 1;

  while (true) {
    // Always fetch from offset 0 — updated rows drop out of the filter,
    // so offset-based pagination would skip records mid-run
    const { data, error } = await supabase
      .from("restaurants")
      .select("id, dossier")
      .not("dossier", "is", null)
      .is("cuisine", null)
      .limit(BATCH_SIZE);

    if (error) {
      console.error("Fetch error:", error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) break;

    console.log(`Batch ${batch++} — ${data.length} rows...`);

    const updates: { id: number; cuisine: string }[] = [];

    for (const row of data) {
      const cuisine = (row.dossier as any)?.restaurant?.cuisine;
      if (cuisine && typeof cuisine === "string") {
        updates.push({ id: row.id, cuisine });
      } else {
        totalSkipped++;
      }
    }

    const results = await Promise.all(
      updates.map(({ id, cuisine }) =>
        supabase.from("restaurants").update({ cuisine }).eq("id", id)
      )
    );

    const failed = results.filter((r) => r.error);
    if (failed.length > 0) {
      console.error("  Update errors:", failed.map((r) => r.error!.message).join(", "));
      process.exit(1);
    }

    totalUpdated += updates.length;
    console.log(`  ✓ ${updates.length} cuisines written, ${data.length - updates.length} skipped (no cuisine in dossier)`);

    if (data.length < BATCH_SIZE) break;
  }

  console.log(`\nDone. ${totalUpdated} updated, ${totalSkipped} skipped.`);
}

main();
