/**
 * Sets up a neighborhood for ingestion:
 *   1. Creates a row in `neighborhoods` (if it doesn't exist)
 *   2. Asks Claude to suggest major restaurant streets
 *   3. Inserts them into `neighborhood_streets` (skips existing)
 *
 * Review/edit the streets in Supabase before running ingest-neighborhood.ts.
 *
 * Usage:
 *   npx tsx scripts/setup-neighborhood.ts --neighborhood "West Village" --city "New York" --state "NY"
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getArg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

const neighborhood = getArg("--neighborhood");
const city = getArg("--city");
const state = getArg("--state");

if (!neighborhood || !city || !state) {
  console.error(
    "Usage: npx tsx scripts/setup-neighborhood.ts --neighborhood <name> --city <name> --state <abbr>"
  );
  process.exit(1);
}

async function suggestStreets(neighborhood: string, city: string): Promise<string[]> {
  console.log("  Asking Claude for street suggestions...");
  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `List the major streets and corridors in ${neighborhood}, ${city} that have a high concentration of restaurants.

Return only a JSON array of street name strings, ordered from most to least restaurant-dense. Include 8-15 streets. Do not include any explanation or markdown — just the raw JSON array.

Example format: ["Bleecker Street", "Hudson Street", "Christopher Street"]`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "[]";
  try {
    const parsed = JSON.parse(text.trim());
    if (Array.isArray(parsed)) return parsed.filter((s) => typeof s === "string");
  } catch {
    // Try extracting JSON array from within the text
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
  }
  console.warn("  Could not parse street list from Claude response — inserting empty list.");
  return [];
}

async function main() {
  console.log(`\nGF Finder — Neighborhood Setup`);
  console.log(`  Neighborhood : ${neighborhood}`);
  console.log(`  City         : ${city}`);
  console.log(`  State        : ${state}\n`);

  // 1. Upsert neighborhood row
  const { data: existing } = await supabase
    .from("neighborhoods")
    .select("id, name")
    .eq("name", neighborhood)
    .eq("city", city)
    .maybeSingle();

  let neighborhoodId: number;

  if (existing) {
    neighborhoodId = existing.id;
    console.log(`✓ Neighborhood already exists (id: ${neighborhoodId})`);
  } else {
    const { data: inserted, error } = await supabase
      .from("neighborhoods")
      .insert({ name: neighborhood, city, state })
      .select("id")
      .single();

    if (error || !inserted) {
      console.error("Failed to insert neighborhood:", error?.message);
      process.exit(1);
    }
    neighborhoodId = inserted.id;
    console.log(`✓ Created neighborhood (id: ${neighborhoodId})`);
  }

  // 2. Check for existing streets
  const { data: existingStreets } = await supabase
    .from("neighborhood_streets")
    .select("street_name")
    .eq("neighborhood_id", neighborhoodId);

  const existingNames = new Set((existingStreets ?? []).map((s) => s.street_name.toLowerCase()));

  if (existingNames.size > 0) {
    console.log(`  ${existingNames.size} street(s) already in DB — will skip duplicates`);
  }

  // 3. Get street suggestions from Claude
  const streets = await suggestStreets(neighborhood!, city!);
  console.log(`  Claude suggested ${streets.length} streets:\n`);
  streets.forEach((s, i) => console.log(`    ${String(i + 1).padStart(2)}. ${s}`));

  // 4. Insert new streets
  const toInsert = streets
    .filter((s) => !existingNames.has(s.toLowerCase()))
    .map((street_name, i) => ({
      neighborhood_id: neighborhoodId,
      street_name,
      priority: i + 1,
      source: "llm_suggested",
      active: true,
    }));

  if (toInsert.length === 0) {
    console.log("\n  No new streets to insert.");
  } else {
    const { error } = await supabase.from("neighborhood_streets").insert(toInsert);
    if (error) {
      console.error("Failed to insert streets:", error.message);
      process.exit(1);
    }
    console.log(`\n✓ Inserted ${toInsert.length} street(s) into neighborhood_streets`);
  }

  console.log(`
Next steps:
  1. Review streets in Supabase: select * from neighborhood_streets where neighborhood_id = ${neighborhoodId};
  2. Edit, add, or deactivate streets as needed
  3. Run: npx tsx scripts/ingest-neighborhood.ts --neighborhood "${neighborhood}" --city "${city}"
`);
}

main();
