/**
 * Airtable → Supabase sync (shared by the CLI script and the cron route).
 *
 * Reads enriched dossiers from Airtable's AI fields and writes them to Supabase,
 * recalculating GF safety scores. Reads Airtable's "Needs sync" view (records
 * where last_updated_at is after last_synced_at), so only genuinely-refreshed
 * records are processed — no full-table diff, low egress. `enriched_at` is
 * stamped on each synced row, reflecting real content refreshes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateScore, type VerifiedData } from "./score";

// Read at call time, not at import time — CLI scripts load dotenv after imports.
function airtableCreds() {
  return {
    key: process.env.AIRTABLE_API_KEY!,
    baseId: process.env.AIRTABLE_BASE_ID!,
    tableName: process.env.AIRTABLE_TABLE_NAME!,
  };
}

// Airtable views. The cron uses the incremental "Needs sync" view
// (last_updated_at > last_synced_at). The manual CLI script uses a separate
// ad-hoc view for on-demand re-syncs.
export const NEEDS_SYNC_VIEW = "viworRquMdsABj223";
export const MANUAL_SYNC_VIEW = "viwTggcsKrf8UqgQb";

interface AirtableAIField {
  state: string;
  value: string | null;
  isStale: boolean;
}
interface AirtableRecord {
  id: string;
  fields: Record<string, string | AirtableAIField>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dossier = any;

export interface SyncResult {
  total: number;
  updated: number;
  skipped: number;
  failed: number;
  scored: number;
}

// ── Field helpers ─────────────────────────────────────────────────────────────

function aiValue(field: unknown): string | null {
  if (typeof field === "string") return field;
  const f = field as AirtableAIField | undefined;
  return f?.state === "generated" ? f.value : null;
}
function aiText(field: unknown): string | null {
  const raw = typeof field === "string" ? field : (field as AirtableAIField)?.value;
  return raw?.trim() || null;
}
function parseCsv(field: unknown): string[] | null {
  const raw = typeof field === "string" ? field : (field as AirtableAIField)?.value;
  if (!raw) return null;
  const vals = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return vals.length > 0 ? vals : null;
}

async function fetchAirtableRecords(viewId: string): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  const fields = [
    "google_place_id", "JSON dossier", "Sick reports JSON", "cuisine", "place_type",
    "gf_food_categories", "cc_risk_json", "restaurant_description", "menu_items",
    "reservation_link", "dedicated_gf_kitchen", "display_name",
  ];
  do {
    const { key, baseId, tableName } = airtableCreds();
    const url = new URL(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`
    );
    fields.forEach((f) => url.searchParams.append("fields[]", f));
    url.searchParams.set("view", viewId);
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`Airtable API error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    records.push(...data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

/** Build the merged dossier + derived fields for one Airtable record. */
function buildRecord(record: AirtableRecord): {
  googlePlaceId: string;
  dossier: Dossier;
  fields: Record<string, unknown>;
} | null {
  const googlePlaceId = record.fields["google_place_id"] as string | undefined;
  const dossierText = aiValue(record.fields["JSON dossier"]);
  if (!googlePlaceId || !dossierText) return null;

  let dossier: Dossier;
  try {
    dossier = JSON.parse(dossierText);
  } catch {
    return null;
  }

  // Merge sick reports
  const sickText = aiValue(record.fields["Sick reports JSON"]);
  if (sickText) {
    try {
      const sick = JSON.parse(sickText);
      dossier.reviews = {
        ...dossier.reviews,
        sick_reports_recent: sick.sick_reports_recent ?? 0,
        sick_reports_details: sick.sick_reports_details ?? [],
      };
    } catch { /* skip merge */ }
  }

  // Merge focused CC signals
  const ccRiskText = aiValue(record.fields["cc_risk_json"]);
  if (ccRiskText) {
    try {
      dossier.operations = { ...(dossier.operations ?? {}), cc_signals: JSON.parse(ccRiskText) };
    } catch { /* skip merge */ }
  }

  const cuisineField = record.fields["cuisine"];
  const cuisine = typeof cuisineField === "string" && cuisineField.trim()
    ? cuisineField.trim()
    : aiText(cuisineField);

  const menuItemsRaw = aiText(record.fields["menu_items"]);
  let menuItems: unknown = null;
  if (menuItemsRaw) {
    try { menuItems = JSON.parse(menuItemsRaw); } catch { /* leave null */ }
  }

  const dedicatedRaw = aiText(record.fields["dedicated_gf_kitchen"]);

  const fields: Record<string, unknown> = {
    ...(cuisine ? { cuisine } : {}),
    ...(parseCsv(record.fields["place_type"]) ? { place_type: parseCsv(record.fields["place_type"]) } : {}),
    ...(parseCsv(record.fields["gf_food_categories"]) ? { gf_food_categories: parseCsv(record.fields["gf_food_categories"]) } : {}),
    ...(aiText(record.fields["restaurant_description"]) ? { restaurant_description: aiText(record.fields["restaurant_description"]) } : {}),
    ...(menuItems ? { menu_items: menuItems } : {}),
    ...(aiText(record.fields["reservation_link"]) ? { reservation_link: aiText(record.fields["reservation_link"]) } : {}),
    ...(dedicatedRaw ? { dedicated_gf_kitchen: dedicatedRaw.toLowerCase() } : {}),
    ...(aiText(record.fields["display_name"]) ? { display_name: aiText(record.fields["display_name"]) } : {}),
  };

  return { googlePlaceId, dossier, fields };
}

export async function stampAirtableSynced(airtableIds: string[], syncedAt: string): Promise<void> {
  const AT_BATCH = 10;
  for (let i = 0; i < airtableIds.length; i += AT_BATCH) {
    const chunk = airtableIds.slice(i, i + AT_BATCH);
    const { key, baseId, tableName } = airtableCreds();
    await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ records: chunk.map((id) => ({ id, fields: { last_synced_at: syncedAt } })) }),
      }
    ).catch(() => { /* non-fatal */ });
  }
}

/**
 * Sync Airtable dossiers into Supabase. Only writes rows whose dossier changed.
 * @param log optional logger (the CLI passes console.log; the cron omits it)
 */
export async function syncAirtableToSupabase(
  supabase: SupabaseClient,
  log: (msg: string) => void = () => {},
  opts: { viewId?: string } = {}
): Promise<SyncResult> {
  const viewId = opts.viewId ?? NEEDS_SYNC_VIEW;
  const now = new Date().toISOString();
  const records = await fetchAirtableRecords(viewId);
  log(`${records.length} records to sync`);

  const result: SyncResult = { total: records.length, updated: 0, skipped: 0, failed: 0, scored: 0 };
  const changedPlaceIds: string[] = [];
  const syncedAirtableIds: string[] = [];

  for (const record of records) {
    const built = buildRecord(record);
    if (!built) { result.skipped++; continue; }
    const { googlePlaceId, dossier, fields } = built;

    const { error } = await supabase
      .from("restaurants")
      .update({ dossier, enriched_at: now, ...fields })
      .eq("google_place_id", googlePlaceId);

    if (error) {
      log(`  Failed ${googlePlaceId}: ${error.message}`);
      result.failed++;
    } else {
      result.updated++;
      changedPlaceIds.push(googlePlaceId);
      syncedAirtableIds.push(record.id);
    }
  }

  log(`Updated: ${result.updated} | Skipped: ${result.skipped} | Failed: ${result.failed}`);

  if (syncedAirtableIds.length > 0) await stampAirtableSynced(syncedAirtableIds, now);

  // Recalculate scores for changed rows only.
  if (changedPlaceIds.length > 0) {
    const BATCH = 200;
    const rows: { id: number; dossier: Dossier; verified_data: unknown; cuisine: string | null; place_type: string[] | null }[] = [];
    for (let i = 0; i < changedPlaceIds.length; i += BATCH) {
      const chunk = changedPlaceIds.slice(i, i + BATCH);
      const { data } = await supabase
        .from("restaurants")
        .select("id, dossier, verified_data, cuisine, place_type")
        .in("google_place_id", chunk);
      rows.push(...((data ?? []) as typeof rows));
    }
    const updates = rows
      .map((r) => ({ id: r.id, score: calculateScore(r.dossier, r.verified_data as VerifiedData | undefined, { cuisine: r.cuisine, placeTypes: r.place_type }) }))
      .filter((u): u is { id: number; score: number } => u.score !== null);

    const CHUNK = 25;
    for (let i = 0; i < updates.length; i += CHUNK) {
      await Promise.all(updates.slice(i, i + CHUNK).map(async ({ id, score }) => {
        const { error } = await supabase.from("restaurants").update({ score }).eq("id", id);
        if (!error) result.scored++;
      }));
    }
    log(`Scores written: ${result.scored}`);
  }

  return result;
}
