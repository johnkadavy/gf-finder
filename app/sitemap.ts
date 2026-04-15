import { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";

const BASE_URL = "https://trycleanplate.com";

function toSlug(s: string): string {
  return s.toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const CATEGORY_SLUGS = ["pizza", "pasta", "bakery", "breakfast", "cafe", "bar", "fine-dining"];

const GF_FOOD_MAP: Record<string, string> = {
  pizza: "gf_pizza", pasta: "gf_pasta", bakery: "gf_bread_bakery", breakfast: "gf_breakfast",
};
const PLACE_TYPE_MAP: Record<string, string> = {
  cafe: "cafe", bar: "bar", "fine-dining": "fine_dining",
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [restaurantsRes, landingRes] = await Promise.all([
    supabase.from("restaurants").select("id, updated_at").not("score", "is", null).order("id", { ascending: true }),
    supabase.from("restaurants").select("city, neighborhood, gf_food_categories, place_type").not("score", "is", null).not("neighborhood", "is", null),
  ]);

  // ── Restaurant detail pages ──
  const restaurantUrls: MetadataRoute.Sitemap = (restaurantsRes.data ?? []).map((r) => ({
    url: `${BASE_URL}/restaurant/${r.id}`,
    lastModified: r.updated_at ? new Date(r.updated_at) : new Date(),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  // ── Programmatic landing pages ──
  type Row = { city: string; neighborhood: string | null; gf_food_categories: string[] | null; place_type: string[] | null };
  const rows = (landingRes.data ?? []) as Row[];

  type Entry = { count: number; catCounts: Map<string, number> };
  const map = new Map<string, Entry>();
  for (const r of rows) {
    if (!r.neighborhood) continue;
    const key = `${r.city}||${r.neighborhood}`;
    if (!map.has(key)) map.set(key, { count: 0, catCounts: new Map() });
    const entry = map.get(key)!;
    entry.count++;
    for (const cat of r.gf_food_categories ?? []) entry.catCounts.set(cat, (entry.catCounts.get(cat) ?? 0) + 1);
    for (const pt of r.place_type ?? []) {
      const k = `pt:${pt}`;
      entry.catCounts.set(k, (entry.catCounts.get(k) ?? 0) + 1);
    }
  }

  const landingUrls: MetadataRoute.Sitemap = [];
  for (const [key, { count, catCounts }] of map) {
    if (count < 3) continue;
    const [city, neighborhood] = key.split("||");
    const cs = toSlug(city);
    const ns = toSlug(neighborhood);
    landingUrls.push({ url: `${BASE_URL}/gluten-free/${cs}/${ns}`, changeFrequency: "weekly", priority: 0.8 });
    for (const catSlug of CATEGORY_SLUGS) {
      const dbKey = GF_FOOD_MAP[catSlug] ? GF_FOOD_MAP[catSlug] : `pt:${PLACE_TYPE_MAP[catSlug]}`;
      if ((catCounts.get(dbKey) ?? 0) >= 3) {
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
