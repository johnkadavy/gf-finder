/**
 * Reports restaurant counts per neighborhood for a given city.
 *
 * Usage:
 *   npx tsx scripts/neighborhood-coverage.ts
 *   npx tsx scripts/neighborhood-coverage.ts --city "New York"
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function getArg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

const city = getArg("--city") ?? "New York";

async function main() {
  const PAGE = 1000;
  const rows: { neighborhood: string; score: number | null }[] = [];
  let from = 0;

  process.stdout.write(`Fetching restaurants in ${city}... `);
  while (true) {
    const { data, error } = await sb
      .from("restaurants")
      .select("neighborhood, score")
      .eq("city", city)
      .not("neighborhood", "is", null)
      .range(from, from + PAGE - 1);

    if (error) { console.error(error.message); process.exit(1); }
    rows.push(...((data ?? []) as typeof rows));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`${rows.length} total\n`);

  const counts: Record<string, { total: number; scored: number }> = {};
  for (const r of rows) {
    const n = r.neighborhood as string;
    if (!counts[n]) counts[n] = { total: 0, scored: 0 };
    counts[n].total++;
    if (r.score !== null) counts[n].scored++;
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1].total - a[1].total);
  console.log("total  scored  neighborhood");
  console.log("-----  ------  -----------");
  for (const [n, c] of sorted) {
    console.log(`${String(c.total).padStart(5)}  ${String(c.scored).padStart(6)}  ${n}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
