import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getGaugeColor, type ScoringDossier } from "@/lib/score";
import { isNewRestaurant, formatLocation } from "@/lib/utils";
import { normalizeCuisine } from "@/lib/cuisine";
import { rankingsUrl, type Filters, EXPERIENCE_OPTIONS } from "./utils";
import { ExpandableText } from "./ExpandableText";
import { ScoreBadge } from "@/app/components/ScoreBadge";

const DEFAULT_LIMIT = 25;

type Dossier = ScoringDossier & {
  summary?: { short_summary?: string };
};

type Restaurant = {
  id: number;
  name: string;
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
    .select("id, name, city, neighborhood, region, website_url, google_maps_url, score, slug, dossier, source, ingested_at", { count: "exact" })
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

  return (
    <div className="space-y-0">
      {/* Count header */}
      <div
        className="flex items-center justify-between py-4 border-b"
        style={{ borderColor: "var(--border-default)" }}
      >
        <span className="font-mono text-ui-sm uppercase tracking-stamp text-text-tertiary">
          Showing {restaurants.length} of {totalCount} Restaurant{totalCount !== 1 ? "s" : ""}
          {filters.neighborhood !== "all"
            ? ` — ${filters.neighborhood}`
            : filters.city !== "all"
            ? ` — ${filters.city}`
            : filters.region !== "all"
            ? ` — ${filters.region}`
            : ""}
        </span>
      </div>

      {restaurants.map((restaurant, index) => {
        const color = getGaugeColor(restaurant.score);
        const rank = index + 1;

        return (
          <Link
            key={restaurant.id}
            href={restaurant.slug ? `/restaurant/${restaurant.slug}` : `/restaurant/${restaurant.id}`}
            className="group grid grid-cols-[3rem_1fr_auto] md:grid-cols-[5rem_1fr_auto] items-start md:items-center border-b gap-3 md:gap-10 py-4 md:py-6 px-4 md:px-6 transition-colors duration-150 hover:bg-surface-raised"
            style={{
              borderColor: "var(--border-subtle)",
              borderLeft: `2px solid ${color}`,
              animation: `fadeUp 0.4s ease-out ${Math.min(index, 20) * 0.03}s both`,
            }}
          >
            {/* Rank */}
            <span
              className="font-[family-name:var(--font-display)] leading-none tabular-nums text-right pt-0.5"
              style={{
                fontSize: "clamp(1.1rem, 2vw, 1.75rem)",
                color: rank <= 3 ? color : "var(--text-label)",
              }}
            >
              {String(rank).padStart(2, "0")}
            </span>

            {/* Name + location */}
            <div className="min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <div className="relative min-w-0">
                  <span
                    className="font-[family-name:var(--font-display)] leading-tight line-clamp-2 md:line-clamp-1 md:truncate"
                    style={{
                      fontSize: "clamp(1.15rem, 2.5vw, 2.1rem)",
                      letterSpacing: "0.02em",
                      color: "var(--text-primary)",
                    }}
                  >
                    {restaurant.name}
                  </span>
                  <span
                    className="absolute bottom-0 left-0 h-px w-0 group-hover:w-full transition-all duration-300"
                    style={{ backgroundColor: color }}
                  />
                </div>
                {isNewRestaurant(restaurant.source, restaurant.ingested_at) && (
                  <span className="font-mono text-ui-xs uppercase tracking-editorial px-1.5 py-0.5 shrink-0" style={{ backgroundColor: "var(--accent-tint-md)", color: "var(--accent)", border: "1px solid var(--accent-tint-lg)" }}>
                    New
                  </span>
                )}
              </div>
              <p className="font-mono text-ui-md uppercase tracking-editorial text-text-label mt-1 md:mt-2 truncate">
                {formatLocation(restaurant.neighborhood, restaurant.city, restaurant.region)}
              </p>
              {restaurant.dossier?.summary?.short_summary && (
                <>
                  <p className="md:hidden text-ui-lg leading-[1.65] text-text-tertiary mt-1">
                    <ExpandableText text={restaurant.dossier.summary.short_summary} />
                  </p>
                  <p className="hidden md:block text-ui-xl leading-[1.7] text-text-secondary mt-2 max-w-xl">
                    {restaurant.dossier.summary.short_summary}
                  </p>
                </>
              )}
            </div>

            {/* Score */}
            <ScoreBadge score={restaurant.score} />
          </Link>
        );
      })}

      {/* Load More */}
      {hasMore && (
        <div className="flex justify-center pt-10 pb-2">
          <Link
            href={rankingsUrl(filters, { limit: filters.limit + DEFAULT_LIMIT })}
            scroll={false}
            className="font-mono text-ui-md uppercase tracking-editorial px-8 py-3.5 border transition-colors duration-150 text-text-tertiary hover:text-white"
            style={{ borderColor: "var(--border-emphasis)" }}
          >
            Load More
          </Link>
        </div>
      )}
    </div>
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
