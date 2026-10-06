/**
 * "Did this help you decide?" results from restaurant pages.
 *
 * Usage:
 *   npx tsx scripts/feedback-report.ts             # last 30 days
 *   npx tsx scripts/feedback-report.ts --days 7
 *   npx tsx scripts/feedback-report.ts --days 0    # all time
 *
 * Prints overall helpful %, reason counts, and the restaurants with the most
 * "not helpful" votes with their reasons and latest notes.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { FEEDBACK_REASONS } from "../lib/feedback";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const daysArg = process.argv.indexOf("--days");
const days = daysArg > -1 ? Number(process.argv[daysArg + 1]) : 30;
const TOP = 20;

type Row = {
  restaurant_id: number;
  vote: number;
  reason: string | null;
  note: string | null;
  surface: string | null;
  updated_at: string;
  restaurants: { name: string; display_name: string | null; slug: string | null; score: number | null; neighborhood: string | null } | null;
};

const reasonLabel = (v: string) => FEEDBACK_REASONS.find((r) => r.value === v)?.label ?? v;
const pct = (n: number, d: number) => (d === 0 ? "—" : `${Math.round((n / d) * 100)}%`);

async function main() {
  let query = supabase
    .from("restaurant_feedback")
    .select("restaurant_id, vote, reason, note, surface, updated_at, restaurants(name, display_name, slug, score, neighborhood)")
    .order("updated_at", { ascending: false })
    .limit(5000);
  if (days > 0) query = query.gte("updated_at", new Date(Date.now() - days * 864e5).toISOString());

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as Row[];

  const up = rows.filter((r) => r.vote === 1).length;
  const down = rows.length - up;
  console.log(`\nDid this help you decide? — ${days > 0 ? `last ${days} days` : "all time"}`);
  console.log(`${rows.length} votes · ${up} helpful · ${down} not helpful · ${pct(up, rows.length)} helpful (target ≥ 80%)`);

  for (const surface of ["mobile_float", "desktop_inline"]) {
    const s = rows.filter((r) => r.surface === surface);
    const sUp = s.filter((r) => r.vote === 1).length;
    console.log(`  ${surface.padEnd(15)} ${String(s.length).padStart(4)} votes · ${pct(sUp, s.length)} helpful`);
  }

  const reasonCounts = new Map<string, number>();
  for (const r of rows) if (r.vote === -1 && r.reason) reasonCounts.set(r.reason, (reasonCounts.get(r.reason) ?? 0) + 1);
  if (reasonCounts.size > 0) {
    console.log(`\nWhat was missing (${down} not helpful):`);
    for (const [reason, n] of [...reasonCounts].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${reasonLabel(reason).padEnd(18)} ${n}`);
    }
  }

  const byRestaurant = new Map<number, Row[]>();
  for (const r of rows) byRestaurant.set(r.restaurant_id, [...(byRestaurant.get(r.restaurant_id) ?? []), r]);
  const ranked = [...byRestaurant.values()]
    .map((rs) => ({ rs, up: rs.filter((r) => r.vote === 1).length, down: rs.filter((r) => r.vote === -1).length }))
    .filter((x) => x.down > 0)
    .sort((a, b) => b.down - a.down || a.up - b.up)
    .slice(0, TOP);

  if (ranked.length === 0) {
    console.log("\nNo not-helpful votes yet.\n");
    return;
  }

  console.log(`\nMost not-helpful restaurants (top ${ranked.length}):`);
  for (const { rs, up: u, down: d } of ranked) {
    const info = rs[0].restaurants;
    const name = info?.display_name ?? info?.name ?? `#${rs[0].restaurant_id}`;
    const reasons = new Map<string, number>();
    for (const r of rs) if (r.vote === -1 && r.reason) reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1);
    const reasonText = [...reasons].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${reasonLabel(k)} ×${n}`).join(", ");
    console.log(`\n  👎 ${d}  👍 ${u}  ${name}${info?.neighborhood ? ` (${info.neighborhood})` : ""} · score ${info?.score ?? "—"}`);
    if (info?.slug) console.log(`     https://trycleanplate.com/restaurant/${info.slug}`);
    if (reasonText) console.log(`     ${reasonText}`);
    for (const r of rs.filter((r) => r.note).slice(0, 3)) console.log(`     “${r.note}”`);
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
