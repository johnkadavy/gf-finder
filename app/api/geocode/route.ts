import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ features: [] });

  // Token can come from client (NEXT_PUBLIC_ is baked into client bundle at
  // build time but may not be set as a runtime server env var on Vercel).
  const token =
    req.nextUrl.searchParams.get("token") ||
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  if (!token) return NextResponse.json({ features: [] });

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
    `?access_token=${token}&limit=1`;

  const res = await fetch(url);
  if (!res.ok) return NextResponse.json({ features: [] });

  const data = await res.json();
  return NextResponse.json(data);
}
