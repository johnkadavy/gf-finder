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

  // Fetch all IDs upfront so offset-based pagination isn't affected by writes
  console.log("Fetching restaurants with dossier and no score...");
  const allRows: { id: number; dossier: unknown; verified_data: unknown; cuisine: string | null; place_type: string[] | null }[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("restaurants")
      .select("id, dossier, verified_data, cuisine, place_type")
      .not("dossier", "is", null)
      .is("score", null)
      .order("id")
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error("Fetch error:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  console.log(`Found ${allRows.length} restaurants to score.\n`);

  let totalUpdated = 0;
  let totalSkipped = 0;
  const CHUNK = 25;

  for (let i = 0; i < allRows.length; i += CHUNK) {
    const chunk = allRows.slice(i, i + CHUNK);
    const updates: { id: number; score: number }[] = [];

    for (const row of chunk) {
      const score = calculateScore(row.dossier, row.verified_data as VerifiedData | undefined, { cuisine: row.cuisine as string | null, placeTypes: row.place_type as string[] | null });
      if (score !== null && !isNaN(score)) {
        updates.push({ id: row.id, score });
      } else {
        totalSkipped++;
      }
    }

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
    }

    if ((i + CHUNK) % 500 === 0 || i + CHUNK >= allRows.length) {
      console.log(`  Progress: ${Math.min(i + CHUNK, allRows.length)}/${allRows.length} processed, ${totalUpdated} scored, ${totalSkipped} skipped`);
    }
  }

  console.log(`\nDone. ${totalUpdated} scores written, ${totalSkipped} skipped (dossier present but calculateScore returned null).`);
}

main();
