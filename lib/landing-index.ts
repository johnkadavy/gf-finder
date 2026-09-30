import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabase";
import { CATEGORIES, toSlug, type CategoryDef } from "@/lib/categories";

/**
 * Index of the NYC /gluten-free landing pages that actually exist.
 * Thresholds mirror those pages' own notFound logic (neighborhood ≥3,
 * city category ≥5 qualifying restaurants at score ≥75), so links never 404.
 * Shared by the homepage explore tiles, /api/suggestions, and the search
 * results "jump to landing page" shortcut.
 */

export type LandingLink = { label: string; href: string; count: number; emoji?: string };

type CategoryLinkDef = { slug: string; label: string; emoji: string; keywords: string[] };

// Display order for category tiles. `keywords` match whole query tokens
// (single words) or substrings (multi-word phrases) — see matchCategory().
export const CATEGORY_LINK_ORDER: CategoryLinkDef[] = [
  { slug: "pizza",       label: "GF Pizza",     emoji: "🍕", keywords: ["pizza", "pizzas", "pizzeria", "pizzerias", "slice", "slices"] },
  { slug: "bakery",      label: "GF Bakeries",  emoji: "🥐", keywords: ["bakery", "bakeries", "baked", "pastry", "pastries", "bread", "croissant", "croissants"] },
  { slug: "pasta",       label: "GF Pasta",     emoji: "🍝", keywords: ["pasta", "pastas", "spaghetti", "noodle", "noodles", "gnocchi", "ravioli"] },
  { slug: "breakfast",   label: "GF Breakfast", emoji: "🍳", keywords: ["breakfast", "brunch", "pancake", "pancakes", "waffle", "waffles", "bagel", "bagels"] },
  { slug: "desserts",    label: "GF Desserts",  emoji: "🍰", keywords: ["dessert", "desserts", "cake", "cakes", "cookie", "cookies", "sweets", "ice cream"] },
  { slug: "dedicated",   label: "Dedicated GF", emoji: "🛡️", keywords: ["dedicated", "100% gf", "fully gluten-free", "fully gluten free"] },
  { slug: "fryer",       label: "GF Fryer",     emoji: "🍟", keywords: ["fryer", "fries", "fried", "wings"] },
  { slug: "cafe",        label: "Cafés",        emoji: "☕", keywords: ["cafe", "cafes", "café", "cafés", "coffee"] },
  { slug: "bar",         label: "Bars",         emoji: "🍸", keywords: ["bar", "bars", "cocktail", "cocktails", "drinks", "beer"] },
  { slug: "fine-dining", label: "Fine Dining",  emoji: "🍽️", keywords: ["fine dining", "upscale", "tasting menu", "date night"] },
];

type IndexRow = {
  neighborhood: string | null;
  gf_food_categories: string[] | null;
  place_type: string[] | null;
  fryer: string | null;
  ccr: string | null;
};

function rowMatchesCategory(r: IndexRow, def: CategoryDef): boolean {
  if (def.type === "gf_food" && def.value)    return r.gf_food_categories?.includes(def.value) ?? false;
  if (def.type === "place_type" && def.value) return r.place_type?.includes(def.value) ?? false;
  if (def.type === "fryer")                   return r.fryer === "true";
  if (def.type === "dedicated")               return r.ccr === "low";
  return false;
}

export type LandingIndex = { neighborhoods: LandingLink[]; categories: (LandingLink & { slug: string })[] };

export const getNycLandingIndex = unstable_cache(
  async (): Promise<LandingIndex> => {
    const { data } = await supabase
      .from("restaurants")
      .select("neighborhood, gf_food_categories, place_type, fryer:dossier->operations->dedicated_equipment->>fryer, ccr:dossier->operations->>cross_contamination_risk")
      .eq("city", "New York")
      .not("score", "is", null)
      .gte("score", 75);
    const rows = (data ?? []) as IndexRow[];

    const nbhdCounts = new Map<string, number>();
    for (const r of rows) {
      if (!r.neighborhood) continue;
      nbhdCounts.set(r.neighborhood, (nbhdCounts.get(r.neighborhood) ?? 0) + 1);
    }
    const neighborhoods: LandingLink[] = [...nbhdCounts.entries()]
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ label: name, href: `/gluten-free/new-york/${toSlug(name)}`, count }));

    const categories = CATEGORY_LINK_ORDER
      .map(({ slug, label, emoji }) => {
        const def = CATEGORIES[slug];
        const count = def ? rows.filter((r) => rowMatchesCategory(r, def)).length : 0;
        return { slug, label, href: `/gluten-free/new-york/${slug}`, count, emoji };
      })
      .filter((c) => c.count >= 5);

    return { neighborhoods, categories };
  },
  ["nyc-landing-index"],
  { revalidate: 3600 },
);

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/** First category landing page whose keywords appear in the query, if any. */
export function matchCategory<T extends { slug: string }>(query: string, categories: T[]): T | null {
  const q = normalize(query);
  if (!q) return null;
  const tokens = new Set(q.split(/[^a-z0-9%]+/).filter(Boolean));
  for (const def of CATEGORY_LINK_ORDER) {
    const hit = def.keywords.some((k) => {
      const nk = normalize(k);
      return nk.includes(" ") || nk.includes("%") ? q.includes(nk) : tokens.has(nk);
    });
    if (!hit) continue;
    const cat = categories.find((c) => c.slug === def.slug);
    if (cat) return cat;
  }
  return null;
}

/**
 * Neighborhood landing pages matching a partial query — prefix match on the
 * name or on any word in it ("vil" → West Village, "wil" → Williamsburg), or
 * a query that contains the whole name ("west village pizza").
 */
export function matchNeighborhoods(query: string, neighborhoods: LandingLink[], limit = 2): LandingLink[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  return neighborhoods
    .filter((n) => {
      const name = normalize(n.label);
      return name.startsWith(q) || q.includes(name) || name.split(/\s+/).some((w) => w.startsWith(q)) || (q.length >= 4 && name.includes(q));
    })
    .slice(0, limit);
}
