import { createClient } from "@/lib/supabase-server";
import { MapView } from "./MapView";

export default async function MapPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let savedIds: number[] = [];
  if (user) {
    const { data } = await supabase
      .from("saved_restaurants")
      .select("restaurant_id")
      .eq("user_id", user.id);
    savedIds = (data ?? []).map((r) => r.restaurant_id);
  }

  return <MapView initialSavedIds={savedIds} />;
}
