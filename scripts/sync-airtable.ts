/**
 * Sync script: reads enriched dossiers from Airtable and saves them to Supabase.
 *
 * Usage:
 *   npx tsx scripts/sync-airtable.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

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

    let dossier: unknown;
    try {
      dossier = JSON.parse(dossierText);
    } catch {
      console.warn(`  Skipping ${googlePlaceId} — invalid JSON`);
      skipped++;
      continue;
    }

    const cuisine = (dossier as any)?.restaurant?.cuisine ?? null;

    const { error } = await supabase
      .from("restaurants")
      .update({ dossier, enriched_at: new Date().toISOString(), ...(cuisine ? { cuisine } : {}) })
      .eq("google_place_id", googlePlaceId);

    if (error) {
      console.error(`  Failed to save ${googlePlaceId}:`, error.message);
      failed++;
    } else {
      console.log(`  Saved: ${googlePlaceId}`);
      saved++;
    }
  }

  console.log(`\nDone. Saved: ${saved} | Skipped: ${skipped} | Failed: ${failed}`);
}

sync();
