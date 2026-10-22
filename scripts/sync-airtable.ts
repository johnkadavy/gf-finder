/**
 * Manual sync: reads enriched dossiers from Airtable and saves them to Supabase.
 * Same logic as the cron, but with no time limit.
 *
 * Usage:
 *   npx tsx scripts/sync-airtable.ts                         # ad-hoc manual view
 *   npx tsx scripts/sync-airtable.ts --needs-sync            # drain the cron's "Needs sync" view
 *   npx tsx scripts/sync-airtable.ts --needs-sync --limit 50 # just the first 50 records
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { syncAirtableToSupabase, MANUAL_SYNC_VIEW, NEEDS_SYNC_VIEW } from "../lib/airtable-sync";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const args = process.argv.slice(2);
const NEEDS_SYNC = args.includes("--needs-sync");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : undefined;

async function main() {
  console.log(`Syncing Airtable → Supabase (${NEEDS_SYNC ? "Needs sync" : "manual"} view)...`);
  const result = await syncAirtableToSupabase(supabase, console.log, {
    viewId: NEEDS_SYNC ? NEEDS_SYNC_VIEW : MANUAL_SYNC_VIEW,
    maxRecords: LIMIT,
  });
  console.log("\nDone.", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
