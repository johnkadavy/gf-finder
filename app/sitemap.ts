import { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";

export const revalidate = 86400; // regenerate sitemap at most once per 24 hours

const BASE_URL = "https://trycleanplate.com";

function toSlug(s: string): string {
  return s.toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Must stay in sync with CATEGORIES in app/gluten-free/[...slug]/page.tsx
const CATEGORY_SLUGS = ["pizza", "pasta", "bakery", "breakfast", "desserts", "fryer", "dedicated", "cafe", "bar", "fine-dining"];

const GF_FOOD_MAP: Record<string, string> = {
  pizza: "gf_pizza", pasta: "gf_pasta", bakery: "gf_baked_goods", breakfast: "gf_breakfast", desserts: "gf_desserts",
};
const PLACE_TYPE_MAP: Record<string, string> = {
  cafe: "cafe", bar: "bar", "fine-dining": "fine_dining",
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [restaurantsRes, landingRes] = await Promise.all([
    supabase.from("restaurants").select("id, slug, enriched_at, ingested_at").not("score", "is", null).order("id", { ascending: true }),
    // Egress control: pull only the two dossier paths the counts need, not the whole JSONB
    supabase.from("restaurants").select("city, neighborhood, gf_food_categories, place_type, score, fryer:dossier->operations->dedicated_equipment->>fryer, ccr:dossier->operations->>cross_contamination_risk").not("score", "is", null),
  ]);

  // ── Restaurant detail pages ──
  const restaurantUrls: MetadataRoute.Sitemap = (restaurantsRes.data ?? [])
    .filter((r) => r.slug)
    .map((r) => ({
      url: `${BASE_URL}/restaurant/${r.slug}`,
      lastModified: new Date(r.enriched_at ?? r.ingested_at ?? Date.now()),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

  // ── Programmatic landing pages ──
  type Row = {
    city: string;
    neighborhood: string | null;
    gf_food_categories: string[] | null;
    place_type: string[] | null;
    score: number | null;
    fryer: string | null;
    ccr: string | null;
  };
  const rows = (landingRes.data ?? []) as Row[];

  // ── Per city+neighborhood counts (for neighborhood pages) ──
  type Entry = { count: number; catCounts: Map<string, number> };
  const nbhdMap = new Map<string, Entry>();

  // ── Per city counts (for city-level pages) ──
  type CityEntry = { count: number; catCounts: Map<string, number> };
  const cityMap = new Map<string, CityEntry>();

  for (const r of rows) {
    const score = r.score ?? 0;
    const qualifies = score >= 75;

    // City-level aggregation
    const cityKey = r.city;
    if (!cityMap.has(cityKey)) cityMap.set(cityKey, { count: 0, catCounts: new Map() });
    const cityEntry = cityMap.get(cityKey)!;
    if (qualifies) {
      cityEntry.count++;
      for (const cat of r.gf_food_categories ?? []) cityEntry.catCounts.set(cat, (cityEntry.catCounts.get(cat) ?? 0) + 1);
      for (const pt of r.place_type ?? []) {
        const k = `pt:${pt}`;
        cityEntry.catCounts.set(k, (cityEntry.catCounts.get(k) ?? 0) + 1);
      }
      // fryer
      if (r.fryer === "true") {
        cityEntry.catCounts.set("fryer", (cityEntry.catCounts.get("fryer") ?? 0) + 1);
      }
      // dedicated
      if (r.ccr === "low") {
        cityEntry.catCounts.set("dedicated", (cityEntry.catCounts.get("dedicated") ?? 0) + 1);
      }
    }

    // Neighborhood-level aggregation
    if (!r.neighborhood) continue;
    const nbhdKey = `${r.city}||${r.neighborhood}`;
    if (!nbhdMap.has(nbhdKey)) nbhdMap.set(nbhdKey, { count: 0, catCounts: new Map() });
    const nbhdEntry = nbhdMap.get(nbhdKey)!;
    if (qualifies) {
      nbhdEntry.count++;
      for (const cat of r.gf_food_categories ?? []) nbhdEntry.catCounts.set(cat, (nbhdEntry.catCounts.get(cat) ?? 0) + 1);
      for (const pt of r.place_type ?? []) {
        const k = `pt:${pt}`;
        nbhdEntry.catCounts.set(k, (nbhdEntry.catCounts.get(k) ?? 0) + 1);
      }
      if (r.fryer === "true") {
        nbhdEntry.catCounts.set("fryer", (nbhdEntry.catCounts.get("fryer") ?? 0) + 1);
      }
      if (r.ccr === "low") {
        nbhdEntry.catCounts.set("dedicated", (nbhdEntry.catCounts.get("dedicated") ?? 0) + 1);
      }
    }
  }

  function catCount(catCounts: Map<string, number>, catSlug: string): number {
    if (GF_FOOD_MAP[catSlug])       return catCounts.get(GF_FOOD_MAP[catSlug]) ?? 0;
    if (PLACE_TYPE_MAP[catSlug])    return catCounts.get(`pt:${PLACE_TYPE_MAP[catSlug]}`) ?? 0;
    if (catSlug === "fryer")        return catCounts.get("fryer") ?? 0;
    if (catSlug === "dedicated")    return catCounts.get("dedicated") ?? 0;
    return 0;
  }

  const landingUrls: MetadataRoute.Sitemap = [];

  // City-level category pages (min 5 qualifying restaurants)
  for (const [city, { catCounts }] of cityMap) {
    const cs = toSlug(city);
    for (const catSlug of CATEGORY_SLUGS) {
      if (catCount(catCounts, catSlug) >= 5) {
        landingUrls.push({ url: `${BASE_URL}/gluten-free/${cs}/${catSlug}`, changeFrequency: "weekly", priority: 0.85 });
      }
    }
  }

  // Neighborhood base + category pages (min 3 qualifying restaurants)
  for (const [key, { count, catCounts }] of nbhdMap) {
    if (count < 3) continue;
    const [city, neighborhood] = key.split("||");
    const cs = toSlug(city);
    const ns = toSlug(neighborhood);
    landingUrls.push({ url: `${BASE_URL}/gluten-free/${cs}/${ns}`, changeFrequency: "weekly", priority: 0.8 });
    for (const catSlug of CATEGORY_SLUGS) {
      if (catCount(catCounts, catSlug) >= 3) {
        landingUrls.push({ url: `${BASE_URL}/gluten-free/${cs}/${ns}/${catSlug}`, changeFrequency: "weekly", priority: 0.8 });
      }
    }
  }

  return [
    { url: BASE_URL,               changeFrequency: "daily",   priority: 1.0 },
    { url: `${BASE_URL}/rankings`, changeFrequency: "daily",   priority: 0.9 },
    { url: `${BASE_URL}/map`,      changeFrequency: "weekly",  priority: 0.8 },
    { url: `${BASE_URL}/about`,    changeFrequency: "monthly", priority: 0.5 },
    ...landingUrls,
    ...restaurantUrls,
  ];
}
