/**
 * Sync script: reads enriched dossiers from Airtable and saves them to Supabase.
 *
 * Usage:
 *   npx tsx scripts/sync-airtable.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { calculateScore, type VerifiedData } from "../lib/score";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY!;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME!;

interface AirtableAIField {
  state: string;
  value: string | null;
  isStale: boolean;
}

interface AirtableRecord {
  id: string;
  fields: Record<string, string | AirtableAIField>;
}

async function fetchAirtableRecords(): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`
    );
    url.searchParams.append("fields[]", "google_place_id");
    url.searchParams.append("fields[]", "JSON dossier");
    url.searchParams.append("fields[]", "Sick reports JSON");
    url.searchParams.append("fields[]", "cuisine");
    url.searchParams.append("fields[]", "place_type");
    url.searchParams.append("fields[]", "gf_food_categories");
    url.searchParams.set("view", "viwTggcsKrf8UqgQb");
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Airtable API error: ${res.status} ${err}`);
    }

    const data = await res.json();
    records.push(...data.records);
    offset = data.offset;
  } while (offset);

  return records;
}

async function sync() {
  console.log("Fetching records from Airtable...");
  const records = await fetchAirtableRecords();
  console.log(`Found ${records.length} total records`);

  let saved = 0;
  let skipped = 0;
  let failed = 0;
  const savedPlaceIds: string[] = [];
  const syncedAirtableIds: string[] = [];
  const syncedAt = new Date().toISOString();

  for (const record of records) {
    const googlePlaceId = record.fields["google_place_id"] as string | undefined;

    const dossierField = record.fields["JSON dossier"];
    const dossierText = typeof dossierField === "string"
      ? dossierField
      : (dossierField as AirtableAIField)?.state === "generated"
        ? (dossierField as AirtableAIField).value
        : null;

    if (!googlePlaceId || !dossierText) {
      skipped++;
      continue;
    }

    let dossier: any;
    try {
      dossier = JSON.parse(dossierText);
    } catch {
      console.warn(`  Skipping ${googlePlaceId} — invalid JSON`);
      skipped++;
      continue;
    }

    // Merge sick reports from dedicated field if present
    const sickField = record.fields["Sick reports JSON"];
    const sickText = typeof sickField === "string"
      ? sickField
      : (sickField as AirtableAIField)?.state === "generated"
        ? (sickField as AirtableAIField).value
        : null;

    if (sickText) {
      try {
        const sickData = JSON.parse(sickText);
        dossier.reviews = {
          ...dossier.reviews,
          sick_reports_recent: sickData.sick_reports_recent ?? 0,
          sick_reports_details: sickData.sick_reports_details ?? [],
        };
      } catch {
        console.warn(`  Could not parse sick reports JSON for ${googlePlaceId} — skipping merge`);
      }
    }

    const cuisineField = record.fields["cuisine"];
    const cuisine = typeof cuisineField === "string" && cuisineField.trim()
      ? cuisineField.trim()
      : (cuisineField as AirtableAIField)?.state === "generated" && (cuisineField as AirtableAIField).value?.trim()
        ? (cuisineField as AirtableAIField).value!.trim()
        : null;

    const parseCsv = (field: unknown): string[] | null => {
      const raw = typeof field === "string" ? field : (field as AirtableAIField)?.value;
      if (!raw) return null;
      const vals = raw.split(",").map((s) => s.trim()).filter(Boolean);
      return vals.length > 0 ? vals : null;
    };

    const placeTypes = parseCsv(record.fields["place_type"]);
    const gfFoodCategories = parseCsv(record.fields["gf_food_categories"]);

    const { error } = await supabase
      .from("restaurants")
      .update({
        dossier,
        enriched_at: new Date().toISOString(),
        ...(cuisine ? { cuisine } : {}),
        ...(placeTypes ? { place_type: placeTypes } : {}),
        ...(gfFoodCategories ? { gf_food_categories: gfFoodCategories } : {}),
      })
      .eq("google_place_id", googlePlaceId);

    if (error) {
      console.error(`  Failed to save ${googlePlaceId}:`, error.message);
      failed++;
    } else {
      console.log(`  Saved: ${googlePlaceId}`);
      saved++;
      savedPlaceIds.push(googlePlaceId);
      syncedAirtableIds.push(record.id);
    }
  }

  console.log(`\nDone. Saved: ${saved} | Skipped: ${skipped} | Failed: ${failed}`);

  // ── Stamp last_synced_at on Airtable records ──────────────────────────────
  if (syncedAirtableIds.length > 0) {
    console.log(`\nStamping last_synced_at on ${syncedAirtableIds.length} Airtable records...`);
    const AT_BATCH = 10;
    let stamped = 0;
    for (let i = 0; i < syncedAirtableIds.length; i += AT_BATCH) {
      const chunk = syncedAirtableIds.slice(i, i + AT_BATCH);
      const res = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${AIRTABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            records: chunk.map((id) => ({ id, fields: { last_synced_at: syncedAt } })),
          }),
        }
      );
      if (!res.ok) {
        console.warn(`  Stamp batch ${i / AT_BATCH + 1} failed: ${res.status}`);
      } else {
        stamped += chunk.length;
      }
    }
    console.log(`✓ Stamped ${stamped} records`);
  }

  // ── Score backfill for newly synced records ───────────────────────────────
  if (savedPlaceIds.length === 0) return;

  console.log(`\nCalculating scores for ${savedPlaceIds.length} synced restaurants...`);

  // Fetch in batches of 200 to stay under Supabase query size limits
  const BATCH = 200;
  const allRows: { id: number; dossier: any; verified_data: any }[] = [];

  for (let i = 0; i < savedPlaceIds.length; i += BATCH) {
    const chunk = savedPlaceIds.slice(i, i + BATCH);
    const { data, error: fetchError } = await supabase
      .from("restaurants")
      .select("id, dossier, verified_data")
      .in("google_place_id", chunk);
    if (fetchError) {
      console.error("Could not fetch rows for scoring:", fetchError.message);
      return;
    }
    allRows.push(...(data ?? []));
  }

  let scored = 0;
  const scoreUpdates = allRows
    .map((row) => ({ id: row.id, score: calculateScore(row.dossier, row.verified_data as VerifiedData | undefined) }))
    .filter((u) => u.score !== null) as { id: number; score: number }[];

  const CHUNK = 25;
  for (let i = 0; i < scoreUpdates.length; i += CHUNK) {
    const chunk = scoreUpdates.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async ({ id, score }) => {
        const { error } = await supabase.from("restaurants").update({ score }).eq("id", id);
        if (error) console.error(`  Score update failed for id ${id}:`, error.message);
        else scored++;
      })
    );
  }

  console.log(`✓ Scores written: ${scored}`);
}

sync();
