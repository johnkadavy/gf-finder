import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getGaugeColor, getScoreLabel, type ScoringDossier } from "@/lib/score";
import { rankingsUrl, type Filters, type Experience, EXPERIENCE_OPTIONS } from "./utils";
import { RankingsLocationFilters, RankingsSecondaryFilters } from "./RankingsFilters";

const PAGE_SIZE = 25;

type Dossier = ScoringDossier & {
  summary?: { short_summary?: string };
};

type Restaurant = {
  id: number;
  name: string;
  city: string;
  neighborhood: string | null;
  website_url: string | null;
  google_maps_url: string | null;
  score: number;
  dossier: Dossier | null;
};

type RankingsPageProps = {
  searchParams: Promise<{
    city?: string;
    neighborhood?: string;
    cuisine?: string;
    fryer?: string;
    labeled?: string;
    experience?: string;
    page?: string;
  }>;
};

export default async function RankingsPage({ searchParams }: RankingsPageProps) {
  const params = await searchParams;

  const filters: Filters = {
    city:         params.city         ?? "all",
    neighborhood: params.neighborhood ?? "all",
    cuisine:      params.cuisine      ?? "all",
    fryer:        params.fryer   === "1",
    labeled:      params.labeled === "1",
    experience:   (["good", "great", "excellent"].includes(params.experience ?? "") ? params.experience : "all") as Experience,
    page:         Math.max(1, parseInt(params.page ?? "1", 10) || 1),
  };

  const minScore = EXPERIENCE_OPTIONS.find((o) => o.value === filters.experience)?.minScore ?? 0;
  const pageStart = (filters.page - 1) * PAGE_SIZE;

  // Build query for cities/neighborhoods/cuisines (fetch all scored restaurants for filter options)
  const { data: allForFilters } = await supabase
    .from("restaurants")
    .select("city, neighborhood, cuisine")
    .not("score", "is", null);

  const allRows = (allForFilters ?? []) as { city: string; neighborhood: string | null; cuisine: string | null }[];
  const cities = Array.from(new Set(allRows.map((r) => r.city))).sort();
  const neighborhoods =
    filters.city === "all"
      ? []
      : Array.from(
          new Set(
            allRows
              .filter((r) => r.city === filters.city && r.neighborhood)
              .map((r) => r.neighborhood as string)
          )
        ).sort();
  const cuisines = Array.from(
    new Set(allRows.map((r) => r.cuisine).filter((c): c is string => !!c))
  ).sort();

  // Build paginated query with all filters applied DB-side
  let query = supabase
    .from("restaurants")
    .select("id, name, city, neighborhood, website_url, google_maps_url, score, dossier", { count: "exact" })
    .not("score", "is", null)
    .order("score", { ascending: false });

  if (filters.city !== "all")         query = query.eq("city", filters.city);
  if (filters.neighborhood !== "all") query = query.eq("neighborhood", filters.neighborhood);
  if (filters.cuisine !== "all")      query = query.eq("cuisine", filters.cuisine);
  if (minScore > 0)                   query = query.gte("score", minScore);
  if (filters.fryer)                  query = query.eq("dossier->operations->dedicated_equipment->>fryer", "true");
  if (filters.labeled)                query = query.eq("dossier->menu->>gf_labeling", "clear");

  query = query.range(pageStart, pageStart + PAGE_SIZE - 1);

  const { data, error, count } = await query;

  const restaurants = (data ?? []) as Restaurant[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(filters.page, totalPages);

  return (
    <main className="pt-16">
      {/* Hero */}
      <section
        className="grid-bg border-b px-8 py-16 md:py-24 relative"
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
            Top Gluten-Free
            <br />
            <span style={{ color: "#FF7444" }}>Restaurants</span>
          </h1>

          <RankingsLocationFilters
            cities={cities}
            neighborhoods={neighborhoods}
            filters={filters}
          />

        </div>
      </section>

      {/* Rankings list */}
      <section className="px-8 pb-32 mt-8">
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
                {totalCount} Restaurant{totalCount !== 1 ? "s" : ""}
                {filters.city !== "all"
                  ? ` — ${filters.neighborhood !== "all" ? filters.neighborhood : filters.city}`
                  : ""}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[oklch(0.58_0_0)]">
                Page {safePage} of {totalPages}
              </span>
            </div>

            {restaurants.map((restaurant, index) => {
              const color = getGaugeColor(restaurant.score);
              const { label } = getScoreLabel(restaurant.score);
              const rank = pageStart + index + 1;

              return (
                <div
                  key={restaurant.id}
                  className="grid grid-cols-[3.5rem_1fr_auto] md:grid-cols-[5rem_1fr_auto] items-center border-b gap-4 md:gap-10 py-6 px-4 md:px-6 transition-colors duration-150 hover:bg-[oklch(0.11_0_0)] cursor-pointer"
                  style={{
                    borderColor: "oklch(0.18 0 0)",
                    borderLeft: `2px solid ${color}`,
                    animation: `fadeUp 0.4s ease-out ${Math.min(index, 20) * 0.03}s both`,
                  }}
                >
                  {/* Rank */}
                  <span
                    className="font-[family-name:var(--font-display)] leading-none tabular-nums text-right"
                    style={{
                      fontSize: "clamp(1.25rem, 2vw, 1.75rem)",
                      color: rank <= 3 ? color : "oklch(0.5 0 0)",
                    }}
                  >
                    {String(rank).padStart(2, "0")}
                  </span>

                  {/* Name + location */}
                  <div className="min-w-0">
                    <Link
                      href={`/restaurant/${restaurant.id}`}
                      className="font-[family-name:var(--font-display)] leading-none truncate block hover:text-[#FF7444] transition-colors duration-150"
                      style={{
                        fontSize: "clamp(1.4rem, 2.5vw, 2.1rem)",
                        letterSpacing: "0.02em",
                        color: "oklch(0.92 0 0)",
                      }}
                    >
                      {restaurant.name}
                    </Link>
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.65_0_0)] mt-2 truncate">
                      {[restaurant.neighborhood, restaurant.city].filter(Boolean).join(" / ")}
                    </p>
                    {restaurant.dossier?.summary?.short_summary && (
                      <p className="text-[14px] leading-[1.7] text-[oklch(0.82_0_0)] mt-2 max-w-xl">
                        {restaurant.dossier.summary.short_summary}
                      </p>
                    )}
                    {(restaurant.website_url || restaurant.google_maps_url) && (
                      <div className="flex items-center gap-4 mt-2">
                        {restaurant.website_url && (
                          <a
                            href={restaurant.website_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-[11px] uppercase tracking-[0.15em] text-[oklch(0.68_0_0)] hover:text-[#FF7444] transition-colors"
                          >
                            Website ↗
                          </a>
                        )}
                        {restaurant.google_maps_url && (
                          <a
                            href={restaurant.google_maps_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-[11px] uppercase tracking-[0.15em] text-[oklch(0.68_0_0)] hover:text-[#FF7444] transition-colors"
                          >
                            Google Maps ↗
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Score */}
                  <div className="flex flex-col items-end shrink-0">
                    <span
                      className="font-[family-name:var(--font-display)] leading-none tabular-nums"
                      style={{ fontSize: "clamp(1.75rem, 3.5vw, 2.75rem)", color }}
                    >
                      {Math.round(restaurant.score)}
                    </span>
                    <span
                      className="font-mono text-[10px] uppercase tracking-[0.15em] mt-1 text-right"
                      style={{ color: `${color}cc` }}
                    >
                      {label}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-8 pb-2">
                {safePage > 1 ? (
                  <Link
                    href={rankingsUrl(filters, { page: safePage - 1 })}
                    className="font-mono text-[11px] uppercase tracking-[0.2em] px-5 py-3 border transition-colors duration-150 text-[oklch(0.7_0_0)] hover:text-white hover:border-[oklch(0.5_0_0)]"
                    style={{ borderColor: "oklch(0.22 0 0)" }}
                  >
                    ← Prev
                  </Link>
                ) : <span />}

                <div className="flex items-center gap-0">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                    .reduce<(number | "…")[]>((acc, p, i, arr) => {
                      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === "…" ? (
                        <span key={`ellipsis-${i}`} className="font-mono text-[10px] px-2 text-[oklch(0.55_0_0)]">…</span>
                      ) : (
                        <Link
                          key={p}
                          href={rankingsUrl(filters, { page: p })}
                          className="font-mono text-[10px] uppercase tracking-[0.15em] w-9 h-9 flex items-center justify-center border-t border-b border-r transition-colors duration-150"
                          style={{
                            borderColor: "oklch(0.22 0 0)",
                            borderLeft: p === 1 ? "1px solid oklch(0.22 0 0)" : undefined,
                            backgroundColor: p === safePage ? "oklch(0.15 0 0)" : "transparent",
                            color: p === safePage ? "oklch(0.9 0 0)" : "oklch(0.62 0 0)",
                          }}
                        >
                          {p}
                        </Link>
                      )
                    )}
                </div>

                {safePage < totalPages ? (
                  <Link
                    href={rankingsUrl(filters, { page: safePage + 1 })}
                    className="font-mono text-[11px] uppercase tracking-[0.2em] px-5 py-3 border transition-colors duration-150 text-[oklch(0.7_0_0)] hover:text-white hover:border-[oklch(0.5_0_0)]"
                    style={{ borderColor: "oklch(0.22 0 0)" }}
                  >
                    Next →
                  </Link>
                ) : <span />}
              </div>
            )}
          </div>
        )}
      </div>
      </section>
    </main>
  );
}
