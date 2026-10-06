/**
 * Diagnostic report for generated landing-page intros. Re-checks every saved
 * row in public.landing_copy against the facts it was written from and
 * summarizes how often each kind of issue occurs. Read-only.
 *
 * Usage:
 *   npx tsx scripts/landing-copy-report.ts                    # summary + pages per category
 *   npx tsx scripts/landing-copy-report.ts --category safety  # every page with a safety issue, with the text
 *   npx tsx scripts/landing-copy-report.ts --page new-york/west-village
 *
 * Categories (lib/landing-copy.ts → checkCopy):
 *   safety   — safety promises; kitchen claims about restaurants not verified as dedicated
 *   accuracy — restaurants or numbers not in the facts
 *   links    — link tokens not offered for that page, malformed brackets (hidden on the page)
 *   format   — length, markdown (stripped on the page)
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { ISSUE_CATEGORIES, checkCopy, type CopyIssue, type FactSheet, type IssueCategory } from "../lib/landing-copy";

dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const argv = process.argv.slice(2);
const opt = (f: string) => { const i = argv.indexOf(f); return i !== -1 ? argv[i + 1] : undefined; };
const ONLY_CATEGORY = opt("--category") as IssueCategory | undefined;
const ONLY_PAGE = opt("--page");

type Row = { path: string; body: string; facts: FactSheet; model: string; status: string; generated_at: string };

async function fetchAll<T extends { id: number }>(
  build: (afterId: number, n: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  let afterId = 0;
  for (;;) {
    let data: T[] | null = null;
    for (let attempt = 1; ; attempt++) {
      const res = await build(afterId, 500);
      if (!res.error) { data = res.data ?? []; break; }
      if (attempt >= 3) throw new Error(`${res.error.message} (after ${attempt} attempts)`);
      await new Promise((ok) => setTimeout(ok, 1500 * attempt));
    }
    out.push(...data);
    if (data.length < 500) break;
    afterId = data[data.length - 1].id;
  }
  return out;
}

async function main() {
  const { data: copyData, error: copyError } = await supabase
    .from("landing_copy").select("path, body, facts, model, status, generated_at").order("path").limit(10000);
  if (copyError) throw new Error(copyError.message);
  const rows = (copyData ?? []) as Row[];
  const nameRows = await fetchAll<{ id: number; name: string; display_name: string | null; city: string }>((after, n) =>
    supabase.from("restaurants").select("id, name, display_name, city").gte("score", 75).gt("id", after).order("id").limit(n),
  );
  const namesByCity = new Map<string, string[]>();
  for (const r of nameRows) {
    const list = namesByCity.get(r.city) ?? [];
    list.push(r.name, ...(r.display_name ? [r.display_name] : []));
    namesByCity.set(r.city, list);
  }

  const results = rows
    .filter((r) => !ONLY_PAGE || r.path === ONLY_PAGE)
    .map((r) => ({ row: r, issues: checkCopy(r.body, r.facts, namesByCity.get(r.facts.page.city) ?? []) }));

  if (ONLY_PAGE) {
    const res = results[0];
    if (!res) { console.log(`No saved copy for ${ONLY_PAGE}.`); return; }
    console.log(`${res.row.path} · ${res.row.status} · ${res.row.model} · ${res.row.generated_at.slice(0, 10)}\n`);
    console.log(res.row.body + "\n");
    console.log(res.issues.length ? res.issues.map((x) => `[${x.category}] ${x.message}`).join("\n") : "No issues.");
    return;
  }

  const total = results.length;
  const clean = results.filter((r) => r.issues.length === 0).length;
  console.log(`Landing copy report — ${total} pages with saved copy\n`);
  console.log(`Clean: ${clean} (${pct(clean, total)})`);
  for (const c of ISSUE_CATEGORIES) {
    const n = results.filter((r) => r.issues.some((x) => x.category === c)).length;
    console.log(`${c.padEnd(9)} ${String(n).padStart(4)} pages (${pct(n, total)})`);
  }

  // Most common issue patterns (numbers/names collapsed) — shows what to fix in the prompt or checks
  const patterns = new Map<string, number>();
  for (const { issues } of results) {
    for (const x of issues) {
      const key = `[${x.category}] ${x.message.replace(/"[^"]*"/g, '"…"').replace(/: .*$/, "")}`;
      patterns.set(key, (patterns.get(key) ?? 0) + 1);
    }
  }
  if (patterns.size) {
    console.log("\nMost common issues:");
    [...patterns.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
      .forEach(([k, n]) => console.log(`  ${String(n).padStart(4)} × ${k}`));
  }

  for (const c of ONLY_CATEGORY ? [ONLY_CATEGORY] : ISSUE_CATEGORIES) {
    const hits = results.filter((r) => r.issues.some((x) => x.category === c));
    if (!hits.length) continue;
    console.log(`\n── ${c} (${hits.length}) ──`);
    const show = ONLY_CATEGORY ? hits : hits.slice(0, 15);
    for (const { row, issues } of show) {
      console.log(`  ${row.path}`);
      issues.filter((x: CopyIssue) => x.category === c).forEach((x) => console.log(`      ${x.message}`));
      if (ONLY_CATEGORY) console.log(`\n${row.body.split("\n").map((l) => `      ${l}`).join("\n")}\n`);
    }
    if (!ONLY_CATEGORY && hits.length > show.length) console.log(`  … ${hits.length - show.length} more — run with --category ${c}`);
  }

  console.log("\nTo fix a page: edit its body in Supabase and set status = 'locked', or re-run the generator for it:");
  console.log("  npx tsx scripts/generate-landing-copy.ts --page <path> --write");
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "0%");

main().catch((e) => { console.error(e); process.exit(1); });
