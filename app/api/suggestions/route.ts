import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createClient } from "@/lib/supabase-server";
import { getCityAccess } from "@/lib/cities";
import { normalizeCuisine } from "@/lib/cuisine";
import { getNycLandingIndex, matchCategory, matchNeighborhoods } from "@/lib/landing-index";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const cityParam = req.nextUrl.searchParams.get("city")?.trim() ?? "";

  if (q.length < 1) {
    return NextResponse.json({ restaurants: [], cuisines: [], neighborhoods: [], categories: [] });
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
    .select("id, name, city, neighborhood, lat, lng, cuisine, google_rating, price_level, address, website_url, score, slug")
    .ilike("name", `%${q}%`);

  // City enforcement: explicit city param > allowed cities filter
  if (cityParam && (cityAccess.isAdmin || cityAccess.allowedCities.includes(cityParam))) {
    restaurantQuery = restaurantQuery.eq("city", cityParam);
  } else if (!cityAccess.isAdmin) {
    restaurantQuery = restaurantQuery.in("city", cityAccess.allowedCities);
  }

  const hasBounds = Boolean(swLat && swLng && neLat && neLng);
  if (hasBounds) {
    // Map search: unchanged alphabetical behavior within the viewport.
    restaurantQuery = restaurantQuery
      .gte("lat", parseFloat(swLat!))
      .lte("lat", parseFloat(neLat!))
      .gte("lng", parseFloat(swLng!))
      .lte("lng", parseFloat(neLng!))
      .order("name")
      .limit(6);
  } else {
    // Homepage search: safest matches first, unscored last.
    restaurantQuery = restaurantQuery
      .order("score", { ascending: false, nullsFirst: false })
      .order("name")
      .limit(5);
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

  // Landing-page suggestions (NYC only — that's where the /gluten-free pages live).
  const wantsLanding = !hasBounds && (!cityParam || cityParam === "New York") &&
    (cityAccess.isAdmin || cityAccess.allowedCities.includes("New York"));

  const [{ data: restaurantData, error }, { data: cuisineData }, landingIndex] = await Promise.all([
    restaurantQuery,
    cuisineQuery,
    wantsLanding ? getNycLandingIndex() : Promise.resolve(null),
  ]);

  if (error) {
    return NextResponse.json({ restaurants: [], cuisines: [], neighborhoods: [], categories: [] }, { status: 500 });
  }

  const neighborhoods = landingIndex ? matchNeighborhoods(q, landingIndex.neighborhoods) : [];
  const category = landingIndex ? matchCategory(q, landingIndex.categories) : null;
  const categories = category ? [{ label: category.label, href: category.href, count: category.count, emoji: category.emoji }] : [];

  // Normalize to canonical categories, deduplicate, filter "Other", sort
  const cuisines = [...new Set(
    (cuisineData ?? [])
      .map((r: { cuisine: string }) => r.cuisine)
      .filter(Boolean)
      .map((c: string) => normalizeCuisine(c))
      .filter((c: string) => c !== "Other")
  )].sort().slice(0, 4) as string[];

  return NextResponse.json({ restaurants: restaurantData ?? [], cuisines, neighborhoods, categories });
}
