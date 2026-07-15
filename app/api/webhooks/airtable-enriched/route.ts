import {
  findAirtableRecord,
  fetchAirtableRecord,
  isEnriched,
  syncAirtableRecordToSupabase,
} from "../../admin/add-restaurant/route";
import { stampAirtableSynced } from "@/lib/airtable-sync";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Webhook called by Airtable automation when the "JSON dossier" AI field
 * finishes generating for a record. Syncs the enriched data to Supabase
 * and calculates the GF score.
 *
 * Auth: shared secret in Authorization header ("Bearer <AIRTABLE_WEBHOOK_SECRET>")
 *
 * Body: { "google_place_id": "ChIJ..." }
 *
 * Airtable automation setup:
 *   Trigger:  "When record matches conditions" → JSON dossier is not empty
 *   Action:   "Send a webhook"
 *     URL:    https://trycleanplate.com/api/webhooks/airtable-enriched
 *     Method: POST
 *     Headers: Authorization: Bearer <AIRTABLE_WEBHOOK_SECRET>
 *     Body:   { "google_place_id": "<google_place_id field value>" }
 */
export async function POST(req: Request) {
  // Verify shared secret
  const secret = process.env.AIRTABLE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[airtable-webhook] AIRTABLE_WEBHOOK_SECRET is not set");
    return Response.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
  }

  // Parse body
  let google_place_id: string | undefined;
  try {
    const body = await req.json();
    google_place_id = body.google_place_id;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!google_place_id) {
    return Response.json({ error: "google_place_id required" }, { status: 400 });
  }

  // Find the Airtable record
  const recordId = await findAirtableRecord(google_place_id);
  if (!recordId) {
    return Response.json({ error: "Record not found in Airtable" }, { status: 404 });
  }

  // Fetch fields and verify enrichment is complete
  const fields = await fetchAirtableRecord(recordId);
  if (!fields || !isEnriched(fields)) {
    // Airtable may fire the trigger slightly before all AI fields finish —
    // return 200 so Airtable doesn't retry, but log for visibility
    console.warn(`[airtable-webhook] Record ${google_place_id} not yet fully enriched`);
    return Response.json({ status: "not_ready" }, { headers: CORS_HEADERS });
  }

  // Sync to Supabase and calculate score
  try {
    const score = await syncAirtableRecordToSupabase(google_place_id, fields);
    console.log(`[airtable-webhook] Synced ${google_place_id} — score: ${score}`);
    // Stamp last_synced_at on the Airtable record (non-fatal if it fails)
    await stampAirtableSynced([recordId], new Date().toISOString());
    return Response.json({ status: "synced", score }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error(`[airtable-webhook] Sync failed for ${google_place_id}:`, err);
    return Response.json(
      { status: "error", message: err instanceof Error ? err.message : "Sync failed" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
