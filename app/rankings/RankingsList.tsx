import { supabase } from "@/lib/supabase";
import type { ScoringDossier } from "@/lib/score";
import { normalizeCuisine } from "@/lib/cuisine";
import { rankingsUrl, type Filters, EXPERIENCE_OPTIONS } from "./utils";
import { RankedList } from "@/app/components/RankedList";

const DEFAULT_LIMIT = 25;

type Dossier = ScoringDossier & {
  summary?: { short_summary?: string };
};

type Restaurant = {
  id: number;
  name: string;
  display_name: string | null;
  city: string;
  neighborhood: string | null;
  region: string | null;
  slug: string | null;
  website_url: string | null;
  google_maps_url: string | null;
  score: number;
  dossier: Dossier | null;
  source: string | null;
  ingested_at: string | null;
};

type Props = {
  filters: Filters;
  isAdmin: boolean;
  allowedCities: string[];
  rawCuisines: string[];
};

export async function RankingsList({ filters, isAdmin, allowedCities, rawCuisines }: Props) {
  const minScore = EXPERIENCE_OPTIONS.find((o) => o.value === filters.experience)?.minScore ?? 0;

  let query = supabase
    .from("restaurants")
    .select("id, name, display_name, city, neighborhood, region, website_url, google_maps_url, score, slug, dossier, source, ingested_at", { count: "exact" })
    .not("score", "is", null)
    .order("score", { ascending: false });

  if (filters.region !== "all")      query = query.eq("region", filters.region);
  if (filters.city !== "all") {
    query = query.eq("city", filters.city);
  } else if (!isAdmin) {
    query = query.in("city", allowedCities);
  }
  if (filters.neighborhood !== "all") query = query.eq("neighborhood", filters.neighborhood);
  if (filters.priceLevel > 0)         query = query.lte("price_level", filters.priceLevel);
  if (filters.cuisine !== "all") {
    const matchingRaw = Array.from(new Set(rawCuisines.filter((c) => normalizeCuisine(c) === filters.cuisine)));
    if (matchingRaw.length > 0) query = query.in("cuisine", matchingRaw);
  }
  if (minScore > 0)                   query = query.gte("score", minScore);
  if (filters.placeType !== "all")    query = query.contains("place_type", [filters.placeType]);
  if (filters.gfCategory !== "all")   query = query.contains("gf_food_categories", [filters.gfCategory]);
  if (filters.fryer)                  query = query.eq("dossier->operations->dedicated_equipment->>fryer", "true");
  if (filters.labeled)                query = query.eq("dossier->menu->>gf_labeling", "clear");

  query = query.range(0, filters.limit - 1);

  const { data, error, count } = await query;

  const restaurants = (data ?? []) as Restaurant[];
  const totalCount = count ?? 0;
  const hasMore = restaurants.length < totalCount;

  if (error) {
    return (
      <p className="font-mono text-ui-md uppercase tracking-editorial text-text-label py-16 text-center">
        Error loading rankings
      </p>
    );
  }

  if (totalCount === 0) {
    return (
      <p className="font-mono text-ui-md uppercase tracking-editorial text-text-label py-16 text-center">
        No restaurants match these filters
      </p>
    );
  }

  const contextSuffix =
    filters.neighborhood !== "all"
      ? ` — ${filters.neighborhood}`
      : filters.city !== "all"
      ? ` — ${filters.city}`
      : filters.region !== "all"
      ? ` — ${filters.region}`
      : "";

  return (
    <RankedList
      restaurants={restaurants}
      countLabel={`Showing ${restaurants.length} of ${totalCount} Restaurant${totalCount !== 1 ? "s" : ""}${contextSuffix}`}
      loadMoreHref={hasMore ? rankingsUrl(filters, { limit: filters.limit + DEFAULT_LIMIT }) : undefined}
    />
  );
}

export function RankingsListSkeleton() {
  return (
    <div className="space-y-0 animate-pulse">
      {/* Count header skeleton */}
      <div className="py-4 border-b" style={{ borderColor: "var(--border-default)" }}>
        <div className="h-3 w-56 rounded" style={{ backgroundColor: "var(--border-subtle)" }} />
      </div>
      {/* Row skeletons */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-[3rem_1fr_auto] md:grid-cols-[5rem_1fr_auto] items-start border-b gap-3 md:gap-10 py-4 md:py-6 px-4 md:px-6"
          style={{ borderColor: "var(--border-subtle)", borderLeft: "2px solid var(--border-default)" }}
        >
          <div className="h-7 w-8 rounded ml-auto" style={{ backgroundColor: "var(--border-subtle)" }} />
          <div className="space-y-2 pt-1">
            <div className="h-6 rounded" style={{ backgroundColor: "var(--border-subtle)", width: `${55 + (i % 4) * 10}%` }} />
            <div className="h-2.5 w-28 rounded" style={{ backgroundColor: "var(--surface-overlay)" }} />
          </div>
          <div className="h-10 w-10 rounded" style={{ backgroundColor: "var(--border-subtle)" }} />
        </div>
      ))}
    </div>
  );
}
