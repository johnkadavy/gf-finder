import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createClient } from "@/lib/supabase-server";
import { getCityAccess } from "@/lib/cities";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const cityParam = req.nextUrl.searchParams.get("city")?.trim() ?? "";

  if (q.length < 1) {
    return NextResponse.json({ restaurants: [], cuisines: [] });
  }

  // Resolve city access
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  const cityAccess = await getCityAccess(user?.id, serverClient);

  const swLat = req.nextUrl.searchParams.get("swLat");
  const swLng = req.nextUrl.searchParams.get("swLng");
  const neLat = req.nextUrl.searchParams.get("neLat");
  const neLng = req.nextUrl.searchParams.get("neLng");

  // ── Restaurant name suggestions ────────────────────────────────────────────
  let restaurantQuery = supabase
    .from("restaurants")
    .select("id, name, city, neighborhood, lat, lng, cuisine, google_rating, price_level, address, website_url, score")
    .ilike("name", `%${q}%`)
    .order("name")
    .limit(6);

  // City enforcement: explicit city param > allowed cities filter
  if (cityParam && (cityAccess.isAdmin || cityAccess.allowedCities.includes(cityParam))) {
    restaurantQuery = restaurantQuery.eq("city", cityParam);
  } else if (!cityAccess.isAdmin) {
    restaurantQuery = restaurantQuery.in("city", cityAccess.allowedCities);
  }

  if (swLat && swLng && neLat && neLng) {
    restaurantQuery = restaurantQuery
      .gte("lat", parseFloat(swLat))
      .lte("lat", parseFloat(neLat))
      .gte("lng", parseFloat(swLng))
      .lte("lng", parseFloat(neLng));
  }

  // ── Cuisine suggestions ────────────────────────────────────────────────────
  let cuisineQuery = supabase
    .from("restaurants")
    .select("cuisine")
    .ilike("cuisine", `%${q}%`)
    .not("cuisine", "is", null)
    .limit(50);

  if (cityParam && (cityAccess.isAdmin || cityAccess.allowedCities.includes(cityParam))) {
    cuisineQuery = cuisineQuery.eq("city", cityParam);
  } else if (!cityAccess.isAdmin) {
    cuisineQuery = cuisineQuery.in("city", cityAccess.allowedCities);
  }

  const [{ data: restaurantData, error }, { data: cuisineData }] = await Promise.all([
    restaurantQuery,
    cuisineQuery,
  ]);

  if (error) {
    return NextResponse.json({ restaurants: [], cuisines: [] }, { status: 500 });
  }

  // Deduplicate cuisines and sort alphabetically
  const cuisines = [...new Set(
    (cuisineData ?? []).map((r: { cuisine: string }) => r.cuisine).filter(Boolean)
  )].sort().slice(0, 4) as string[];

  return NextResponse.json({ restaurants: restaurantData ?? [], cuisines });
}
