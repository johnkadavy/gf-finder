/**
 * Generates URL slugs for all restaurants and writes them to the `slug` column.
 *
 * Slug format: {name-slug}-{neighborhood-slug}
 *   e.g. "Springbone Kitchen" in "Greenwich Village" → "springbone-kitchen-greenwich-village"
 *   e.g. "Springbone Kitchen" with no neighborhood  → "springbone-kitchen-new-york"
 *
 * Collisions are resolved by appending -2, -3, etc.
 *
 * Usage:
 *   npx tsx scripts/backfill-slugs.ts
 *   npx tsx scripts/backfill-slugs.ts --dry-run   (preview without writing)
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 500;

// ── Slug generation ──────────────────────────────────────────────────────────

function toSlugPart(s: string): string {
  return s
    .toLowerCase()
    .replace(/[''`]/g, "")          // remove apostrophes
    .replace(/&/g, "and")           // & → and
    .replace(/[^a-z0-9]+/g, "-")   // non-alphanumeric → hyphen
    .replace(/^-+|-+$/g, "");       // trim leading/trailing hyphens
}

function buildBaseSlug(name: string, neighborhood: string | null, city: string): string {
  const namePart = toSlugPart(name);
  const locationPart = toSlugPart(neighborhood ?? city);
  // Avoid duplication when the name already ends with the location
  // e.g. "Dante West Village" in "West Village" → "dante-west-village" not "dante-west-village-west-village"
  if (namePart.endsWith(locationPart)) return namePart;
  return `${namePart}-${locationPart}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`CleanPlate — Slug Backfill${DRY_RUN ? " (DRY RUN)" : ""}\n`);

  // Fetch all restaurants
  let allRows: Array<{ id: number; name: string; neighborhood: string | null; city: string; slug: string | null }> = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("restaurants")
      .select("id, name, neighborhood, city, slug")
      .range(offset, offset + BATCH_SIZE - 1)
      .order("id", { ascending: true });

    if (error) { console.error("Fetch error:", error.message); process.exit(1); }
    if (!data || data.length === 0) break;

    allRows = allRows.concat(data);
    if (data.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  console.log(`Fetched ${allRows.length} restaurants`);

  // Regenerate all slugs from scratch — existing values are junk (random suffixes)
  const slugCounts = new Map<string, number>();
  const updates: Array<{ id: number; slug: string }> = [];

  for (const r of allRows) {
    const base = buildBaseSlug(r.name, r.neighborhood, r.city);
    let candidate = base;
    let suffix = 2;

    while (slugCounts.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix++;
    }

    slugCounts.set(candidate, 1);
    updates.push({ id: r.id, slug: candidate });
  }

  console.log(`To update: ${updates.length}`);

  if (updates.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  // Preview first 10
  console.log("\nSample slugs:");
  for (const u of updates.slice(0, 10)) {
    const r = allRows.find((x) => x.id === u.id)!;
    console.log(`  [${u.id}] ${r.name} (${r.neighborhood ?? r.city}) → ${u.slug}`);
  }

  if (DRY_RUN) {
    console.log("\nDry run — no writes.");
    return;
  }

  // Write in parallel batches — each row needs its own update() since slugs differ
  let written = 0;
  const CONCURRENT = 20;

  for (let i = 0; i < updates.length; i += CONCURRENT) {
    const batch = updates.slice(i, i + CONCURRENT);
    const results = await Promise.all(
      batch.map((u) =>
        supabase.from("restaurants").update({ slug: u.slug }).eq("id", u.id)
      )
    );
    const failed = results.filter((r) => r.error);
    if (failed.length > 0) {
      console.error(`\nBatch error:`, failed[0].error?.message);
      process.exit(1);
    }
    written += batch.length;
    process.stdout.write(`\r  Written: ${written}/${updates.length}`);
  }

  console.log(`\n\nDone. ${written} slugs written.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
