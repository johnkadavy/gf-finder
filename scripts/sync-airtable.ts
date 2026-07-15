/**
 * Manual sync: reads enriched dossiers from Airtable's ad-hoc sync view and
 * saves them to Supabase. Same logic as the cron, but pointed at the manual
 * view (the cron uses the incremental "Needs sync" view).
 *
 * Usage:
 *   npx tsx scripts/sync-airtable.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { syncAirtableToSupabase, MANUAL_SYNC_VIEW } from "../lib/airtable-sync";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log("Syncing Airtable → Supabase (manual view)...");
  const result = await syncAirtableToSupabase(supabase, console.log, { viewId: MANUAL_SYNC_VIEW });
  console.log("\nDone.", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
