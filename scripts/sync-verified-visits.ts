/**
 * Sync script: reads verified visits from Airtable and upserts them into Supabase.
 *
 * Usage:
 *   npx tsx scripts/sync-verified-visits.ts
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
const VERIFIED_VISITS_TABLE_ID = "tblgZbEMeXZz5Wl5Q";

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

async function fetchVerifiedVisits(): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${VERIFIED_VISITS_TABLE_ID}`
    );
    url.searchParams.append("fields[]", "google_place_id");
    url.searchParams.append("fields[]", "visit_date");
    url.searchParams.append("fields[]", "staff_knowledge");
    url.searchParams.append("fields[]", "gf_labeling");
    url.searchParams.append("fields[]", "gf_options_level");
    url.searchParams.append("fields[]", "cross_contamination_risk");
    url.searchParams.append("fields[]", "dedicated_fryer");
    url.searchParams.append("fields[]", "overall_sentiment");
    url.searchParams.append("fields[]", "notes");
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
  console.log("Fetching verified visits from Airtable...");
  const records = await fetchVerifiedVisits();
  console.log(`Found ${records.length} record(s)\n`);

  let saved = 0;
  let skipped = 0;
  let failed = 0;

  for (const record of records) {
    const googlePlaceId = record.fields["google_place_id"];

    // google_place_id comes through as an array from the lookup field
    const placeId = Array.isArray(googlePlaceId)
      ? (googlePlaceId[0] as string)
      : (googlePlaceId as string | undefined);

    if (!placeId) {
      console.warn(`  Skipping ${record.id} — no google_place_id`);
      skipped++;
      continue;
    }

    const row = {
      airtable_id: record.id,
      google_place_id: placeId,
      visit_date: (record.fields["visit_date"] as string) ?? null,
      staff_knowledge: (record.fields["staff_knowledge"] as string)?.toLowerCase() ?? null,
      gf_labeling: (record.fields["gf_labeling"] as string)?.toLowerCase() ?? null,
      gf_options_level: (record.fields["gf_options_level"] as string)?.toLowerCase() ?? null,
      cross_contamination_risk: (record.fields["cross_contamination_risk"] as string)?.toLowerCase() ?? null,
      dedicated_fryer: (record.fields["dedicated_fryer"] as string)?.toLowerCase() ?? null,
      overall_sentiment: (record.fields["overall_sentiment"] as string)?.toLowerCase() ?? null,
      notes: (record.fields["notes"] as string) ?? null,
      synced_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("verified_visits")
      .upsert(row, { onConflict: "airtable_id" });

    if (error) {
      console.error(`  Failed to save ${record.id}:`, error.message);
      failed++;
    } else {
      console.log(`  Saved: ${record.id} (${placeId})`);
      saved++;
    }
  }

  console.log(`\nDone. Saved: ${saved} | Skipped: ${skipped} | Failed: ${failed}`);
}

sync();
