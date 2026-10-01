/**
 * Computes and stores CleanPlate scores (restaurants.score) using the same
 * scoreRestaurant() the restaurant pages use, so lists and detail pages agree.
 *
 * Usage:
 *   npx tsx scripts/backfill-scores.ts               # score rows that have no score yet (writes)
 *   npx tsx scripts/backfill-scores.ts --all         # DRY RUN: recompute every row, report what would change
 *   npx tsx scripts/backfill-scores.ts --all --write # recompute every row and save changes
 *
 * Run --all --write after changing the formula in lib/score.ts, or after
 * editing scoring inputs (dossier, verified_data, cuisine, place_type)
 * directly in the Supabase dashboard. App/scripted writes rescore themselves
 * via lib/rescore.ts.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { scoreRestaurant } from "../lib/score";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const args = new Set(process.argv.slice(2));
const ALL = args.has("--all");
// Legacy mode (no --all) always wrote; --all is a dry run unless --write.
const WRITE = ALL ? args.has("--write") : true;

const BATCH_SIZE = 500;
const CHUNK = 25;

type Row = {
  id: number;
  name: string;
  neighborhood: string | null;
  score: number | null;
  dossier: unknown;
  verified_data: unknown;
  cuisine: string | null;
  place_type: string[] | null;
};

async function fetchRows(): Promise<Row[]> {
  const rows: Row[] = [];
  let offset = 0;
  while (true) {
    let q = supabase
      .from("restaurants")
      .select("id, name, neighborhood, score, dossier, verified_data, cuisine, place_type")
      .not("dossier", "is", null)
      .order("id")
      .range(offset, offset + BATCH_SIZE - 1);
    if (!ALL) q = q.is("score", null);
    const { data, error } = await q;
    if (error) {
      console.error("Fetch error:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as Row[]));
    if (data.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }
  return rows;
}

async function main() {
  console.log(`CleanPlate — Score Backfill (${ALL ? "all rows" : "unscored rows only"}, ${WRITE ? "WRITE" : "DRY RUN"})\n`);

  // Fetch everything upfront so offset pagination isn't affected by writes
  const rows = await fetchRows();
  console.log(`Fetched ${rows.length} restaurants with a dossier.\n`);

  const changes: { row: Row; next: number }[] = [];
  let unchanged = 0;
  let skipped = 0;
  for (const row of rows) {
    const next = scoreRestaurant(row);
    if (next === null || Number.isNaN(next)) { skipped++; continue; }
    if (next === row.score) { unchanged++; continue; }
    changes.push({ row, next });
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const delta = (c: { row: Row; next: number }) => c.next - (c.row.score ?? 0);
  const rescored = changes.filter((c) => c.row.score !== null);
  const big = rescored.filter((c) => Math.abs(delta(c)) >= 10);
  console.log(`Would change: ${changes.length}  (${rescored.length} rescored, ${changes.length - rescored.length} newly scored)`);
  console.log(`Unchanged:    ${unchanged}`);
  console.log(`Skipped:      ${skipped} (dossier present but no score could be computed)`);
  console.log(`Moves of 10+ points: ${big.length}`);
  // Crossing 75 changes which landing pages / guides a restaurant appears on
  const crossing = rescored.filter((c) => (c.row.score! >= 75) !== (c.next >= 75));
  console.log(`Crossing the 75 line (landing-page eligibility): ${crossing.length}\n`);

  const top = [...rescored].sort((a, b) => Math.abs(delta(b)) - Math.abs(delta(a))).slice(0, 25);
  if (top.length > 0) {
    console.log("Largest changes:");
    for (const c of top) {
      const d = delta(c);
      console.log(
        `  ${String(c.row.score).padStart(3)} → ${String(c.next).padStart(3)}  (${d > 0 ? "+" : ""}${d})  ` +
        `${c.row.name.slice(0, 40)}${c.row.neighborhood ? ` · ${c.row.neighborhood}` : ""}  [id ${c.row.id}]`
      );
    }
    console.log("");
  }

  if (!WRITE) {
    console.log("Dry run — nothing saved. Re-run with --all --write to apply.");
    return;
  }

  // ── Write ─────────────────────────────────────────────────────────────────
  let written = 0;
  for (let i = 0; i < changes.length; i += CHUNK) {
    const chunk = changes.slice(i, i + CHUNK);
    const results = await Promise.all(
      chunk.map(({ row, next }) => supabase.from("restaurants").update({ score: next }).eq("id", row.id))
    );
    const failed = results.filter((r) => r.error);
    if (failed.length > 0) {
      console.error("  Update errors:", failed.map((r) => r.error!.message).join(", "));
      process.exit(1);
    }
    written += chunk.length;
    if (written % 500 < CHUNK || written === changes.length) {
      console.log(`  Progress: ${written}/${changes.length} written`);
    }
  }
  console.log(`\nDone. ${written} scores written.`);
}

main();
