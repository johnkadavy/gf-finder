import Link from "next/link";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabase";
import { createClient } from "@/lib/supabase-server";
import { getGaugeColor, getScoreLabel, type ScoringDossier } from "@/lib/score";
import { isNewRestaurant } from "@/lib/utils";
import { rankingsUrl, type Filters, type Experience, EXPERIENCE_OPTIONS, PLACE_TYPE_OPTIONS, GF_CATEGORY_OPTIONS } from "./utils";
import { RankingsLocationFilters, RankingsSecondaryFilters } from "./RankingsFilters";
import { ExpandableText } from "./ExpandableText";
import { normalizeCuisine } from "@/lib/cuisine";
import { formatLocation } from "@/lib/utils";
import { getCityAccess, resolveCity, getSelectableCities } from "@/lib/cities";

type SearchParams = {
  region?: string;
  city?: string;
  neighborhood?: string;
  cuisine?: string;
  placeType?: string;
  gfCategory?: string;
  fryer?: string;
  labeled?: string;
  experience?: string;
  limit?: string;
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const city          = params.city          ?? "all";
  const neighborhood  = params.neighborhood  ?? "all";
  const gfCategory    = params.gfCategory    ?? "all";
  const placeType     = params.placeType     ?? "all";

  const cityLabel        = city        !== "all" ? city : "NYC";
  const neighborhoodLabel = neighborhood !== "all" ? neighborhood : null;
  const gfCategoryLabel  = GF_CATEGORY_OPTIONS.find((o) => o.value === gfCategory)?.label ?? null;
  const placeTypeLabel   = PLACE_TYPE_OPTIONS.find((o) => o.value === placeType)?.label    ?? null;

  let title: string;
  let description: string;

  if (neighborhoodLabel) {
    title = `Best Gluten-Free Restaurants in ${neighborhoodLabel}, ${cityLabel} | CleanPlate`;
    description = `Gluten-free restaurants in ${neighborhoodLabel}, ${cityLabel} ranked by GF safety score. Filter by dedicated fryer, menu labeling, cuisine, and more.`;
  } else if (gfCategoryLabel) {
    title = `Best ${gfCategoryLabel} in ${cityLabel} | CleanPlate`;
    description = `Top ${gfCategoryLabel.toLowerCase()} spots in ${cityLabel} ranked by gluten-free safety. Find places with dedicated fryers, clear menu labeling, and low cross-contamination risk.`;
  } else if (placeTypeLabel) {
    title = `Best Gluten-Free ${placeTypeLabel}s in ${cityLabel} | CleanPlate`;
    description = `Gluten-free ${placeTypeLabel.toLowerCase()}s in ${cityLabel} ranked by GF safety score. Find the safest spots for celiacs and gluten-free diners.`;
  } else if (city !== "all") {
    title = `Top Gluten-Free Restaurants in ${cityLabel} — Ranked by Safety | CleanPlate`;
    description = `Browse gluten-free restaurants in ${cityLabel} ranked by safety score. Filter by dedicated GF kitchen, fryer, menu labeling, neighborhood, and more.`;
  } else {
    title = "Top Gluten-Free Restaurants in NYC — Ranked by Safety | CleanPlate";
    description = "Browse 3,500+ NYC restaurants ranked by gluten-free safety. Filter by dedicated GF kitchen, GF fryer, GF pizza, neighborhood, and more.";
  }

  return {
    title,
    description,
    alternates: { canonical: "/rankings" },
    openGraph: { title, description, type: "website", url: "/rankings" },
  };
}

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
  website_url: string | null;
  google_maps_url: string | null;
  score: number;
  dossier: Dossier | null;
  source: string | null;
  ingested_at: string | null;
};

type RankingsPageProps = {
  searchParams: Promise<{
    region?: string;
    city?: string;
    neighborhood?: string;
    cuisine?: string;
    placeType?: string;
    gfCategory?: string;
    fryer?: string;
    labeled?: string;
    experience?: string;
    limit?: string;
  }>;
};

export default async function RankingsPage({ searchParams }: RankingsPageProps) {
  const params = await searchParams;

  // Resolve city access before building filters
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  const cityAccess = await getCityAccess(user?.id, serverClient);
  const resolvedCity = resolveCity(params.city, cityAccess);

  const validPlaceTypes   = new Set(PLACE_TYPE_OPTIONS.map((o) => o.value));
  const validGfCategories = new Set(GF_CATEGORY_OPTIONS.map((o) => o.value));
  const filters: Filters = {
    region:       params.region       ?? "all",
    city:         resolvedCity,
    neighborhood: params.neighborhood ?? "all",
    cuisine:      params.cuisine      ?? "all",
    placeType:    validPlaceTypes.has(params.placeType ?? "")     ? (params.placeType   ?? "all") : "all",
    gfCategory:   validGfCategories.has(params.gfCategory ?? "") ? (params.gfCategory  ?? "all") : "all",
    fryer:        params.fryer   === "1",
    labeled:      params.labeled === "1",
    experience:   (["good", "great", "excellent"].includes(params.experience ?? "") ? params.experience : "all") as Experience,
    limit:        Math.max(DEFAULT_LIMIT, parseInt(params.limit ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  };

  const minScore = EXPERIENCE_OPTIONS.find((o) => o.value === filters.experience)?.minScore ?? 0;

  // Cached filter metadata — regions/cities/neighborhoods/cuisines, keyed by access scope
  // Revalidates every hour; eliminates the heavy full-table scan on repeat page loads
  const getFilterMeta = unstable_cache(
    async (isAdmin: boolean, allowedCities: string[]) => {
      let q = supabase
        .from("restaurants")
        .select("region, city, neighborhood, cuisine")
        .not("score", "is", null);
      if (!isAdmin) q = q.in("city", allowedCities);
      const { data } = await q;
      return (data ?? []) as { region: string | null; city: string; neighborhood: string | null; cuisine: string | null }[];
    },
    ["rankings-filter-meta"],
    { revalidate: 3600 }
  );

  const allRows = await getFilterMeta(cityAccess.isAdmin, [...cityAccess.allowedCities].sort());

  // Derive selectable regions
  const regions = Array.from(new Set(allRows.map((r) => r.region).filter((r): r is string => !!r))).sort();

  // Rows scoped to the selected region
  const regionRows = filters.region === "all"
    ? allRows
    : allRows.filter((r) => r.region === filters.region);

  // Unique cities within the selected region
  const regionCities = Array.from(new Set(regionRows.map((r) => r.city))).sort();

  // Multi-city region → show town selector; single-city → show neighborhood selector
  const isMultiCityRegion = regionCities.length > 1;
  const towns = isMultiCityRegion ? regionCities : [];

  // Neighborhoods: only for single-city regions, scoped to selected city
  const effectiveCity = filters.city !== "all" ? filters.city : (!isMultiCityRegion && regionCities[0]) || null;
  const neighborhoods = (!isMultiCityRegion && effectiveCity)
    ? Array.from(
        new Set(
          regionRows
            .filter((r) => r.city === effectiveCity && r.neighborhood && r.neighborhood !== effectiveCity)
            .map((r) => r.neighborhood as string)
        )
      ).sort()
    : [];

  // Build normalized cuisine list for the filter UI
  const rawCuisines = allRows.map((r) => r.cuisine).filter((c): c is string => !!c && c.toLowerCase() !== "unknown");
  const cuisines = Array.from(new Set(rawCuisines.map(normalizeCuisine)))
    .filter((c) => c !== "Other")
    .sort();

  // Build paginated query with all filters applied DB-side
  let query = supabase
    .from("restaurants")
    .select("id, name, city, neighborhood, region, website_url, google_maps_url, score, dossier, source, ingested_at", { count: "exact" })
    .not("score", "is", null)
    .order("score", { ascending: false });

  if (filters.region !== "all") {
    query = query.eq("region", filters.region);
  }
  if (filters.city !== "all") {
    query = query.eq("city", filters.city);
  } else if (!cityAccess.isAdmin) {
    query = query.in("city", cityAccess.allowedCities);
  }
  if (filters.neighborhood !== "all") query = query.eq("neighborhood", filters.neighborhood);
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

  return (
    <main className="pt-16">
      {/* Hero */}
      <section
        className="grid-bg border-b px-4 md:px-8 py-16 md:py-24 relative"
        style={{ borderColor: "oklch(0.22 0 0)" }}
      >
        <div
          className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, oklch(0.08 0 0))" }}
        />
        <div className="max-w-6xl mx-auto">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[oklch(0.65_0_0)] mb-6">
            CleanPlate Rankings
          </p>
          <h1
            className="font-[family-name:var(--font-display)] leading-none mb-10"
            style={{ fontSize: "clamp(3rem, 8vw, 5.5rem)", letterSpacing: "0.02em" }}
          >
            {filters.neighborhood !== "all" ? (
              <>Best Gluten-Free Restaurants<br /><span style={{ color: "#FF7444" }}>in {filters.neighborhood}</span></>
            ) : filters.city !== "all" ? (
              <>Top Gluten-Free<br /><span style={{ color: "#FF7444" }}>Restaurants in {filters.city}</span></>
            ) : filters.region !== "all" ? (
              <>Top Gluten-Free<br /><span style={{ color: "#FF7444" }}>Restaurants in {filters.region}</span></>
            ) : filters.gfCategory !== "all" ? (
              <>{GF_CATEGORY_OPTIONS.find((o) => o.value === filters.gfCategory)?.label ?? "GF Food"}<br /><span style={{ color: "#FF7444" }}>in NYC</span></>
            ) : (
              <>Top Gluten-Free<br /><span style={{ color: "#FF7444" }}>Restaurants</span></>
            )}
          </h1>

          <RankingsLocationFilters
            regions={regions}
            towns={towns}
            neighborhoods={neighborhoods}
            filters={filters}
          />

        </div>
      </section>

      {/* Rankings list */}
      <section className="px-4 md:px-8 pb-32 mt-8">
      <div className="max-w-6xl mx-auto">
        <RankingsSecondaryFilters filters={filters} cuisines={cuisines} />
        {error ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.65_0_0)] py-16 text-center">
            Error loading rankings
          </p>
        ) : totalCount === 0 ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.65_0_0)] py-16 text-center">
            No restaurants match these filters
          </p>
        ) : (
          <div className="space-y-0">
            {/* Count header */}
            <div
              className="flex items-center justify-between py-4 border-b"
              style={{ borderColor: "oklch(0.22 0 0)" }}
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[oklch(0.7_0_0)]">
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
              const { label } = getScoreLabel(restaurant.score);
              const rank = index + 1;

              return (
                <Link
                  key={restaurant.id}
                  href={`/restaurant/${restaurant.id}`}
                  className="grid grid-cols-[3rem_1fr_auto] md:grid-cols-[5rem_1fr_auto] items-start md:items-center border-b gap-3 md:gap-10 py-4 md:py-6 px-4 md:px-6 transition-colors duration-150 hover:bg-[oklch(0.11_0_0)]"
                  style={{
                    borderColor: "oklch(0.18 0 0)",
                    borderLeft: `2px solid ${color}`,
                    animation: `fadeUp 0.4s ease-out ${Math.min(index, 20) * 0.03}s both`,
                  }}
                >
                  {/* Rank */}
                  <span
                    className="font-[family-name:var(--font-display)] leading-none tabular-nums text-right pt-0.5"
                    style={{
                      fontSize: "clamp(1.1rem, 2vw, 1.75rem)",
                      color: rank <= 3 ? color : "oklch(0.65 0 0)",
                    }}
                  >
                    {String(rank).padStart(2, "0")}
                  </span>

                  {/* Name + location */}
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span
                        className="font-[family-name:var(--font-display)] leading-tight line-clamp-2 md:line-clamp-1 md:truncate group-hover:text-[#FF7444] transition-colors duration-150"
                        style={{
                          fontSize: "clamp(1.15rem, 2.5vw, 2.1rem)",
                          letterSpacing: "0.02em",
                          color: "oklch(0.95 0 0)",
                        }}
                      >
                        {restaurant.name}
                      </span>
                      {isNewRestaurant(restaurant.source, restaurant.ingested_at) && (
                        <span className="font-mono text-[9px] uppercase tracking-[0.2em] px-1.5 py-0.5 shrink-0" style={{ backgroundColor: "#FF744420", color: "#FF7444", border: "1px solid #FF744450" }}>
                          New
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.65_0_0)] mt-1 md:mt-2 truncate">
                      {formatLocation(restaurant.neighborhood, restaurant.city, restaurant.region)}
                    </p>
                    {restaurant.dossier?.summary?.short_summary && (
                      <>
                        {/* Mobile: 1-line truncated with expand */}
                        <p className="md:hidden text-[13px] leading-[1.65] text-[oklch(0.72_0_0)] mt-1">
                          <ExpandableText text={restaurant.dossier.summary.short_summary} />
                        </p>
                        {/* Desktop: full */}
                        <p className="hidden md:block text-[14px] leading-[1.7] text-[oklch(0.82_0_0)] mt-2 max-w-xl">
                          {restaurant.dossier.summary.short_summary}
                        </p>
                      </>
                    )}
                  </div>

                  {/* Score */}
                  <div className="flex flex-col items-end shrink-0 pt-0.5">
                    <span
                      className="font-[family-name:var(--font-display)] leading-none tabular-nums"
                      style={{ fontSize: "clamp(1.5rem, 3.5vw, 2.75rem)", color }}
                    >
                      {Math.round(restaurant.score)}
                    </span>
                    <span
                      className="hidden md:block font-mono text-[10px] uppercase tracking-[0.15em] mt-1 text-right"
                      style={{ color: `${color}cc` }}
                    >
                      {label}
                    </span>
                  </div>
                </Link>
              );
            })}

            {/* Load More */}
            {hasMore && (
              <div className="flex justify-center pt-10 pb-2">
                <Link
                  href={rankingsUrl(filters, { limit: filters.limit + DEFAULT_LIMIT })}
                  scroll={false}
                  className="font-mono text-[11px] uppercase tracking-[0.2em] px-8 py-3.5 border transition-colors duration-150 text-[oklch(0.7_0_0)] hover:text-white hover:border-[oklch(0.5_0_0)]"
                  style={{ borderColor: "oklch(0.28 0 0)" }}
                >
                  Load More
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
      </section>
    </main>
  );
}
