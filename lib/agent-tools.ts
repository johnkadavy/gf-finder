import { supabase } from "./supabase";
import { getScoreLabel } from "./score";

// ─── Input types ────────────────────────────────────────────────────────────

export type SearchRestaurantsInput = {
  city?: string;
  neighborhood?: string;
  cuisine?: string;
  place_type?: string;
  gf_food_category?: string;
  min_score?: number;
  has_dedicated_fryer?: boolean;
  has_gf_labels?: boolean;
  limit?: number;
};

export type GetRestaurantDetailsInput = {
  restaurant_name: string;
  city?: string;
};

export type GetNeighborhoodOverviewInput = {
  neighborhood: string;
  city: string;
};

// ─── Output types ────────────────────────────────────────────────────────────

export type RestaurantSummary = {
  id: number;
  name: string;
  neighborhood: string | null;
  city: string;
  cuisine: string | null;
  score: number | null;
  score_label: string;
  summary: string | null;
  place_type: string[] | null;
  gf_food_categories: string[] | null;
  has_dedicated_fryer: boolean;
  has_gf_labels: boolean;
  cross_contamination_risk: string | null;
  sick_reports_recent: number;
  url: string;
};

export type RestaurantDetails = RestaurantSummary & {
  website_url: string | null;
  google_maps_url: string | null;
  gf_options_level: string | null;
  staff_knowledge: string | null;
  dedicated_prep_area: boolean;
  recent_sentiment: string | null;
  positive_count: number;
  negative_count: number;
};

export type NeighborhoodOverview = {
  neighborhood: string;
  city: string;
  total_restaurants: number;
  avg_score: number | null;
  top_rated: Array<{ id: number; name: string; score: number; url: string }>;
  dedicated_gf_count: number;
  has_gf_fryer_count: number;
  score_distribution: {
    excellent: number;   // 85+
    great: number;       // 75–84
    good: number;        // 65–74
    caution: number;     // <65
  };
};

// ─── Shared DB row type ──────────────────────────────────────────────────────

type DbRow = {
  id: number;
  name: string;
  city: string;
  neighborhood: string | null;
  region: string | null;
  cuisine: string | null;
  score: number | null;
  place_type: string[] | null;
  gf_food_categories: string[] | null;
  website_url: string | null;
  google_maps_url: string | null;
  dossier: {
    summary?: { short_summary?: string };
    menu?: { gf_labeling?: string; gf_options_level?: string };
    operations?: {
      staff_knowledge?: string;
      cross_contamination_risk?: string;
      dedicated_equipment?: { fryer?: boolean; prep_area?: string };
    };
    reviews?: {
      recent_sentiment?: string;
      positive_count?: number;
      negative_count?: number;
      sick_reports_recent?: number;
    };
  } | null;
};

const DB_SELECT =
  "id, name, city, neighborhood, cuisine, score, place_type, gf_food_categories, website_url, google_maps_url, dossier";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toSummary(r: DbRow): RestaurantSummary {
  const { label } = getScoreLabel(r.score);
  return {
    id: r.id,
    name: r.name,
    neighborhood: r.neighborhood,
    city: r.city,
    cuisine: r.cuisine,
    score: r.score,
    score_label: label,
    summary: r.dossier?.summary?.short_summary ?? null,
    place_type: r.place_type,
    gf_food_categories: r.gf_food_categories,
    has_dedicated_fryer: r.dossier?.operations?.dedicated_equipment?.fryer === true,
    has_gf_labels: r.dossier?.menu?.gf_labeling === "clear",
    cross_contamination_risk: r.dossier?.operations?.cross_contamination_risk ?? null,
    sick_reports_recent: r.dossier?.reviews?.sick_reports_recent ?? 0,
    url: `/restaurant/${r.id}`,
  };
}

function toDetails(r: DbRow): RestaurantDetails {
  return {
    ...toSummary(r),
    website_url: r.website_url,
    google_maps_url: r.google_maps_url,
    gf_options_level: r.dossier?.menu?.gf_options_level ?? null,
    staff_knowledge: r.dossier?.operations?.staff_knowledge ?? null,
    dedicated_prep_area:
      r.dossier?.operations?.dedicated_equipment?.prep_area === "yes" ||
      r.dossier?.operations?.dedicated_equipment?.prep_area === "dedicated",
    recent_sentiment: r.dossier?.reviews?.recent_sentiment ?? null,
    positive_count: r.dossier?.reviews?.positive_count ?? 0,
    negative_count: r.dossier?.reviews?.negative_count ?? 0,
  };
}

// ─── Tool 1: search_restaurants ──────────────────────────────────────────────

export async function searchRestaurants(
  input: SearchRestaurantsInput,
): Promise<{ results: RestaurantSummary[]; total_found: number }> {
  const limit = Math.min(input.limit ?? 5, 10);

  let q = supabase
    .from("restaurants")
    .select(DB_SELECT, { count: "exact" })
    .not("score", "is", null)
    .order("score", { ascending: false })
    .limit(limit);

  if (input.city)          q = q.ilike("city", input.city);
  if (input.neighborhood)  q = q.ilike("neighborhood", `%${input.neighborhood}%`);
  if (input.cuisine)       q = q.ilike("cuisine", `%${input.cuisine}%`);
  if (input.place_type)    q = q.contains("place_type", [input.place_type]);
  if (input.gf_food_category) q = q.contains("gf_food_categories", [input.gf_food_category]);
  if (input.min_score)     q = q.gte("score", input.min_score);
  if (input.has_dedicated_fryer)
    q = q.eq("dossier->operations->dedicated_equipment->>fryer", "true");
  if (input.has_gf_labels)
    q = q.eq("dossier->menu->>gf_labeling", "clear");

  const { data, count } = await q;
  const rows = (data ?? []) as DbRow[];

  return {
    results: rows.map(toSummary),
    total_found: count ?? 0,
  };
}

// ─── Tool 2: get_restaurant_details ─────────────────────────────────────────

export async function getRestaurantDetails(
  input: GetRestaurantDetailsInput,
): Promise<{ restaurant: RestaurantDetails | null; message: string }> {
  let q = supabase
    .from("restaurants")
    .select(DB_SELECT)
    .ilike("name", `%${input.restaurant_name}%`)
    .order("score", { ascending: false })
    .limit(1);

  if (input.city) q = q.ilike("city", input.city);

  const { data } = await q;
  const rows = (data ?? []) as DbRow[];

  if (rows.length === 0) {
    return {
      restaurant: null,
      message: `No restaurant named "${input.restaurant_name}" found in the CleanPlate database.`,
    };
  }

  return {
    restaurant: toDetails(rows[0]),
    message: "Found restaurant.",
  };
}

// ─── Tool 3: get_neighborhood_overview ──────────────────────────────────────

export async function getNeighborhoodOverview(
  input: GetNeighborhoodOverviewInput,
): Promise<NeighborhoodOverview> {
  const { data } = await supabase
    .from("restaurants")
    .select(DB_SELECT)
    .ilike("neighborhood", input.neighborhood)
    .ilike("city", input.city)
    .not("score", "is", null)
    .order("score", { ascending: false });

  const rows = (data ?? []) as DbRow[];

  const scores = rows.map((r) => r.score as number);
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;

  const dist = { excellent: 0, great: 0, good: 0, caution: 0 };
  for (const s of scores) {
    if (s >= 85)      dist.excellent++;
    else if (s >= 75) dist.great++;
    else if (s >= 65) dist.good++;
    else              dist.caution++;
  }

  return {
    neighborhood: input.neighborhood,
    city: input.city,
    total_restaurants: rows.length,
    avg_score: avgScore,
    top_rated: rows.slice(0, 5).map((r) => ({
      id: r.id,
      name: r.name,
      score: r.score as number,
      url: `/restaurant/${r.id}`,
    })),
    dedicated_gf_count: rows.filter(
      (r) => r.dossier?.operations?.cross_contamination_risk === "low",
    ).length,
    has_gf_fryer_count: rows.filter(
      (r) => r.dossier?.operations?.dedicated_equipment?.fryer === true,
    ).length,
    score_distribution: dist,
  };
}
