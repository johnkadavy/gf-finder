import { createClient } from "@/lib/supabase-server";
import {
  findAirtableRecord,
  fetchAirtableRecord,
  isEnriched,
  syncAirtableRecordToSupabase,
} from "../add-restaurant/route";

export async function POST(req: Request) {
  // Auth + admin check
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await serverClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .single();

  if (!profile?.is_admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { placeId } = await req.json() as { placeId: string };
  if (!placeId) return Response.json({ error: "placeId required" }, { status: 400 });

  // Find the Airtable record
  const recordId = await findAirtableRecord(placeId);
  if (!recordId) return Response.json({ status: "not_found" });

  // Check if enrichment is ready
  const fields = await fetchAirtableRecord(recordId);
  if (!fields || !isEnriched(fields)) {
    return Response.json({ status: "not_ready" });
  }

  // Sync
  try {
    const score = await syncAirtableRecordToSupabase(placeId, fields);
    return Response.json({ status: "synced", score });
  } catch (err) {
    return Response.json(
      { status: "error", message: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
