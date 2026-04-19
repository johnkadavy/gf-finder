import { createClient } from "@/lib/supabase-server";
import { supabaseServer } from "@/lib/supabase-admin";
import { calculateScore, type VerifiedData } from "@/lib/score";
import { lookupNycNeighborhood } from "@/lib/neighborhood-lookup";

export const maxDuration = 60;

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlaceDetails {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  addressComponents?: { longText: string; shortText: string; types: string[] }[];
  location?: { latitude: number; longitude: number };
  websiteUri?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  rating?: number;
  priceLevel?: string;
  types?: string[];
  regularOpeningHours?: {
    periods?: unknown[];
    weekdayDescriptions?: string[];
  };
}

interface AirtableAIField {
  state: string;
  value: string | null;
  isStale: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRICE_LEVEL_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
  "location",
  "websiteUri",
  "googleMapsUri",
  "nationalPhoneNumber",
  "rating",
  "priceLevel",
  "types",
  "regularOpeningHours",
].join(",");

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Extracts a Google Place ID from a Google Maps URL.
 * Returns null if the URL only contains a CID (hex format) — those need
 * a text-search fallback since they are not valid Place API identifiers.
 */
function extractPlaceId(url: string): string | null {
  try {
    const parsed = new URL(url);

    // query_place_id param
    const qpi = parsed.searchParams.get("query_place_id");
    if (qpi && isValidPlaceId(qpi)) return qpi;

    // !1s<id>! pattern — modern Maps URLs embed a hex CID here, not a Place ID
    const match = url.match(/!1s([^!]+)/);
    if (match?.[1]) {
      const candidate = decodeURIComponent(match[1]);
      if (isValidPlaceId(candidate)) return candidate;
    }

    return null;
  } catch {
    return null;
  }
}

/** Place IDs are alphanumeric (often start with ChIJ). CIDs look like 0x…:0x… */
function isValidPlaceId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id) && id.length > 10 && !id.startsWith("0x");
}

/** Extracts the restaurant name from a /maps/place/<name>/ URL. */
function extractNameFromUrl(url: string): string | null {
  const match = url.match(/\/maps\/place\/([^/@]+)/);
  if (!match) return null;
  return decodeURIComponent(match[1].replace(/\+/g, " "));
}

/** Extracts lat/lng from the @lat,lng,zoom portion of a Maps URL. */
function extractCoordsFromUrl(url: string): { lat: number; lng: number } | null {
  const match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!match) return null;
  return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
}

/**
 * Falls back to Places Text Search when the URL only contains a CID.
 * Uses the name + coordinates extracted from the URL to find the real Place ID.
 */
async function searchPlaceIdByText(
  name: string,
  coords: { lat: number; lng: number },
): Promise<string | null> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY!,
      "X-Goog-FieldMask": "places.id,places.displayName",
    },
    body: JSON.stringify({
      textQuery: name,
      maxResultCount: 1,
      locationBias: {
        circle: {
          center: { latitude: coords.lat, longitude: coords.lng },
          radius: 300,
        },
      },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.places?.[0]?.id ?? null;
}

/** Follows redirects (e.g. maps.app.goo.gl) and returns the final URL. */
async function resolveUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, { redirect: "follow" });
    return res.url || url;
  } catch {
    return url;
  }
}

async function fetchPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY!,
      "X-Goog-FieldMask": DETAILS_FIELD_MASK,
    },
  });
  if (!res.ok) return null;
  return res.json();
}

/** Extracts city from Google Places addressComponents (locality type). */
function extractCity(details: PlaceDetails): string {
  const components = details.addressComponents ?? [];
  const locality = components.find((c) => c.types.includes("locality"));
  return locality?.longText ?? "";
}

/** Extracts neighborhood from Google Places addressComponents. */
function extractNeighborhood(details: PlaceDetails): string | null {
  const components = details.addressComponents ?? [];
  const hood = components.find((c) => c.types.includes("neighborhood"));
  return hood?.longText ?? null;
}

function buildSupabaseRow(
  placeId: string,
  details: PlaceDetails,
  cityOverride: string,
  neighborhoodOverride: string | null,
) {
  const city = cityOverride.trim() || extractCity(details);
  // Priority: manual form input → Google addressComponents → NTA polygon lookup
  const neighborhood =
    neighborhoodOverride ??
    extractNeighborhood(details) ??
    (details.location
      ? lookupNycNeighborhood(details.location.latitude, details.location.longitude)
      : null);
  const exclude = new Set(["establishment", "point_of_interest", "food", "restaurant", "store"]);
  return {
    google_place_id: placeId,
    name: details.displayName?.text ?? "Unknown",
    address: details.formattedAddress ?? null,
    lat: details.location?.latitude ?? null,
    lng: details.location?.longitude ?? null,
    website_url: details.websiteUri ?? null,
    google_maps_url: details.googleMapsUri ?? null,
    phone: details.nationalPhoneNumber ?? null,
    google_rating: details.rating ?? null,
    price_level: details.priceLevel ? (PRICE_LEVEL_MAP[details.priceLevel] ?? null) : null,
    cuisine_types: details.types?.filter((t) => !exclude.has(t)) ?? null,
    opening_hours: details.regularOpeningHours ?? null,
    city,
    neighborhood,
    source: "manual_add",
    slug: [details.displayName?.text ?? "", city, placeId.slice(-6)]
      .join("-")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, ""),
    ingested_at: new Date().toISOString(),
  };
}

// ── Airtable helpers ──────────────────────────────────────────────────────────

const AT_BASE = () => process.env.AIRTABLE_BASE_ID!;
const AT_TABLE = () => encodeURIComponent(process.env.AIRTABLE_TABLE_NAME!);
const AT_HEADERS = () => ({
  Authorization: `Bearer ${process.env.AIRTABLE_API_KEY!}`,
  "Content-Type": "application/json",
});

/** Returns the existing Airtable record ID for a place, or null if not found. */
export async function findAirtableRecord(placeId: string): Promise<string | null> {
  const url = new URL(`https://api.airtable.com/v0/${AT_BASE()}/${AT_TABLE()}`);
  url.searchParams.set("filterByFormula", `({google_place_id}='${placeId}')`);
  url.searchParams.append("fields[]", "google_place_id");

  const res = await fetch(url.toString(), { headers: AT_HEADERS() });
  if (!res.ok) return null;
  const data = await res.json();
  return data.records?.[0]?.id ?? null;
}

/** Creates a new Airtable record and returns its record ID. */
async function createAirtableRecord(
  row: ReturnType<typeof buildSupabaseRow>,
): Promise<string> {
  const res = await fetch(
    `https://api.airtable.com/v0/${AT_BASE()}/${AT_TABLE()}`,
    {
      method: "POST",
      headers: AT_HEADERS(),
      body: JSON.stringify({
        records: [
          {
            fields: {
              name: row.name,
              google_place_id: row.google_place_id,
              phone: row.phone ?? undefined,
              website: row.website_url ?? undefined,
              lat: row.lat != null ? String(row.lat) : undefined,
              lng: row.lng != null ? String(row.lng) : undefined,
              neighborhood: row.neighborhood ?? undefined,
              city: row.city,
              address: row.address ?? undefined,
            },
          },
        ],
        typecast: true,
      }),
    },
  );
  if (!res.ok) throw new Error(`Airtable create error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.records[0].id;
}

/** Fetches a single Airtable record by its record ID. */
export async function fetchAirtableRecord(
  recordId: string,
): Promise<Record<string, string | AirtableAIField> | null> {
  const res = await fetch(
    `https://api.airtable.com/v0/${AT_BASE()}/${AT_TABLE()}/${recordId}`,
    { headers: AT_HEADERS() },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.fields ?? null;
}

function getAIFieldValue(field: string | AirtableAIField | undefined): string | null {
  if (!field) return null;
  if (typeof field === "string") return field;
  return field.state === "generated" ? (field.value ?? null) : null;
}

export function isEnriched(fields: Record<string, string | AirtableAIField>): boolean {
  const dossier = fields["JSON dossier"];
  if (!dossier || typeof dossier === "string") return !!dossier;
  return dossier.state === "generated" && dossier.value != null;
}

function parseCsv(field: string | AirtableAIField | undefined): string[] | null {
  const raw = getAIFieldValue(field);
  if (!raw) return null;
  const vals = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return vals.length > 0 ? vals : null;
}

// ── Shared sync helper ────────────────────────────────────────────────────────

/**
 * Pulls the enriched dossier from an Airtable record and writes it to Supabase.
 * Returns the score on success, or throws on error.
 * Used by both the main add flow and the retry endpoint.
 */
export async function syncAirtableRecordToSupabase(
  placeId: string,
  fields: Record<string, string | AirtableAIField>,
): Promise<number | null> {
  const dossierText = getAIFieldValue(fields["JSON dossier"]);
  if (!dossierText) throw new Error("Dossier field is empty.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dossier: any;
  try {
    dossier = JSON.parse(dossierText);
  } catch {
    throw new Error("Dossier JSON is invalid.");
  }

  const sickText = getAIFieldValue(fields["Sick reports JSON"]);
  if (sickText) {
    try {
      const sickData = JSON.parse(sickText);
      dossier.reviews = {
        ...dossier.reviews,
        sick_reports_recent: sickData.sick_reports_recent ?? 0,
        sick_reports_details: sickData.sick_reports_details ?? [],
      };
    } catch { /* skip */ }
  }

  const cuisine = dossier?.restaurant?.cuisine ?? null;
  const placeTypes = parseCsv(fields["place_type"]);
  const gfFoodCategories = parseCsv(fields["gf_food_categories"]);

  const { error: syncError } = await supabaseServer
    .from("restaurants")
    .update({
      dossier,
      enriched_at: new Date().toISOString(),
      ...(cuisine ? { cuisine } : {}),
      ...(placeTypes ? { place_type: placeTypes } : {}),
      ...(gfFoodCategories ? { gf_food_categories: gfFoodCategories } : {}),
    })
    .eq("google_place_id", placeId);

  if (syncError) throw new Error(syncError.message);

  const { data: forScore } = await supabaseServer
    .from("restaurants")
    .select("id, dossier, verified_data")
    .eq("google_place_id", placeId)
    .single();

  if (!forScore) return null;

  const score = calculateScore(forScore.dossier, forScore.verified_data as VerifiedData | undefined);
  if (score !== null) {
    await supabaseServer.from("restaurants").update({ score }).eq("id", forScore.id);
  }
  return score;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // Auth + admin check
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: profile } = await serverClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .single();

  if (!profile?.is_admin) return new Response("Forbidden", { status: 403 });

  const { url, city = "", neighborhood = "" } = await req.json() as {
    url: string;
    city?: string;
    neighborhood?: string;
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: object) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      }

      try {
        // ── Step 1: Resolve URL + extract place ID ───────────────────────────
        send({ step: "parse_url", status: "running" });

        const resolved = url.includes("goo.gl") || url.includes("maps.app")
          ? await resolveUrl(url)
          : url;

        let placeId = extractPlaceId(resolved);

        // Fallback: modern Maps URLs embed a hex CID, not a Place ID.
        // Use name + coordinates from the URL to text-search for the real ID.
        if (!placeId) {
          const name = extractNameFromUrl(resolved);
          const coords = extractCoordsFromUrl(resolved);
          if (name && coords) {
            placeId = await searchPlaceIdByText(name, coords);
          }
        }

        if (!placeId) {
          send({ step: "parse_url", status: "error", message: "Could not resolve a Place ID from this URL. Try sharing directly from the Google Maps app." });
          return;
        }
        send({ step: "parse_url", status: "done", placeId });

        // ── Step 2: Check Supabase for duplicate ─────────────────────────────
        send({ step: "check_db", status: "running" });

        const { data: existing } = await supabaseServer
          .from("restaurants")
          .select("id, name")
          .eq("google_place_id", placeId)
          .maybeSingle();

        if (existing) {
          send({ step: "check_db", status: "duplicate", name: existing.name, id: existing.id });
          return;
        }
        send({ step: "check_db", status: "done" });

        if (req.signal.aborted) return;

        // ── Step 3: Fetch from Google Places ─────────────────────────────────
        send({ step: "google_places", status: "running" });

        const details = await fetchPlaceDetails(placeId);
        if (!details) {
          send({ step: "google_places", status: "error", message: "Google Places API returned no data for this place ID." });
          return;
        }
        send({ step: "google_places", status: "done", name: details.displayName?.text ?? "Unknown" });

        if (req.signal.aborted) return;

        // ── Step 4: Upsert to Supabase ────────────────────────────────────────
        send({ step: "supabase", status: "running" });

        const row = buildSupabaseRow(placeId, details, city, neighborhood.trim() || null);
        const { data: inserted, error: upsertError } = await supabaseServer
          .from("restaurants")
          .upsert(row, { onConflict: "google_place_id" })
          .select("id")
          .single();

        if (upsertError || !inserted) {
          send({ step: "supabase", status: "error", message: upsertError?.message ?? "Upsert returned no row" });
          return;
        }
        send({ step: "supabase", status: "done", id: inserted.id });

        if (req.signal.aborted) return;

        // ── Step 5: Add to Airtable (skip if already there) ──────────────────
        send({ step: "airtable", status: "running" });

        let airtableRecordId = await findAirtableRecord(placeId);
        let alreadyInAirtable = false;

        if (airtableRecordId) {
          alreadyInAirtable = true;
        } else {
          airtableRecordId = await createAirtableRecord(row);
        }
        send({ step: "airtable", status: "done", recordId: airtableRecordId, alreadyExisted: alreadyInAirtable });

        if (req.signal.aborted) return;

        // ── Step 6: Poll Airtable for enrichment (4 × 15s = 60s) ─────────────
        const MAX_ATTEMPTS = 4;
        let enriched = false;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          send({ step: "enrichment", status: "pending", attempt, max: MAX_ATTEMPTS });

          await sleep(15_000);
          if (req.signal.aborted) return;

          const fields = await fetchAirtableRecord(airtableRecordId);
          if (fields && isEnriched(fields)) {
            enriched = true;
            send({ step: "enrichment", status: "done", attempt });
            break;
          }
        }

        if (!enriched) {
          send({ step: "enrichment", status: "timeout" });
          return;
        }

        if (req.signal.aborted) return;

        // ── Step 7: Sync enriched data back to Supabase ───────────────────────
        send({ step: "sync", status: "running" });

        const syncFields = await fetchAirtableRecord(airtableRecordId);
        if (!syncFields) {
          send({ step: "sync", status: "error", message: "Could not re-fetch Airtable record for sync." });
          return;
        }

        let score: number | null = null;
        try {
          score = await syncAirtableRecordToSupabase(placeId, syncFields);
        } catch (err) {
          send({ step: "sync", status: "error", message: err instanceof Error ? err.message : "Sync failed." });
          return;
        }

        send({ step: "sync", status: "done", score });
        send({ step: "complete", name: details.displayName?.text ?? "Restaurant", id: inserted.id, score });

      } catch (err) {
        send({ step: "error", message: err instanceof Error ? err.message : "Unexpected error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
