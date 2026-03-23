import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

interface Place {
  id: string;
  displayName: { text: string };
  formattedAddress: string;
  location: { latitude: number; longitude: number };
  websiteUri?: string;
  nationalPhoneNumber?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { neighborhood, city } = body;

    if (!neighborhood || !city) {
      return NextResponse.json(
        { error: "neighborhood and city are required" },
        { status: 400 }
      );
    }

    const placesResponse = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY!,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri,places.nationalPhoneNumber",
        },
        body: JSON.stringify({
          textQuery: `restaurants in ${neighborhood}, ${city}`,
          maxResultCount: 20,
          includedType: "restaurant",
        }),
      }
    );

    if (!placesResponse.ok) {
      const err = await placesResponse.text();
      console.error("Places API error:", err);
      return NextResponse.json(
        { error: "Google Places API request failed" },
        { status: 500 }
      );
    }

    const placesData = await placesResponse.json();
    const places: Place[] = placesData.places ?? [];

    if (places.length === 0) {
      return NextResponse.json({ message: "No restaurants found", count: 0 });
    }

    const rows = places.map((place) => ({
      google_place_id: place.id,
      name: place.displayName.text,
      address: place.formattedAddress,
      lat: place.location.latitude,
      lng: place.location.longitude,
      website_url: place.websiteUri ?? null,
      phone: place.nationalPhoneNumber ?? null,
      city,
      neighborhood,
      slug: [place.displayName.text, city, neighborhood]
        .join("-")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
      ingested_at: new Date().toISOString(),
    }));

    const { error } = await supabaseServer
      .from("restaurants")
      .upsert(rows, { onConflict: "google_place_id" });

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: "Failed to save restaurants" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: `Ingested ${rows.length} restaurants`,
      count: rows.length,
      restaurants: rows.map((r) => ({ name: r.name, website: r.website_url })),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to ingest restaurants" },
      { status: 500 }
    );
  }
}
