import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import { getGaugeColor, getScoreLabel } from "@/lib/score";
import { SharedMapView } from "./SharedMapView";
import type { MapRestaurant } from "../types";

export default async function SharedMapPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const sessionClient = await createClient();
  const { data: { user } } = await sessionClient.auth.getUser();

  const { data: profile } = await supabaseServer
    .from("profiles")
    .select("user_id")
    .eq("share_token", token)
    .single();

  if (!profile) notFound();

  const { data: saves } = await supabaseServer
    .from("saved_restaurants")
    .select("restaurant_id")
    .eq("user_id", profile.user_id)
    .order("created_at", { ascending: false });

  const ids = (saves ?? []).map((s) => s.restaurant_id);

  if (ids.length === 0) {
    return <SharedMapView restaurants={[]} isLoggedIn={!!user} />;
  }

  const { data: rows } = await supabaseServer
    .from("restaurants")
    .select(
      "id, name, city, neighborhood, lat, lng, cuisine, google_rating, price_level, address, website_url, google_maps_url, score, dossier"
    )
    .in("id", ids);

  const restaurants: (MapRestaurant & { google_maps_url: string | null })[] = (
    rows ?? []
  )
    .filter((r) => r.lat != null && r.lng != null)
    .map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city ?? "",
      neighborhood: r.neighborhood ?? null,
      lat: r.lat,
      lng: r.lng,
      cuisine: r.cuisine ?? null,
      google_rating: r.google_rating ?? null,
      price_level: r.price_level ?? null,
      address: r.address ?? null,
      website: r.website_url ?? null,
      google_maps_url: r.google_maps_url ?? null,
      score: r.score ?? null,
      color: getGaugeColor(r.score ?? null),
      scoreLabel: getScoreLabel(r.score ?? null).label,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      periods: ((r.dossier as any)?.hours?.periods ?? null) as MapRestaurant["periods"],
    }));

  return <SharedMapView restaurants={restaurants} isLoggedIn={!!user} />;
}
