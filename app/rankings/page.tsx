import { Suspense } from "react";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabase";
import { createClient } from "@/lib/supabase-server";
import { type Filters, type Experience, EXPERIENCE_OPTIONS, PLACE_TYPE_OPTIONS, GF_CATEGORY_OPTIONS } from "./utils";
import { RankingsLocationFilters, RankingsSecondaryFilters } from "./RankingsFilters";
import { RankingsList, RankingsListSkeleton } from "./RankingsList";
import { normalizeCuisine } from "@/lib/cuisine";
import { getCityAccess, resolveCity } from "@/lib/cities";

type SearchParams = {
  region?: string;
  city?: string;
  neighborhood?: string;
  cuisine?: string;
  placeType?: string;
  gfCategory?: string;
  priceLevel?: string;
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

type RankingsPageProps = {
  searchParams: Promise<{
    region?: string;
    city?: string;
    neighborhood?: string;
    cuisine?: string;
    placeType?: string;
    gfCategory?: string;
    priceLevel?: string;
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
    priceLevel:   Math.min(4, Math.max(0, parseInt(params.priceLevel ?? "0", 10) || 0)),
    fryer:        params.fryer   === "1",
    labeled:      params.labeled === "1",
    experience:   (["good", "great", "excellent"].includes(params.experience ?? "") ? params.experience : "all") as Experience,
    limit:        Math.max(DEFAULT_LIMIT, parseInt(params.limit ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  };

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
          <Suspense fallback={<RankingsListSkeleton />}>
            <RankingsList
              filters={filters}
              isAdmin={cityAccess.isAdmin}
              allowedCities={[...cityAccess.allowedCities]}
              rawCuisines={rawCuisines}
            />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
