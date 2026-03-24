import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { calculateScore, getGaugeColor, getScoreLabel, type ScoringDossier } from "@/lib/score";

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
  dossier: Dossier | null;
};

type ScoredRestaurant = Restaurant & { score: number };

type RankingsPageProps = {
  searchParams: Promise<{ city?: string; neighborhood?: string; page?: string }>;
};

/** Build a rankings URL preserving active filters, optionally overriding page. */
function rankingsUrl(city: string, neighborhood: string, page: number) {
  const params = new URLSearchParams();
  if (city !== "all") params.set("city", city);
  if (neighborhood !== "all") params.set("neighborhood", neighborhood);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return `/rankings${qs ? `?${qs}` : ""}`;
}

export default async function RankingsPage({ searchParams }: RankingsPageProps) {
  const params = await searchParams;
  const selectedCity = params.city ?? "all";
  const selectedNeighborhood = params.neighborhood ?? "all";
  const currentPage = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const { data, error } = await supabase
    .from("restaurants")
    .select("id, name, city, neighborhood, website_url, google_maps_url, dossier")
    .not("dossier", "is", null);

  const restaurants = (data ?? []) as Restaurant[];

  // Score, filter nulls, sort descending
  const scored: ScoredRestaurant[] = restaurants
    .map((r) => ({ ...r, score: calculateScore(r.dossier!) }))
    .filter((r): r is ScoredRestaurant => r.score !== null)
    .sort((a, b) => b.score - a.score);

  // Derive cities from results
  const cities = Array.from(new Set(scored.map((r) => r.city))).sort();

  // Derive neighborhoods for the selected city
  const neighborhoods =
    selectedCity === "all"
      ? []
      : Array.from(
          new Set(
            scored
              .filter((r) => r.city === selectedCity && r.neighborhood)
              .map((r) => r.neighborhood as string)
          )
        ).sort();

  const filtered = scored
    .filter((r) => selectedCity === "all" || r.city === selectedCity)
    .filter((r) => selectedNeighborhood === "all" || r.neighborhood === selectedNeighborhood);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const paginated = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <main className="pt-16">
      {/* Hero */}
      <section
        className="grid-bg border-b px-8 py-16 md:py-24 relative"
        style={{ borderColor: "oklch(0.22 0 0)" }}
      >
        <div className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, oklch(0.08 0 0))" }} />
        <div className="max-w-4xl mx-auto">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[oklch(0.4_0_0)] mb-6">
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

          {/* City filter */}
          <div className="flex flex-wrap gap-0">
            <FilterTab label="All Cities" href="/rankings" active={selectedCity === "all"} />
            {cities.map((city) => (
              <FilterTab
                key={city}
                label={city}
                href={`/rankings?city=${encodeURIComponent(city)}`}
                active={selectedCity === city}
              />
            ))}
          </div>

          {/* Neighborhood filter — only when a city is selected */}
          {selectedCity !== "all" && neighborhoods.length > 0 && (
            <div className="flex flex-wrap gap-0 mt-3">
              <FilterTab
                label="All Neighborhoods"
                href={`/rankings?city=${encodeURIComponent(selectedCity)}`}
                active={selectedNeighborhood === "all"}
                secondary
              />
              {neighborhoods.map((n) => (
                <FilterTab
                  key={n}
                  label={n}
                  href={`/rankings?city=${encodeURIComponent(selectedCity)}&neighborhood=${encodeURIComponent(n)}`}
                  active={selectedNeighborhood === n}
                  secondary
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Rankings list */}
      <section className="max-w-4xl mx-auto px-8 pb-32 mt-8">
        {error ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.4_0_0)] py-16 text-center">
            Error loading rankings
          </p>
        ) : filtered.length === 0 ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.4_0_0)] py-16 text-center">
            No scored restaurants found
          </p>
        ) : (
          <div className="space-y-0">
            {/* Count header */}
            <div
              className="flex items-center justify-between py-4 border-b"
              style={{ borderColor: "oklch(0.22 0 0)" }}
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[oklch(0.55_0_0)]">
                {filtered.length} Restaurant{filtered.length !== 1 ? "s" : ""}
                {selectedCity !== "all" ? ` — ${selectedNeighborhood !== "all" ? selectedNeighborhood : selectedCity}` : ""}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[oklch(0.35_0_0)]">
                Page {safePage} of {totalPages}
              </span>
            </div>

            {paginated.map((restaurant, index) => {
              const color = getGaugeColor(restaurant.score);
              const { label } = getScoreLabel(restaurant.score);
              const rank = pageStart + index + 1;

              return (
                <div
                  key={restaurant.id}
                  className="grid grid-cols-[3rem_1fr_auto] md:grid-cols-[4rem_1fr_auto] items-center border-b gap-4 md:gap-8 py-5 px-4 md:px-6 transition-colors duration-150 hover:bg-[oklch(0.11_0_0)]"
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
                      fontSize: "clamp(1.1rem, 2vw, 1.5rem)",
                      color: rank <= 3 ? color : "oklch(0.3 0 0)",
                    }}
                  >
                    {String(rank).padStart(2, "0")}
                  </span>

                  {/* Name + location */}
                  <div className="min-w-0">
                    <p
                      className="font-[family-name:var(--font-display)] leading-none truncate"
                      style={{
                        fontSize: "clamp(1.2rem, 2.5vw, 1.75rem)",
                        letterSpacing: "0.02em",
                        color: "oklch(0.92 0 0)",
                      }}
                    >
                      {restaurant.name}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[oklch(0.45_0_0)] mt-1.5 truncate">
                      {[restaurant.neighborhood, restaurant.city].filter(Boolean).join(" / ")}
                    </p>
                    {restaurant.dossier?.summary?.short_summary && (
                      <p className="font-mono text-[11px] leading-[1.7] text-[oklch(0.58_0_0)] mt-2 max-w-lg">
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
                            className="font-mono text-[10px] uppercase tracking-[0.15em] text-[oklch(0.45_0_0)] hover:text-[#FF7444] transition-colors"
                          >
                            Website ↗
                          </a>
                        )}
                        {restaurant.google_maps_url && (
                          <a
                            href={restaurant.google_maps_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-[10px] uppercase tracking-[0.15em] text-[oklch(0.45_0_0)] hover:text-[#FF7444] transition-colors"
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
                      style={{
                        fontSize: "clamp(1.6rem, 3vw, 2.25rem)",
                        color,
                      }}
                    >
                      {restaurant.score}
                    </span>
                    <span
                      className="font-mono text-[8px] uppercase tracking-[0.15em] mt-1 text-right"
                      style={{ color: `${color}90` }}
                    >
                      {label}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Pagination */}
            {totalPages > 1 && (
              <div
                className="flex items-center justify-between pt-8 pb-2"
              >
                {safePage > 1 ? (
                  <Link
                    href={rankingsUrl(selectedCity, selectedNeighborhood, safePage - 1)}
                    className="font-mono text-[10px] uppercase tracking-[0.2em] px-5 py-3 border transition-colors duration-150 text-[oklch(0.55_0_0)] hover:text-white hover:border-[oklch(0.4_0_0)]"
                    style={{ borderColor: "oklch(0.22 0 0)" }}
                  >
                    ← Prev
                  </Link>
                ) : (
                  <span />
                )}

                {/* Page numbers */}
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
                        <span
                          key={`ellipsis-${i}`}
                          className="font-mono text-[10px] px-2 text-[oklch(0.3_0_0)]"
                        >
                          …
                        </span>
                      ) : (
                        <Link
                          key={p}
                          href={rankingsUrl(selectedCity, selectedNeighborhood, p)}
                          className="font-mono text-[10px] uppercase tracking-[0.15em] w-9 h-9 flex items-center justify-center border-t border-b border-r transition-colors duration-150"
                          style={{
                            borderColor: "oklch(0.22 0 0)",
                            borderLeft: p === 1 ? "1px solid oklch(0.22 0 0)" : undefined,
                            backgroundColor: p === safePage ? "oklch(0.15 0 0)" : "transparent",
                            color: p === safePage ? "oklch(0.9 0 0)" : "oklch(0.4 0 0)",
                          }}
                        >
                          {p}
                        </Link>
                      )
                    )}
                </div>

                {safePage < totalPages ? (
                  <Link
                    href={rankingsUrl(selectedCity, selectedNeighborhood, safePage + 1)}
                    className="font-mono text-[10px] uppercase tracking-[0.2em] px-5 py-3 border transition-colors duration-150 text-[oklch(0.55_0_0)] hover:text-white hover:border-[oklch(0.4_0_0)]"
                    style={{ borderColor: "oklch(0.22 0 0)" }}
                  >
                    Next →
                  </Link>
                ) : (
                  <span />
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function FilterTab({
  label,
  href,
  active,
  secondary = false,
}: {
  label: string;
  href: string;
  active: boolean;
  secondary?: boolean;
}) {
  return (
    <Link
      href={href}
      className="font-mono uppercase tracking-[0.2em] border-r border-t border-b transition-colors duration-150"
      style={{
        fontSize: secondary ? "9px" : "10px",
        padding: secondary ? "0.4rem 0.75rem" : "0.625rem 1rem",
        borderColor: secondary ? "oklch(0.18 0 0)" : "oklch(0.22 0 0)",
        backgroundColor: active
          ? secondary ? "oklch(0.13 0 0)" : "oklch(0.15 0 0)"
          : "transparent",
        color: active ? "oklch(0.9 0 0)" : secondary ? "oklch(0.38 0 0)" : "oklch(0.45 0 0)",
        borderLeft: active ? "2px solid #FF7444" : "2px solid transparent",
      }}
    >
      {label}
    </Link>
  );
}
