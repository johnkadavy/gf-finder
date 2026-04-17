import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createClient } from "@/lib/supabase-server";
import { getCityAccess } from "@/lib/cities";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const cityParam = req.nextUrl.searchParams.get("city")?.trim() ?? "";

  if (q.length < 1) {
    return NextResponse.json([]);
  }

  // Resolve city access
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  const cityAccess = await getCityAccess(user?.id, serverClient);

  const swLat = req.nextUrl.searchParams.get("swLat");
  const swLng = req.nextUrl.searchParams.get("swLng");
  const neLat = req.nextUrl.searchParams.get("neLat");
  const neLng = req.nextUrl.searchParams.get("neLng");

  let query = supabase
    .from("restaurants")
    .select("id, name, city, neighborhood, lat, lng, cuisine, google_rating, price_level, address, website_url, score")
    .ilike("name", `%${q}%`)
    .order("name")
    .limit(6);

  // City enforcement: explicit city param > allowed cities filter
  if (cityParam && (cityAccess.isAdmin || cityAccess.allowedCities.includes(cityParam))) {
    query = query.eq("city", cityParam);
  } else if (!cityAccess.isAdmin) {
    query = query.in("city", cityAccess.allowedCities);
  }

  if (swLat && swLng && neLat && neLng) {
    query = query
      .gte("lat", parseFloat(swLat))
      .lte("lat", parseFloat(neLat))
      .gte("lng", parseFloat(swLng))
      .lte("lng", parseFloat(neLng));
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json([], { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
