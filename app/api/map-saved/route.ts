import { createClient } from "@/lib/supabase-server";
import { supabase } from "@/lib/supabase";
import { getGaugeColor, getScoreLabel } from "@/lib/score";
import type { MapRestaurant } from "@/app/map/types";

const SELECT = "id, name, city, neighborhood, lat, lng, cuisine, google_rating, price_level, address, website_url, score, opening_hours";

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
  score: number | null;
  opening_hours: { periods?: { open: { day: number; hour: number; minute: number }; close: { day: number; hour: number; minute: number } }[] } | null;
};

export async function GET() {
  const serverSupabase = await createClient();
  const { data: { user } } = await serverSupabase.auth.getUser();
  if (!user) return Response.json([]);

  const { data: saves } = await serverSupabase
    .from("saved_restaurants")
    .select("restaurant_id")
    .eq("user_id", user.id);

  const ids = (saves ?? []).map((s) => s.restaurant_id);
  if (ids.length === 0) return Response.json([]);

  const { data } = await supabase
    .from("restaurants")
    .select(SELECT)
    .in("id", ids)
    .not("lat", "is", null)
    .not("lng", "is", null)
    .limit(50);

  const results: MapRestaurant[] = (data ?? []).map((r: Row) => ({
    id: r.id, name: r.name, city: r.city, neighborhood: r.neighborhood,
    lat: r.lat, lng: r.lng, cuisine: r.cuisine, google_rating: r.google_rating,
    price_level: r.price_level, address: r.address, website: r.website_url,
    score: r.score, color: getGaugeColor(r.score), scoreLabel: getScoreLabel(r.score).label,
    periods: r.opening_hours?.periods ?? null,
  }));

  return Response.json(results);
}
