import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-admin";
import { syncAirtableToSupabase } from "@/lib/airtable-sync";

// The sync scans all Airtable records and re-scores changed rows — give it room.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await syncAirtableToSupabase(supabaseServer);
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
