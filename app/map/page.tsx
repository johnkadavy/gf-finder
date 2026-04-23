import { createClient } from "@/lib/supabase-server";
import { MapViewLoader } from "./MapViewLoader";

export default async function MapPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const savedIds = user
    ? await supabase
        .from("saved_restaurants")
        .select("restaurant_id")
        .eq("user_id", user.id)
        .then(({ data }) => (data ?? []).map((r) => r.restaurant_id))
    : [];

  return <MapViewLoader initialSavedIds={savedIds} isPreview={!user} />;
}
