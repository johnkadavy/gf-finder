import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const city = req.nextUrl.searchParams.get("city")?.trim() ?? "";

  if (q.length < 1) {
    return NextResponse.json([]);
  }

  const swLat = req.nextUrl.searchParams.get("swLat");
  const swLng = req.nextUrl.searchParams.get("swLng");
  const neLat = req.nextUrl.searchParams.get("neLat");
  const neLng = req.nextUrl.searchParams.get("neLng");

  let query = supabase
    .from("restaurants")
    .select("id, name, city, neighborhood")
    .ilike("name", `%${q}%`)
    .order("name")
    .limit(6);

  if (city) query = query.eq("city", city);

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
