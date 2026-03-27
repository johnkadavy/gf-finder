import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const city = req.nextUrl.searchParams.get("city")?.trim() ?? "";

  if (q.length < 1) {
    return NextResponse.json([]);
  }

  let query = supabase
    .from("restaurants")
    .select("id, name, city, neighborhood")
    .ilike("name", `%${q}%`)
    .order("name")
    .limit(6);

  if (city) query = query.eq("city", city);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json([], { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
