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
  dossier: ScoringDossier | null;
  verified_data: VerifiedData | null;
};

function toMapRestaurant(r: Row): MapRestaurant {
  const score = r.dossier ? calculateScore(r.dossier, r.verified_data ?? undefined) : null;
  return {
    id: r.id,
    name: r.name,
    city: r.city,
    neighborhood: r.neighborhood,
    lat: r.lat,
    lng: r.lng,
    cuisine: r.cuisine,
    google_rating: r.google_rating,
    price_level: r.price_level,
    address: r.address,
    score,
    color: getGaugeColor(score),
    scoreLabel: getScoreLabel(score).label,
  };
}

const SELECT = "id, name, city, neighborhood, lat, lng, cuisine, google_rating, price_level, address, dossier, verified_data";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q      = searchParams.get("q")?.trim() ?? "";
  const swLat  = searchParams.get("swLat");
  const swLng  = searchParams.get("swLng");
  const neLat  = searchParams.get("neLat");
  const neLng  = searchParams.get("neLng");

  // ── Text search ──────────────────────────────────────────────────────────
  if (q) {
    const { data } = await supabase
      .from("restaurants")
      .select(SELECT)
      .not("lat", "is", null)
      .not("lng", "is", null)
      .ilike("name", `%${q}%`)
      .limit(300);

    return Response.json((data ?? []).map(toMapRestaurant));
  }

  // ── Viewport: top 50 by score within bounding box ────────────────────────
  if (swLat && swLng && neLat && neLng) {
    const { data } = await supabase
      .from("restaurants")
      .select(SELECT)
      .not("lat", "is", null)
      .not("lng", "is", null)
      .not("dossier", "is", null)           // only scored restaurants
      .gte("lat", parseFloat(swLat))
      .lte("lat", parseFloat(neLat))
      .gte("lng", parseFloat(swLng))
      .lte("lng", parseFloat(neLng))
      .limit(300);

    const restaurants = (data ?? []).map(toMapRestaurant);
    restaurants.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return Response.json(restaurants.slice(0, 50));
  }

  return Response.json([]);
}
