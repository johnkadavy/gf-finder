import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase-server";

const MapView = dynamic(() => import("./MapView").then((m) => ({ default: m.MapView })), {
  ssr: false,
});

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

  return <MapView initialSavedIds={savedIds} isPreview={!user} />;
}
