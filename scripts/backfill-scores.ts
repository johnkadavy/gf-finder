/**
 * Computes and stores CleanPlate scores for all restaurants that have a dossier.
 * Fetches in batches to avoid the 1000-row Supabase default limit.
 *
 * Usage:
 *   npx tsx scripts/backfill-scores.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { calculateScore, type VerifiedData } from "../lib/score";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BATCH_SIZE = 500;

async function main() {
  console.log("CleanPlate — Score Backfill\n");

  let offset = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  while (true) {
    const { data, error } = await supabase
      .from("restaurants")
      .select("id, dossier, verified_data")
      .not("dossier", "is", null)
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error("Fetch error:", error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) break;

    console.log(`Processing rows ${offset + 1}–${offset + data.length}...`);

    const updates: { id: number; score: number }[] = [];

    for (const row of data) {
      const score = calculateScore(row.dossier, row.verified_data as VerifiedData | undefined);
      if (score !== null) {
        updates.push({ id: row.id, score });
      } else {
        totalSkipped++;
      }
    }

    // Update scores in parallel
    if (updates.length > 0) {
      const results = await Promise.all(
        updates.map(({ id, score }) =>
          supabase.from("restaurants").update({ score }).eq("id", id)
        )
      );

      const failed = results.filter((r) => r.error);
      if (failed.length > 0) {
        console.error("  Update errors:", failed.map((r) => r.error!.message).join(", "));
        process.exit(1);
      }

      totalUpdated += updates.length;
      console.log(`  ✓ ${updates.length} scores written, ${data.length - updates.length} skipped (no data)`);
    }

    if (data.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  console.log(`\nDone. ${totalUpdated} scores written, ${totalSkipped} skipped.`);
}

main();
