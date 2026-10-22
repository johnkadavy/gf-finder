/**
 * Airtable → Supabase sync (shared by the CLI script and the cron route).
 *
 * Reads enriched dossiers from Airtable's AI fields and writes them to Supabase,
 * recalculating GF safety scores. Reads Airtable's "Needs sync" view (NYC
 * records where `LMT all synced fields` is after last_synced_at), so only
 * genuinely-refreshed records are processed — no full-table diff, low egress.
 * `enriched_at` is stamped on each synced row, reflecting real content refreshes.
 *
 * Work is committed chunk by chunk (Supabase write → rescore → Airtable
 * last_synced_at stamp), so a run cut short by the cron's time limit still
 * drains what it finished and the next run picks up the rest.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { rescoreRestaurants } from "./rescore";
import { parseOrderLinks } from "./order-links";

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
  /** Stored scores that actually changed. */
  scored: number;
  /** Airtable last_synced_at stamps that failed (those records will be re-synced). */
  stampFailed: number;
  /** True when the time budget ran out before all fetched records were processed. */
  stoppedEarly: boolean;
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

async function fetchAirtableRecords(viewId: string, maxRecords?: number): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  const fields = [
    "google_place_id", "JSON dossier", "Sick reports JSON", "cuisine", "place_type",
    "gf_food_categories", "cc_risk_json", "restaurant_description", "menu_items",
    "reservation_link", "order_links", "dedicated_gf_kitchen", "display_name",
  ];
  do {
    const { key, baseId, tableName } = airtableCreds();
    const url = new URL(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`
    );
    fields.forEach((f) => url.searchParams.append("fields[]", f));
    url.searchParams.set("view", viewId);
    if (maxRecords) url.searchParams.set("maxRecords", String(maxRecords));
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
  const orderLinks = parseOrderLinks(record.fields["order_links"]);

  const fields: Record<string, unknown> = {
    ...(cuisine ? { cuisine } : {}),
    ...(parseCsv(record.fields["place_type"]) ? { place_type: parseCsv(record.fields["place_type"]) } : {}),
    ...(parseCsv(record.fields["gf_food_categories"]) ? { gf_food_categories: parseCsv(record.fields["gf_food_categories"]) } : {}),
    ...(aiText(record.fields["restaurant_description"]) ? { restaurant_description: aiText(record.fields["restaurant_description"]) } : {}),
    ...(menuItems ? { menu_items: menuItems } : {}),
    ...(aiText(record.fields["reservation_link"]) ? { reservation_link: aiText(record.fields["reservation_link"]) } : {}),
    ...(orderLinks.length ? { order_links: orderLinks } : {}),
    ...(dedicatedRaw ? { dedicated_gf_kitchen: dedicatedRaw.toLowerCase() } : {}),
    ...(aiText(record.fields["display_name"]) ? { display_name: aiText(record.fields["display_name"]) } : {}),
  };

  return { googlePlaceId, dossier, fields };
}

/**
 * Stamp last_synced_at on Airtable records so they leave the "Needs sync" view.
 * Returns how many records failed to stamp (they stay in the view and get re-synced).
 */
export async function stampAirtableSynced(airtableIds: string[], syncedAt: string): Promise<number> {
  const AT_BATCH = 10;
  let failed = 0;
  for (let i = 0; i < airtableIds.length; i += AT_BATCH) {
    const chunk = airtableIds.slice(i, i + AT_BATCH);
    const { key, baseId, tableName } = airtableCreds();
    try {
      const res = await fetch(
        `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ records: chunk.map((id) => ({ id, fields: { last_synced_at: syncedAt } })) }),
        }
      );
      if (!res.ok) {
        console.error(`[airtable-sync] stamp failed (${res.status}): ${await res.text()}`);
        failed += chunk.length;
      }
    } catch (err) {
      console.error("[airtable-sync] stamp failed:", err);
      failed += chunk.length;
    }
  }
  return failed;
}

const CHUNK = 25;

/**
 * Sync Airtable dossiers into Supabase, committing chunk by chunk.
 * @param log optional logger (the CLI passes console.log; the cron omits it)
 * @param opts.maxRecords cap on records fetched per run (the cron's time limit)
 * @param opts.deadline epoch ms after which no new chunk is started
 */
export async function syncAirtableToSupabase(
  supabase: SupabaseClient,
  log: (msg: string) => void = () => {},
  opts: { viewId?: string; maxRecords?: number; deadline?: number } = {}
): Promise<SyncResult> {
  const viewId = opts.viewId ?? NEEDS_SYNC_VIEW;
  // Run start, not stamp time: a record refreshed mid-run keeps
  // LMT > last_synced_at and is picked up again next run.
  const now = new Date().toISOString();
  const records = await fetchAirtableRecords(viewId, opts.maxRecords);
  log(`${records.length} records to sync`);

  const result: SyncResult = {
    total: records.length, updated: 0, skipped: 0, failed: 0, scored: 0, stampFailed: 0, stoppedEarly: false,
  };

  for (let i = 0; i < records.length; i += CHUNK) {
    if (opts.deadline && Date.now() > opts.deadline) {
      result.stoppedEarly = true;
      log(`Time budget reached after ${i} records — the rest stay in the view for next run`);
      break;
    }

    // Records to stamp: synced ones, plus ones we can't act on (no dossier yet,
    // invalid JSON, no Supabase row) so they don't clog the view. A pending AI
    // field re-stages the record when it finishes. Failed writes are not
    // stamped — they're retried next run.
    const toStamp: string[] = [];
    const rowIds: number[] = [];

    await Promise.all(records.slice(i, i + CHUNK).map(async (record) => {
      const built = buildRecord(record);
      if (!built) {
        result.skipped++;
        toStamp.push(record.id);
        return;
      }
      const { googlePlaceId, dossier, fields } = built;

      const { data, error } = await supabase
        .from("restaurants")
        .update({ dossier, enriched_at: now, ...fields })
        .eq("google_place_id", googlePlaceId)
        .select("id");

      if (error) {
        log(`  Failed ${googlePlaceId}: ${error.message}`);
        result.failed++;
      } else if (!data?.length) {
        log(`  No Supabase row for ${googlePlaceId}`);
        result.skipped++;
        toStamp.push(record.id);
      } else {
        result.updated++;
        rowIds.push(...data.map((r: { id: number }) => r.id));
        toStamp.push(record.id);
      }
    }));

    // Rescore before stamping: if the rescore is cut off, the record is still
    // in the view and gets re-synced (and rescored) next run.
    if (rowIds.length) result.scored += await rescoreRestaurants(supabase, { ids: rowIds });
    if (toStamp.length) result.stampFailed += await stampAirtableSynced(toStamp, now);
  }

  log(
    `Updated: ${result.updated} | Skipped: ${result.skipped} | Failed: ${result.failed} | ` +
    `Scores changed: ${result.scored} | Stamp failures: ${result.stampFailed}`
  );
  return result;
}
