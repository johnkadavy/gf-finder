/**
 * One-time backfill: copies the Airtable `order_links` AI field into
 * restaurants.order_links (jsonb) for every existing restaurant, WITHOUT
 * touching dossiers, scores, or enriched_at. Idempotent — safe to re-run.
 *
 * Only rows whose Airtable value parses to at least one valid link are written,
 * so empty ("[]") cells are skipped rather than clearing existing data.
 *
 * Prereq — run the migration first:
 *   alter table restaurants add column if not exists order_links jsonb;
 *
 * Usage:
 *   npx tsx scripts/backfill-order-links.ts --dry-run   # preview, no writes
 *   npx tsx scripts/backfill-order-links.ts             # apply
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { parseOrderLinks, type OrderLink } from "../lib/order-links";

dotenv.config({ path: ".env.local" });

const DRY_RUN = process.argv.includes("--dry-run");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function airtableCreds() {
  return {
    key: process.env.AIRTABLE_API_KEY!,
    baseId: process.env.AIRTABLE_BASE_ID!,
    tableName: process.env.AIRTABLE_TABLE_NAME!,
  };
}

type ATRecord = { id: string; fields: Record<string, unknown> };

/** Page through the whole table, pulling only the two fields we need. */
async function fetchAllAirtable(): Promise<ATRecord[]> {
  const { key, baseId, tableName } = airtableCreds();
  const records: ATRecord[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`);
    url.searchParams.append("fields[]", "google_place_id");
    url.searchParams.append("fields[]", "order_links");
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`Airtable API error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    records.push(...data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

async function main() {
  console.log(`CleanPlate — order_links backfill${DRY_RUN ? " (dry run)" : ""}\n`);

  console.log("Fetching Airtable records (google_place_id, order_links)...");
  const records = await fetchAllAirtable();
  console.log(`Fetched ${records.length} Airtable records.`);

  const updates = records
    .map((r) => ({
      gpid: (r.fields["google_place_id"] as string | undefined) ?? null,
      links: parseOrderLinks(r.fields["order_links"]),
    }))
    .filter((u): u is { gpid: string; links: OrderLink[] } => !!u.gpid && u.links.length > 0);

  console.log(`${updates.length} restaurants have order links to write.\n`);

  if (DRY_RUN) {
    updates.slice(0, 20).forEach((u) =>
      console.log(`  ${u.gpid}  →  ${u.links.map((l) => l.provider).join(", ")}`));
    if (updates.length > 20) console.log(`  ...and ${updates.length - 20} more`);
    console.log(`\nDry run — no writes. ${updates.length} rows would be updated.`);
    return;
  }

  let updated = 0;
  let failed = 0;
  const CONCURRENCY = 10;
  for (let i = 0; i < updates.length; i += CONCURRENCY) {
    const chunk = updates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map((u) =>
        supabase
          .from("restaurants")
          .update({ order_links: u.links })
          .eq("google_place_id", u.gpid)
          .then(({ error }) =>
            error ? { ok: false as const, gpid: u.gpid, msg: error.message } : { ok: true as const }),
      ),
    );
    for (const r of results) {
      if (r.ok) updated++;
      else { failed++; console.warn(`  failed ${r.gpid}: ${r.msg}`); }
    }
    console.log(`  ...${Math.min(i + CONCURRENCY, updates.length)}/${updates.length}`);
  }

  console.log(`\nDone. Updated ${updated}, failed ${failed}.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
