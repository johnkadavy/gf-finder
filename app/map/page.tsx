import { supabase } from "@/lib/supabase";
import { calculateScore, getGaugeColor, getScoreLabel, type ScoringDossier, type VerifiedData } from "@/lib/score";
import { MapView } from "./MapView";

type Restaurant = {
  id: number;
  name: string;
  city: string;
  neighborhood: string | null;
  lat: number;
  lng: number;
  dossier: ScoringDossier | null;
  verified_data: VerifiedData | null;
};

export type MapRestaurant = {
  id: number;
  name: string;
  city: string;
  neighborhood: string | null;
  lat: number;
  lng: number;
  score: number | null;
  color: string;
  scoreLabel: string;
};

export default async function MapPage() {
  const { data } = await supabase
    .from("restaurants")
    .select("id, name, city, neighborhood, lat, lng, dossier, verified_data")
    .not("lat", "is", null)
    .not("lng", "is", null);

  const restaurants: MapRestaurant[] = (data ?? []).map((r: Restaurant) => {
    const score = r.dossier ? calculateScore(r.dossier, r.verified_data ?? undefined) : null;
    const color = getGaugeColor(score);
    const { label } = getScoreLabel(score);
    return {
      id: r.id,
      name: r.name,
      city: r.city,
      neighborhood: r.neighborhood,
      lat: r.lat,
      lng: r.lng,
      score,
      color,
      scoreLabel: label,
    };
  });

  return <MapView restaurants={restaurants} />;
}
