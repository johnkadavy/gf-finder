/**
 * Scrapes restaurant websites to verify GF menu labeling, then stores the
 * result in the `verified_data` column.
 *
 * Usage:
 *   npx tsx scripts/enrich-menu-labeling.ts           # processes 10
 *   npx tsx scripts/enrich-menu-labeling.ts --limit 50
 *   npx tsx scripts/enrich-menu-labeling.ts --limit all
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const limitIdx = process.argv.indexOf("--limit");
const limitArg = limitIdx >= 0 ? process.argv[limitIdx + 1] : undefined;
const LIMIT: number = limitArg === "all" ? Infinity : !limitArg ? 10 : parseInt(limitArg, 10);
const FETCH_BATCH = Number.isFinite(LIMIT) ? Math.min(LIMIT * 5, 500) : 500;

const cityIdx = process.argv.indexOf("--city");
const CITY: string | null = cityIdx >= 0 ? process.argv[cityIdx + 1] ?? null : null;
const FETCH_TIMEOUT_MS = 8000;

// ── JSON-LD detection ───────────────────────────────────────────────────────

type GfSignal = "clear" | "partial" | "none" | null;

// Walk JSON-LD recursively counting gluten-free signals
function countGfSignals(obj: unknown, depth = 0): { suitableForDiet: number; textMentions: number } {
  if (depth > 8 || obj === null || obj === undefined) return { suitableForDiet: 0, textMentions: 0 };

  if (typeof obj === "string") {
    const gfPattern = /\b(gluten.?free|gluten free|\bGF\b)/i;
    return { suitableForDiet: 0, textMentions: gfPattern.test(obj) ? 1 : 0 };
  }

  if (Array.isArray(obj)) {
    return obj.reduce(
      (acc, item) => {
        const r = countGfSignals(item, depth + 1);
        return { suitableForDiet: acc.suitableForDiet + r.suitableForDiet, textMentions: acc.textMentions + r.textMentions };
      },
      { suitableForDiet: 0, textMentions: 0 }
    );
  }

  if (typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    let suitableForDiet = 0;
    let textMentions = 0;

    for (const [key, val] of Object.entries(o)) {
      if (key === "suitableForDiet") {
        // schema.org suitableForDiet is a definitive machine-readable label
        const s = JSON.stringify(val).toLowerCase();
        if (s.includes("gluten")) suitableForDiet++;
      } else {
        const r = countGfSignals(val, depth + 1);
        suitableForDiet += r.suitableForDiet;
        textMentions += r.textMentions;
      }
    }
    return { suitableForDiet, textMentions };
  }

  return { suitableForDiet: 0, textMentions: 0 };
}

// Returns a GF signal if JSON-LD provides enough certainty, otherwise null (fall through to Claude)
function detectGfFromJsonLd(html: string): GfSignal {
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let totalSuitableForDiet = 0;
  let totalTextMentions = 0;

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const obj = JSON.parse(match[1]) as Record<string, unknown>;
      const { suitableForDiet, textMentions } = countGfSignals(obj);
      totalSuitableForDiet += suitableForDiet;
      totalTextMentions += textMentions;
    } catch {
      // invalid JSON, skip
    }
  }

  // Only return a positive signal — absence of GF in JSON-LD doesn't mean it's absent
  // from the page (restaurant may use plain text descriptions instead of schema.org markup)
  if (totalSuitableForDiet >= 3) return "clear";
  if (totalSuitableForDiet >= 1) return "partial";
  if (totalTextMentions >= 3) return "partial";
  return null; // fall through to page text / Claude
}

// Extract plain text from JSON-LD for Claude fallback
function extractJsonLdMenuText(html: string): string | null {
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const chunks: string[] = [];
  let match;

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const obj = JSON.parse(match[1]) as Record<string, unknown>;
      const type = obj["@type"] as string | undefined;
      if (type === "Menu" || type === "MenuSection") {
        chunks.push(JSON.stringify(obj).slice(0, 2000));
      }
    } catch { /* skip */ }
  }

  return chunks.length > 0 ? chunks.join("\n").slice(0, 5000) : null;
}

// ── HTML helpers ────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findMenuLink(html: string, baseUrl: string): string | null {
  const linkRegex = /<a[^>]+href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1].trim();
    const text = stripHtml(match[2]).toLowerCase();
    if (
      text.includes("menu") ||
      href.toLowerCase().includes("/menu") ||
      href.toLowerCase().includes("menu.") ||
      href.toLowerCase() === "menu"
    ) {
      // Skip PDFs and social links
      if (/\.(pdf|jpg|jpeg|png|gif)/i.test(href)) continue;
      if (/instagram|facebook|twitter|yelp|opentable/i.test(href)) continue;
      try {
        return new URL(href, baseUrl).toString();
      } catch {
        // invalid URL
      }
    }
  }
  return null;
}

async function fetchWithTimeout(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GF-Finder-Bot/1.0)" },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type MenuContent = { text: string; source: string; directSignal?: GfSignal };

async function getMenuContent(websiteUrl: string): Promise<MenuContent | null> {
  const homeHtml = await fetchWithTimeout(websiteUrl);
  if (!homeHtml) return null;

  // Try to find and follow a menu link
  const menuLink = findMenuLink(homeHtml, websiteUrl);
  const menuHtml = menuLink && menuLink !== websiteUrl
    ? await fetchWithTimeout(menuLink)
    : null;

  for (const [html, source] of [
    [menuHtml, menuLink ?? websiteUrl],
    [homeHtml, websiteUrl],
  ] as [string | null, string][]) {
    if (!html) continue;

    // Try direct JSON-LD detection first — no Claude needed
    const directSignal = detectGfFromJsonLd(html);
    if (directSignal !== null) return { text: "", source, directSignal };

    // Fall back to plain text for Claude
    const jsonLdText = extractJsonLdMenuText(html);
    if (jsonLdText && jsonLdText.length > 100) return { text: jsonLdText, source };

    const stripped = stripHtml(html).slice(0, 5000);
    if (stripped.length > 200) return { text: stripped, source };
  }

  return null;
}

// ── Claude classification ────────────────────────────────────────────────────

type GfLabeling = "clear" | "partial" | "none" | "unknown";

async function classifyGfLabeling(menuText: string, restaurantName: string): Promise<GfLabeling> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 64,
    messages: [
      {
        role: "user",
        content: `You are analyzing a restaurant website to determine if gluten-free items are explicitly labeled on their menu.

Restaurant: ${restaurantName}

Website text (truncated):
${menuText}

Reply with ONLY a JSON object, nothing else:
{"gf_labeling": "clear"|"partial"|"none"|"unknown"}

Definitions:
- "clear": multiple menu items are explicitly marked as gluten-free (e.g. "GF", "gluten-free", "(gf)" labels appear next to items)
- "partial": some gluten-free mentions but not systematic per-item labeling (e.g. "we have GF options" or only 1-2 items labeled)
- "none": menu content found but no gluten-free labeling present
- "unknown": couldn't find actual menu content or content is too thin to judge`,
      },
    ],
  });

  try {
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(text.trim());
    const value = parsed.gf_labeling;
    if (["clear", "partial", "none", "unknown"].includes(value)) return value as GfLabeling;
  } catch {
    // fall through
  }
  return "unknown";
}

// ── Main ─────────────────────────────────────────────────────────────────────

type Row = {
  id: number;
  name: string;
  website_url: string;
  dossier: { menu?: { gf_labeling?: string } } | null;
  verified_data: {
    menu?: { gf_labeling?: string };
    meta?: { gf_labeling_attempted_at?: string; gf_labeling_source?: string };
  } | null;
};

async function main() {
  console.log("CleanPlate — Menu Labeling Enrichment\n");

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set in .env.local");
    process.exit(1);
  }

  // Fetch a batch, filter to unscraped in JS
  let query = supabase
    .from("restaurants")
    .select("id, name, website_url, dossier, verified_data")
    .not("website_url", "is", null)
    .not("dossier", "is", null);

  if (CITY) query = query.eq("city", CITY);

  const { data, error } = await query.limit(FETCH_BATCH);

  if (error) {
    console.error("Fetch error:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as Row[];
  const toProcess = rows
    .filter((r) => !r.verified_data?.meta?.gf_labeling_attempted_at)
    .slice(0, LIMIT);

  console.log(`Found ${rows.length} candidates, ${toProcess.length} unscraped — processing ${toProcess.length}\n`);
  console.log(
    "  " +
    "Restaurant".padEnd(35) +
    "AI value".padEnd(12) +
    "Scraped".padEnd(12) +
    "Source"
  );
  console.log("  " + "─".repeat(85));

  let succeeded = 0;
  let failed = 0;
  let noContent = 0;

  for (const row of toProcess) {
    const aiValue = row.dossier?.menu?.gf_labeling ?? "—";
    process.stdout.write(`  ${row.name.slice(0, 33).padEnd(35)}`);

    const menuContent = await getMenuContent(row.website_url);

    if (!menuContent) {
      console.log(`${"—".padEnd(12)}${"—".padEnd(12)}no content`);
      noContent++;
      await supabase
        .from("restaurants")
        .update({
          verified_data: {
            ...row.verified_data,
            meta: {
              ...row.verified_data?.meta,
              gf_labeling_attempted_at: new Date().toISOString(),
              gf_labeling_source: "no_content",
            },
          },
        })
        .eq("id", row.id);
      continue;
    }

    // Use direct JSON-LD signal if available, otherwise ask Claude
    const scrapedValue: GfLabeling = menuContent.directSignal
      ?? await classifyGfLabeling(menuContent.text, row.name);
    const method = menuContent.directSignal ? "json-ld" : "claude";
    const shortSource = menuContent.source.replace(/^https?:\/\//, "").slice(0, 28);

    console.log(`${aiValue.padEnd(12)}${scrapedValue.padEnd(12)}${shortSource} [${method}]`);

    // Only store menu.gf_labeling for confident results; unknown just marks as attempted
    const verifiedMenuUpdate = scrapedValue !== "unknown"
      ? { menu: { ...row.verified_data?.menu, gf_labeling: scrapedValue } }
      : { menu: row.verified_data?.menu };

    const { error: updateError } = await supabase
      .from("restaurants")
      .update({
        verified_data: {
          ...row.verified_data,
          ...verifiedMenuUpdate,
          meta: {
            ...row.verified_data?.meta,
            gf_labeling_attempted_at: new Date().toISOString(),
            gf_labeling_source: menuContent.source,
          },
        },
      })
      .eq("id", row.id);

    if (updateError) {
      console.error(`    Update error: ${updateError.message}`);
      failed++;
    } else {
      succeeded++;
    }

    // Small delay to be polite to restaurant websites
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\nDone. ${succeeded} scraped, ${noContent} no content, ${failed} errors.`);
  console.log("\nRun backfill-scores.ts to update stored scores with verified data.");
}

main();
