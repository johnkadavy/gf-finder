import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-admin";
import { syncAirtableToSupabase } from "@/lib/airtable-sync";

// Incremental sync of the "Needs sync" view. 60s is the Hobby cap, so each run
// takes at most MAX_RECORDS and stops starting new chunks after TIME_BUDGET_MS;
// the sync commits per chunk, so anything left over is picked up next run.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_RECORDS = 500;
const TIME_BUDGET_MS = 40_000;

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const deadline = Date.now() + TIME_BUDGET_MS;
  try {
    const result = await syncAirtableToSupabase(supabaseServer, undefined, {
      maxRecords: MAX_RECORDS,
      deadline,
    });
    console.log("[sync-airtable] done", result);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[sync-airtable] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "sync failed" },
      { status: 500 }
    );
  }
}
