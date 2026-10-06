/**
 * Generates the intro copy for /gluten-free landing pages and stores it in
 * public.landing_copy. Pages without a row keep their built-in template.
 *
 * Usage:
 *   npx tsx scripts/generate-landing-copy.ts                          # DRY RUN: 5 sample pages, prints copy, writes nothing
 *   npx tsx scripts/generate-landing-copy.ts --page new-york/west-village
 *   npx tsx scripts/generate-landing-copy.ts --sample 10              # dry run, 10 pages
 *   npx tsx scripts/generate-landing-copy.ts --write                  # generate + save every page without copy yet
 *   npx tsx scripts/generate-landing-copy.ts --write --force          # also regenerate pages that already have copy
 *   options: --city new-york   --limit 50   --model claude-sonnet-4-6
 *
 * Cost profile:
 *   - Supabase: ONE light scan of plain columns (no dossier), keyset-paginated.
 *     Pages, spots and links are all worked out in memory from it.
 *   - Claude: one call per page; the fixed instructions + example are cached
 *     (prompt caching), so each page mostly pays for its small fact sheet + output.
 *   - Scope: neighborhood pages + search-intent guides only (pizza, brunch, bars,
 *     cafés, bakeries, fine dining). Pasta / desserts / fryer / dedicated keep templates.
 *
 * Checks never block: issues are printed here and can be re-checked later with
 * scripts/landing-copy-report.ts. Rows with status 'locked' are never overwritten.
 */
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { toSlug } from "../lib/categories";
import {
  INTENT_CATEGORIES,
  ISSUE_CATEGORIES,
  QUALIFYING_SCORE,
  buildFactSheet,
  buildPrompt,
  checkCopy,
  computeCityLandingIndex,
  neighborhoodCentroids,
  rowInCategory,
  type CopyRow,
  type IssueCategory,
  type PageSpec,
} from "../lib/landing-copy";

dotenv.config({ path: ".env.local" });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const anthropic = new Anthropic();

// ── CLI ───────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (f: string) => argv.includes(f);
const opt = (f: string) => { const i = argv.indexOf(f); return i !== -1 ? argv[i + 1] : undefined; };
const WRITE = flag("--write");
const FORCE = flag("--force");
const ONLY_PAGE = opt("--page");
const ONLY_CITY = opt("--city");
const LIMIT = opt("--limit") ? Number(opt("--limit")) : Infinity;
const SAMPLE = opt("--sample") ? Number(opt("--sample")) : 5;
const MODEL = opt("--model") ?? "claude-sonnet-4-6";
const PAGE_ROW_CAP = 100; // landing pages list at most 100 restaurants

// Plain columns only: no dossier/verified_data (large JSON → expensive disk reads)
const COLUMNS = "id, name, display_name, slug, city, neighborhood, score, cuisine, google_rating, dedicated_gf_kitchen, gf_food_categories, place_type, lat, lng";
const PAGE = 500;

async function scanQualifying(): Promise<CopyRow[]> {
  const out: CopyRow[] = [];
  let afterId = 0;
  for (;;) {
    let data: CopyRow[] | null = null;
    for (let attempt = 1; ; attempt++) {
      let q = supabase.from("restaurants").select(COLUMNS).gte("score", QUALIFYING_SCORE);
      if (ONLY_CITY) q = q.eq("city", ONLY_CITY_NAME ?? "");
      const res = await q.gt("id", afterId).order("id").limit(PAGE);
      if (!res.error) { data = (res.data ?? []) as CopyRow[]; break; }
      if (attempt >= 3) throw new Error(`${res.error.message} (after ${attempt} attempts)`);
      console.log(`  retrying after error: ${res.error.message}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
    out.push(...data);
    if (data.length < PAGE) break;
    afterId = data[data.length - 1].id;
  }
  return out;
}
let ONLY_CITY_NAME: string | undefined;

// Running token totals (for the cost summary)
const usage = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };

async function generate(system: string, user: string): Promise<string> {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 600,
    // The fixed instructions are identical for every page → cache them
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });
  usage.input += res.usage.input_tokens;
  usage.output += res.usage.output_tokens;
  usage.cacheWrite += res.usage.cache_creation_input_tokens ?? 0;
  usage.cacheRead += res.usage.cache_read_input_tokens ?? 0;
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

async function main() {
  console.log(`CleanPlate — landing copy (${WRITE ? "WRITE" : "DRY RUN"}, model ${MODEL})\n`);
  const t0 = Date.now();
  const since = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

  // ── 1. One light scan ──────────────────────────────────────────────────────
  if (ONLY_CITY) {
    // resolve the city name from its slug with a tiny query
    const { data } = await supabase.from("restaurants").select("city").gte("score", QUALIFYING_SCORE).limit(1000);
    ONLY_CITY_NAME = [...new Set((data ?? []).map((r: { city: string }) => r.city))].find((c) => toSlug(c) === ONLY_CITY);
    if (!ONLY_CITY_NAME) { console.error(`No city "${ONLY_CITY}".`); process.exit(1); }
  }
  console.log("Scanning restaurants (plain columns only)…");
  const rows = await scanQualifying();
  const { data: existingData, error: existingError } = await supabase.from("landing_copy").select("path, status").limit(10000);
  if (existingError) throw new Error(existingError.message);
  const existingStatus = new Map(((existingData ?? []) as { path: string; status: string }[]).map((r) => [r.path, r.status]));
  console.log(`  ${rows.length} qualifying restaurants, ${existingStatus.size} pages with copy already (${since()})\n`);

  // ── 2. Pages, in memory ────────────────────────────────────────────────────
  type Job = { spec: PageSpec; pageRows: CopyRow[]; cityRows: CopyRow[] };
  const jobs: Job[] = [];
  const top = (list: CopyRow[]) => [...list].sort((a, b) => b.score - a.score).slice(0, PAGE_ROW_CAP);
  const byCity = new Map<string, CopyRow[]>();
  for (const r of rows) {
    const list = byCity.get(r.city);
    if (list) list.push(r); else byCity.set(r.city, [r]);
  }

  const cityCtx = new Map<string, { index: ReturnType<typeof computeCityLandingIndex>; centroids: ReturnType<typeof neighborhoodCentroids>; names: string[] }>();
  for (const [city, cityRows] of byCity) {
    const citySlug = toSlug(city);
    const index = computeCityLandingIndex(citySlug, cityRows);
    cityCtx.set(city, {
      index,
      centroids: neighborhoodCentroids(cityRows),
      names: cityRows.flatMap((r) => [r.name, r.display_name ?? ""]).filter(Boolean),
    });
    for (const cat of INTENT_CATEGORIES) {
      if (!index.categories[cat]) continue;
      jobs.push({ spec: { path: `${citySlug}/${cat}`, kind: "city-category", city, citySlug, category: cat }, pageRows: top(cityRows.filter((r) => rowInCategory(r, cat))), cityRows });
    }
    for (const [nbSlug, nb] of Object.entries(index.neighborhoods)) {
      const nbRows = cityRows.filter((r) => r.neighborhood && toSlug(r.neighborhood) === nbSlug);
      jobs.push({ spec: { path: `${citySlug}/${nbSlug}`, kind: "neighborhood", city, citySlug, neighborhood: nb.name, nbhdSlug: nbSlug }, pageRows: top(nbRows), cityRows });
      for (const cat of INTENT_CATEGORIES) {
        if (!index.neighborhoodCategories[`${nbSlug}/${cat}`]) continue;
        jobs.push({
          spec: { path: `${citySlug}/${nbSlug}/${cat}`, kind: "neighborhood-category", city, citySlug, neighborhood: nb.name, nbhdSlug: nbSlug, category: cat },
          pageRows: top(nbRows.filter((r) => rowInCategory(r, cat))),
          cityRows,
        });
      }
    }
  }

  let todo = jobs.filter((j) => !ONLY_PAGE || j.spec.path === ONLY_PAGE);
  if (ONLY_PAGE && todo.length === 0) {
    console.error(`No generated-copy page "${ONLY_PAGE}" (pasta/desserts/fryer/dedicated pages keep their template). Examples: ${jobs.slice(0, 5).map((j) => j.spec.path).join(", ")}`);
    process.exit(1);
  }
  const locked = todo.filter((j) => existingStatus.get(j.spec.path) === "locked").length;
  todo = todo.filter((j) => existingStatus.get(j.spec.path) !== "locked");
  if (WRITE && !FORCE && !ONLY_PAGE) todo = todo.filter((j) => !existingStatus.has(j.spec.path));
  if (!WRITE && !ONLY_PAGE) {
    const byKind = ["neighborhood", "neighborhood-category", "city-category"].map((k) => todo.filter((j) => j.spec.kind === k));
    const sample: Job[] = [];
    for (let i = 0; sample.length < Math.min(SAMPLE, todo.length); i++) {
      for (const group of byKind) if (group[i] && sample.length < SAMPLE) sample.push(group[i]);
    }
    todo = sample;
  }
  todo = todo.slice(0, LIMIT);
  console.log(`${jobs.length} pages get generated copy · ${locked} locked (skipped) · ${todo.length} to generate now\n`);

  // ── 3. Generate ────────────────────────────────────────────────────────────
  let saved = 0, errored = 0, clean = 0;
  const issueCounts = Object.fromEntries(ISSUE_CATEGORIES.map((c) => [c, 0])) as Record<IssueCategory, number>;
  const errorPages: string[] = [];
  for (const [i, job] of todo.entries()) {
    const label = `[${i + 1}/${todo.length}] ${job.spec.path}`;
    try {
      process.stdout.write(`${label}  writing…\r`);
      const ctx = cityCtx.get(job.spec.city)!;
      const facts = buildFactSheet(job.spec, job.pageRows, ctx.index, ctx.centroids);
      const { system, user } = buildPrompt(facts);
      const body = await generate(system, user);
      if (!body) throw new Error("empty response");
      const issues = checkCopy(body, facts, ctx.names);
      const cats = [...new Set(issues.map((x) => x.category))];
      cats.forEach((c) => issueCounts[c]++);
      if (cats.length === 0) clean++;

      if (WRITE) {
        const now = new Date().toISOString();
        const { error } = await supabase.from("landing_copy").upsert({
          path: job.spec.path, body, facts, model: MODEL, status: "published", generated_at: now, updated_at: now,
        });
        if (error) throw new Error(error.message);
        saved++;
      }
      console.log(`${label}  ${WRITE ? "saved · " : ""}${cats.length ? `⚠ ${cats.join(", ")}` : "✓ clean"}`);
      for (const x of issues) console.log(`    [${x.category}] ${x.message}`);
      if (!WRITE) {
        console.log(`    spots: ${facts.spots.map((s) => s.name + (s.dedicated_gf_kitchen ? " [kitchen]" : "")).join(", ") || "none, character + links only"}`);
        console.log(`    links: ${facts.links.map((l) => l.token).join(", ") || "none"}`);
        console.log(`\n${body.split("\n").map((l) => `    ${l}`).join("\n")}\n`);
      }
    } catch (e) {
      errored++;
      errorPages.push(`${job.spec.path}: ${(e as Error).message}`);
      console.log(`${label}  ✗ error: ${(e as Error).message} (page keeps its current intro)`);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const done = todo.length - errored;
  console.log(`\nDone in ${since()}. ${WRITE ? `${saved} saved. ` : ""}${clean}/${done} clean.`);
  console.log(`Pages with issues: ${ISSUE_CATEGORIES.map((c) => `${c} ${issueCounts[c]}`).join(" · ")}`);
  // Sonnet list prices per million tokens: input $3, cache write $3.75, cache read $0.30, output $15
  const cost = (usage.input * 3 + usage.cacheWrite * 3.75 + usage.cacheRead * 0.3 + usage.output * 15) / 1e6;
  console.log(`Tokens: ${usage.input} input · ${usage.cacheWrite} cache-write · ${usage.cacheRead} cache-read · ${usage.output} output ≈ $${cost.toFixed(3)}${MODEL.includes("sonnet") ? "" : " (Sonnet prices; adjust for other models)"}`);
  if (errorPages.length) console.log(`Errors (not saved, re-run to retry):\n  ${errorPages.join("\n  ")}`);
  console.log(WRITE ? "Re-check saved copy anytime: npx tsx scripts/landing-copy-report.ts" : "Dry run, nothing saved. Re-run with --write to generate and save every page.");
}

main().catch((e) => { console.error(e); process.exit(1); });
