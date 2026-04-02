import { supabase } from "@/lib/supabase";
import { calculateScore, getGaugeColor, getScoreLabel, type ScoringDossier, type VerifiedData } from "@/lib/score";
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
  dossier: ScoringDossier | null;
  verified_data: VerifiedData | null;
};

function toMapRestaurant(r: Row): MapRestaurant {
  const score = r.dossier ? calculateScore(r.dossier, r.verified_data ?? undefined) : null;
  return {
    id: r.id, name: r.name, city: r.city, neighborhood: r.neighborhood,
    lat: r.lat, lng: r.lng, cuisine: r.cuisine, google_rating: r.google_rating,
    price_level: r.price_level, address: r.address, website: r.website_url,
    score, color: getGaugeColor(score), scoreLabel: getScoreLabel(score).label,
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

const SELECT = "id, name, city, neighborhood, lat, lng, cuisine, google_rating, price_level, address, website_url, dossier, verified_data";
const MIN_SCORE = 0.25;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q     = searchParams.get("q")?.trim() ?? "";
  const swLat = searchParams.get("swLat");
  const swLng = searchParams.get("swLng");
  const neLat = searchParams.get("neLat");
  const neLng = searchParams.get("neLng");

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

    const { data } = await supabase
      .from("restaurants")
      .select(SELECT)
      .not("lat", "is", null)
      .not("lng", "is", null)
      .or(orParts.join(","))
      .limit(300);

    const results = (data ?? [])
      .map((r: Row) => ({ ...toMapRestaurant(r), _score: scoreMatch(r.name, r.cuisine, q) }))
      .filter((r) => r._score >= MIN_SCORE)
      .sort((a, b) => b._score - a._score)
      .map(({ _score: _, ...r }) => r);

    return Response.json(results);
  }

  // ── Viewport: top 50 by GF score within bounding box ─────────────────────
  if (swLat && swLng && neLat && neLng) {
    const { data, error } = await supabase
      .from("restaurants")
      .select(SELECT)
      .not("lat", "is", null)
      .not("lng", "is", null)
      .not("dossier", "is", null)
      .gte("lat", parseFloat(swLat)).lte("lat", parseFloat(neLat))
      .gte("lng", parseFloat(swLng)).lte("lng", parseFloat(neLng))
      .limit(300);

    const restaurants = (data ?? []).map(toMapRestaurant);
    restaurants.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return Response.json(restaurants.slice(0, 50));
  }

  return Response.json([]);
}
