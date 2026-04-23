import { supabase } from "@/lib/supabase";
import { createClient } from "@/lib/supabase-server";
import { getGaugeColor, getScoreLabel } from "@/lib/score";
import { getCityAccess } from "@/lib/cities";
import type { MapRestaurant } from "@/app/map/types";

type Row = {
  id: number;
  name: string;
  city: string;
  neighborhood: string | null;
  lat: number;
  lng: number;
  cuisine: string | null;
  google_rating: number | null;
  price_level: number | null;
  address: string | null;
  website_url: string | null;
  google_maps_url: string | null;
  score: number | null;
  opening_hours: { periods?: { open: { day: number; hour: number; minute: number }; close: { day: number; hour: number; minute: number } }[] } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dossier: Record<string, any> | null;
  source: string | null;
  ingested_at: string | null;
};

function toMapRestaurant(r: Row): MapRestaurant {
  return {
    id: r.id, name: r.name, city: r.city, neighborhood: r.neighborhood,
    lat: r.lat, lng: r.lng, cuisine: r.cuisine, google_rating: r.google_rating,
    price_level: r.price_level, address: r.address, website: r.website_url,
    google_maps_url: r.google_maps_url,
    score: r.score, color: getGaugeColor(r.score), scoreLabel: getScoreLabel(r.score).label,
    periods: r.opening_hours?.periods ?? null,
    short_summary: r.dossier?.summary?.short_summary ?? null,
    source: r.source, ingested_at: r.ingested_at,
  };
}

// ── Fuzzy scoring helpers ────────────────────────────────────────────────────

function trigrams(s: string): string[] {
  const result: string[] = [];
  for (let i = 0; i <= s.length - 3; i++) result.push(s.slice(i, i + 3));
  return result;
}

function trigramSimilarity(a: string, b: string): number {
  const ag = trigrams(a);
  const bg = trigrams(b);
  if (ag.length === 0 || bg.length === 0) return 0;
  const bSet = new Set(bg);
  const matches = ag.filter((g) => bSet.has(g)).length;
  return (2 * matches) / (ag.length + bg.length);
}

/**
 * Returns a 0–1 score for how well a restaurant matches the query.
 * Priority: exact name > name substring > cuisine substring > trigram similarity.
 */
function scoreMatch(name: string, cuisine: string | null, query: string): number {
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  const c = (cuisine ?? "").toLowerCase();

  if (n === q) return 1.0;
  if (n.includes(q)) return 0.95;
  if (c.includes(q)) return 0.90;

  const nameSim = trigramSimilarity(n, q);
  const cuisineSim = c ? trigramSimilarity(c, q) * 0.85 : 0;
  return Math.max(nameSim, cuisineSim);
}

// ── Route ────────────────────────────────────────────────────────────────────

const SELECT = "id, name, city, neighborhood, lat, lng, cuisine, google_rating, price_level, address, website_url, google_maps_url, score, opening_hours, dossier, source, ingested_at";
const MIN_SCORE = 0.25;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q          = searchParams.get("q")?.trim() ?? "";
  const swLat      = searchParams.get("swLat");
  const swLng      = searchParams.get("swLng");
  const neLat      = searchParams.get("neLat");
  const neLng      = searchParams.get("neLng");
  const gfCategory = searchParams.get("gfCategory") ?? "";
  const placeType  = searchParams.get("placeType")  ?? "";
  const fryer      = searchParams.get("fryer") === "1";
  const labeled    = searchParams.get("labeled") === "1";
  const cuisine    = searchParams.get("cuisine") ?? "";

  // Resolve city access
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  const cityAccess = await getCityAccess(user?.id, serverClient);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyMapFilters(query: any) {
    if (!cityAccess.isAdmin) query = query.in("city", cityAccess.allowedCities);
    if (gfCategory) query = query.contains("gf_food_categories", [gfCategory]);
    if (placeType)  query = query.contains("place_type", [placeType]);
    if (fryer)      query = query.eq("dossier->operations->dedicated_equipment->>fryer", "true");
    if (labeled)    query = query.eq("dossier->menu->>gf_labeling", "clear");
    if (cuisine)    query = query.ilike("cuisine", cuisine);
    return query;
  }

  // ── Text search ────────────────────────────────────────────────────────────
  if (q) {
    // Build OR conditions:
    //  1. Direct substring match on name or cuisine
    //  2. Character trigrams on name for fuzzy matching (e.g. "seetgreen" → "sweetgreen")
    const orParts: string[] = [
      `name.ilike.%${q}%`,
      `cuisine.ilike.%${q}%`,
    ];

    if (q.length >= 3) {
      const unique = [...new Set(trigrams(q.toLowerCase()))].slice(0, 12);
      for (const t of unique) orParts.push(`name.ilike.%${t}%`);
    }

    let query = supabase
      .from("restaurants")
      .select(SELECT)
      .not("lat", "is", null)
      .not("lng", "is", null)
      .or(orParts.join(","));

    // Optionally scope to current viewport
    if (swLat && swLng && neLat && neLng) {
      query = query
        .gte("lat", parseFloat(swLat)).lte("lat", parseFloat(neLat))
        .gte("lng", parseFloat(swLng)).lte("lng", parseFloat(neLng));
    }

    query = applyMapFilters(query);

    const { data } = await query.limit(300);

    const results = (data ?? [])
      .map((r: Row) => ({ ...toMapRestaurant(r), _score: scoreMatch(r.name, r.cuisine, q) }))
      .filter((r) => r._score >= MIN_SCORE)
      .sort((a, b) => b._score - a._score)
      .slice(0, 50)
      .map(({ _score: _, ...r }) => r);

    return Response.json(results);
  }

  // ── Viewport: top 50 by GF score within bounding box ─────────────────────
  if (swLat && swLng && neLat && neLng) {
    let query = supabase
      .from("restaurants")
      .select(SELECT)
      .not("lat", "is", null)
      .not("lng", "is", null)
      .not("score", "is", null)
      .gte("lat", parseFloat(swLat)).lte("lat", parseFloat(neLat))
      .gte("lng", parseFloat(swLng)).lte("lng", parseFloat(neLng))
      .order("score", { ascending: false })
      .limit(50);

    query = applyMapFilters(query);

    const { data } = await query;
    return Response.json((data ?? []).map(toMapRestaurant));
  }

  return Response.json([]);
}
