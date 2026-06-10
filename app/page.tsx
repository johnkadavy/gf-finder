import { cache, Suspense } from "react";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { createClient } from "@/lib/supabase-server";
import { SafetyGauge } from "./components/SafetyGauge";
import { SaveButton } from "./components/SaveButton";
import { HomeAskInput } from "./components/HomeAskInput";
import { TopRatedSection } from "./components/TopRatedSection";
import { LocationBanner } from "./components/LocationBanner";
import { calculateScore, getGaugeColor, type ScoringDossier, type VerifiedData } from "@/lib/score";
import { getCityAccess, resolveCity, getSelectableCities } from "@/lib/cities";
import { SIGNAL_DOT } from "@/lib/tokens";

type Signal = {
  label: string;
  variant: "positive" | "warning" | "error";
};

type Dossier = ScoringDossier & {
  summary?: { gf_experience_level?: string; short_summary?: string };
  menu?: ScoringDossier["menu"] & { gf_labeling?: string; gf_options_level?: string };
};

type Restaurant = {
  id: number;
  name: string;
  city: string;
  neighborhood: string | null;
  website_url: string | null;
  google_maps_url: string | null;
  slug: string | null;
  dossier: Dossier | null;
  verified_data: VerifiedData | null;
};

type HomePageProps = {
  searchParams: Promise<{ q?: string; city?: string }>;
};

// ── Page metadata ────────────────────────────────────────────────────────────

export async function generateMetadata(): Promise<Metadata> {
  const { totalCount } = await getHomepageMeta();
  const roundedCount = Math.floor((totalCount ?? 0) / 100) * 100;
  return {
    title: "CleanPlate — NYC's Gluten-Free Restaurant Guide",
    description: `${roundedCount.toLocaleString()}+ NYC restaurants rated for gluten-free safety. Find celiac-safe dining with dedicated fryers, clear menu labeling, and low cross-contamination risk.`,
    alternates: { canonical: "/" },
    openGraph: {
      title: "CleanPlate — NYC's Gluten-Free Restaurant Guide",
      description: `${roundedCount.toLocaleString()}+ NYC restaurants rated for GF safety. No guessing.`,
      url: "/",
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "CleanPlate — NYC's Gluten-Free Restaurant Guide" }],
    },
  };
}

// ── Homepage structured data ─────────────────────────────────────────────────

const HOME_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://trycleanplate.com/#organization",
      "name": "CleanPlate",
      "url": "https://trycleanplate.com",
      "description": "NYC's gluten-free restaurant guide. Restaurants rated 0–100 for GF safety based on cross-contamination risk, menu labeling, and real diner experiences.",
      "logo": { "@type": "ImageObject", "url": "https://trycleanplate.com/guanaco_logo.svg" },
    },
    {
      "@type": "WebSite",
      "@id": "https://trycleanplate.com/#website",
      "name": "CleanPlate",
      "url": "https://trycleanplate.com",
      "publisher": { "@id": "https://trycleanplate.com/#organization" },
      "potentialAction": {
        "@type": "SearchAction",
        "target": { "@type": "EntryPoint", "urlTemplate": "https://trycleanplate.com/?q={search_term_string}" },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

// ── Per-request auth deduplication ──────────────────────────────────────────
// React.cache ensures getUser() is called at most once per request even when
// multiple async server components race to call it inside Suspense boundaries.
const getRequestAuth = cache(async () => {
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  const cityAccess = await getCityAccess(user?.id, serverClient);
  return { serverClient, user, cityAccess };
});

// ── Cached DB queries ────────────────────────────────────────────────────────

// Cached homepage metadata (city list + NYC count) — revalidates every hour
const getHomepageMeta = unstable_cache(
  async () => {
    const [{ data: cityRows }, { count: totalCount }] = await Promise.all([
      supabase.from("restaurants").select("city").not("score", "is", null),
      supabase.from("restaurants").select("*", { count: "exact", head: true }).eq("city", "New York").not("score", "is", null),
    ]);
    return { cityRows: cityRows ?? [], totalCount: totalCount ?? 0 };
  },
  ["homepage-meta"],
  { revalidate: 3600 },
);

export type TopRestaurant = {
  id: number;
  name: string;
  display_name: string | null;
  neighborhood: string | null;
  cuisine: string | null;
  score: number | null;
  slug: string | null;
  hasGfFryer: boolean;
  isDedicatedGf: boolean;
  gf_food_categories: string[] | null;
  place_type: string[] | null;
};

// Cached per-city top-50 — revalidates every 30 min
const getTopRestaurants = unstable_cache(
  async (city: string) => {
    const { data } = await supabase
      .from("restaurants")
      .select("id, name, display_name, neighborhood, cuisine, score, slug, dossier, gf_food_categories, place_type")
      .eq("city", city)
      .not("score", "is", null)
      .order("score", { ascending: false })
      .limit(50);
    return (data ?? []) as Array<{
      id: number; name: string; display_name: string | null; neighborhood: string | null;
      cuisine: string | null; score: number | null; slug: string | null;
      dossier: Dossier | null;
      gf_food_categories: string[] | null; place_type: string[] | null;
    }>;
  },
  ["homepage-top-restaurants"],
  { revalidate: 1800 },
);

// ── Shared helpers ───────────────────────────────────────────────────────────

function buildSignals(dossier: Dossier): Signal[] {
  const signals: Signal[] = [];

  if (dossier.menu?.gf_labeling === "clear")
    signals.push({ label: "Gluten-free menu clearly labeled", variant: "positive" });
  else if (dossier.menu?.gf_labeling === "partial")
    signals.push({ label: "Some GF items labeled", variant: "warning" });
  else if (dossier.menu?.gf_labeling === "none")
    signals.push({ label: "No GF labeling on menu", variant: "error" });

  if (dossier.operations?.staff_knowledge === "high")
    signals.push({ label: "Staff knowledgeable about celiac", variant: "positive" });
  else if (dossier.operations?.staff_knowledge === "low")
    signals.push({ label: "Staff GF knowledge limited", variant: "error" });

  if (dossier.operations?.cross_contamination_risk === "low")
    signals.push({ label: "Low cross-contamination risk", variant: "positive" });
  else if (dossier.operations?.cross_contamination_risk === "high")
    signals.push({ label: "High cross-contamination risk", variant: "error" });

  if (dossier.operations?.dedicated_equipment?.fryer === true)
    signals.push({ label: "Dedicated gluten-free fryer", variant: "positive" });

  return signals.slice(0, 4);
}

const signalConfig = {
  positive: { dot: SIGNAL_DOT.positive },
  warning:  { dot: SIGNAL_DOT.warning },
  error:    { dot: SIGNAL_DOT.error },
};

function SignalChip({ signal }: { signal: Signal }) {
  const cfg = signalConfig[signal.variant];
  return (
    <div
      className="flex items-center gap-3 px-6 py-4 border-b md:border-b-0 md:border-r"
      style={{ borderColor: "var(--surface-overlay)" }}
    >
      <span
        className="w-1.5 h-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: cfg.dot }}
      />
      <span className="font-mono text-ui-md uppercase tracking-label text-text-secondary leading-normal">
        {signal.label}
      </span>
    </div>
  );
}

// ── Async server components (each deferred behind Suspense) ──────────────────

async function LocationBannerServer() {
  const [{ cityAccess }, { cityRows }] = await Promise.all([
    getRequestAuth(),
    getHomepageMeta(),
  ]);
  const allDbCities = Array.from(new Set(cityRows.map((r: { city: string }) => r.city))).sort();
  const selectableCities = getSelectableCities(cityAccess, allDbCities);
  return <LocationBanner cities={selectableCities} />;
}

async function HeroCount() {
  const { totalCount } = await getHomepageMeta();
  const roundedCount = Math.floor((totalCount ?? 0) / 100) * 100;
  return (
    <p className="font-mono text-ui-md uppercase tracking-broad text-text-dim mt-5">
      {roundedCount.toLocaleString()}+ NYC restaurants rated for gluten-free safety
    </p>
  );
}

async function PageContent({ query, cityParam }: { query: string; cityParam?: string }) {
  const { serverClient, user, cityAccess } = await getRequestAuth();
  const selectedCity = resolveCity(cityParam, cityAccess);
  const topRatedCity = selectedCity !== "all" ? selectedCity : cityAccess.defaultCity;

  // ── Search mode ────────────────────────────────────────────────────────────
  if (query) {
    let q = supabase
      .from("restaurants")
      .select("id, name, city, neighborhood, website_url, google_maps_url, slug, dossier, verified_data")
      .ilike("name", `%${query}%`)
      .order("name");

    if (selectedCity !== "all") {
      q = q.eq("city", selectedCity);
    } else if (!cityAccess.isAdmin) {
      q = q.in("city", cityAccess.allowedCities);
    }

    const { data, error } = await q;
    const restaurants: Restaurant[] = error ? [] : ((data ?? []) as Restaurant[]);

    let savedIds = new Set<number>();
    if (user && restaurants.length > 0) {
      const { data: saves } = await serverClient
        .from("saved_restaurants")
        .select("restaurant_id")
        .eq("user_id", user.id)
        .in("restaurant_id", restaurants.map((r) => r.id));
      savedIds = new Set((saves ?? []).map((s) => s.restaurant_id));
    }

    return (
      <section className="max-w-4xl mx-auto px-4 md:px-8 pb-24 md:pb-32 mt-6 md:mt-8">
        {restaurants.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-mono text-ui-md uppercase tracking-editorial text-text-label">
              No results for &ldquo;{query}&rdquo;
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            <div
              className="flex items-center justify-between px-0 py-4 border-b"
              style={{ borderColor: "var(--border-default)" }}
            >
              <span className="font-mono text-ui-md uppercase tracking-stamp text-text-tertiary">
                {restaurants.length} Result{restaurants.length !== 1 ? "s" : ""} — &ldquo;{query}&rdquo;
              </span>
            </div>

            {restaurants.map((restaurant, index) => {
              const summary = restaurant.dossier?.summary?.short_summary;
              const score = restaurant.dossier ? calculateScore(restaurant.dossier, restaurant.verified_data ?? undefined) : null;
              const signals = restaurant.dossier ? buildSignals(restaurant.dossier) : [];
              const sickCount = restaurant.dossier?.reviews?.sick_reports_recent ?? 0;
              const sickSourceUrl = restaurant.dossier?.reviews?.sick_reports_details?.find((d) => d.source_url)?.source_url ?? null;
              const accentColor = getGaugeColor(score);

              return (
                <div
                  key={restaurant.id}
                  className="border-b"
                  style={{
                    borderColor: "var(--border-default)",
                    animation: `fadeUp 0.4s ease-out ${index * 0.07}s both`,
                    borderLeft: `2px solid ${accentColor}`,
                  }}
                >
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-0">
                    <div className="px-4 pt-5 pb-4 md:px-8 md:pt-9 md:pb-6">

                      {sickCount > 0 && (
                        <div
                          className="flex items-center gap-3 mb-4 md:mb-6 px-4 py-2.5 border"
                          style={{ borderColor: "var(--accent-tint-md)", backgroundColor: "var(--accent-tint-xs)" }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                          {sickSourceUrl ? (
                            <a
                              href={sickSourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-ui-sm uppercase tracking-label text-accent hover:underline"
                            >
                              {sickCount} illness report{sickCount > 1 ? "s" : ""} — past 6 months
                            </a>
                          ) : (
                            <span className="font-mono text-ui-sm uppercase tracking-label text-accent">
                              {sickCount} illness report{sickCount > 1 ? "s" : ""} — past 6 months
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-start justify-between gap-4 mb-3 md:mb-0">
                        <p className="font-mono text-ui-md uppercase tracking-stamp text-text-label md:mb-4">
                          {[restaurant.neighborhood, restaurant.city].filter(Boolean).join(" / ")}
                        </p>
                        <div className="flex items-center gap-2 shrink-0 -mt-1">
                          <div className="md:hidden">
                            <SafetyGauge score={score} size="sm" />
                          </div>
                        </div>
                      </div>

                      <Link
                        href={restaurant.slug ? `/restaurant/${restaurant.slug}` : `/restaurant/${restaurant.id}`}
                        className="group/name relative inline-block font-[family-name:var(--font-display)] leading-none mb-4 md:mb-5 hover:text-accent transition-colors duration-150"
                        style={{
                          fontSize: "clamp(1.6rem, 5vw, 2.75rem)",
                          letterSpacing: "0.02em",
                          color: "var(--text-primary)",
                        }}
                      >
                        {restaurant.name}
                        <span
                          className="absolute bottom-0 left-0 h-px w-0 group-hover/name:w-full transition-all duration-300"
                          style={{ backgroundColor: accentColor }}
                        />
                      </Link>

                      <div className="flex items-center gap-6 mb-4 md:mb-6">
                        {restaurant.website_url && (
                          <a
                            href={restaurant.website_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-ui-md uppercase tracking-label text-text-label hover:text-accent transition-colors"
                          >
                            Website ↗
                          </a>
                        )}
                        {restaurant.google_maps_url && (
                          <a
                            href={restaurant.google_maps_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-ui-md uppercase tracking-label text-text-label hover:text-accent transition-colors"
                          >
                            Google Maps ↗
                          </a>
                        )}
                        <SaveButton
                          restaurantId={restaurant.id}
                          initialSaved={savedIds.has(restaurant.id)}
                          showLabel
                        />
                      </div>

                      {summary && (
                        <p className="text-ui-xl leading-[1.75] text-text-secondary max-w-[520px]">
                          {summary}
                        </p>
                      )}
                    </div>

                    <div className="hidden md:flex items-start justify-end pr-8 pt-5 pb-5">
                      <SafetyGauge score={score} />
                    </div>
                  </div>

                  {signals.length > 0 && (
                    <div
                      className="grid grid-cols-1 md:grid-cols-3 border-t"
                      style={{ borderColor: "var(--surface-overlay)" }}
                    >
                      {signals.map((signal, i) => (
                        <SignalChip key={i} signal={signal} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  // ── Top rated mode ─────────────────────────────────────────────────────────
  const topData = await getTopRestaurants(topRatedCity);
  const topRated: TopRestaurant[] = topData.map((r) => ({
    id: r.id,
    name: r.name,
    display_name: r.display_name ?? null,
    neighborhood: r.neighborhood,
    cuisine: r.cuisine,
    score: r.score,
    slug: r.slug ?? null,
    hasGfFryer: r.dossier?.operations?.dedicated_equipment?.fryer === true,
    isDedicatedGf: r.dossier?.operations?.cross_contamination_risk === "low",
    gf_food_categories: r.gf_food_categories ?? null,
    place_type: r.place_type ?? null,
  }));

  if (topRated.length === 0) return null;
  return <TopRatedSection restaurants={topRated} city={topRatedCity} />;
}

// ── Top rated skeleton (shown while PageContent resolves) ────────────────────
function TopRatedSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 mt-8 md:mt-12 pb-24 md:pb-32">
      <div className="h-5 w-40 rounded bg-surface-overlay mb-6 animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-surface-overlay">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-surface-base h-40 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

// ── Page shell ───────────────────────────────────────────────────────────────

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";

  return (
    <main className="pt-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(HOME_JSON_LD) }}
      />

      {/* LocationBanner — deferred, doesn't block hero */}
      <Suspense fallback={null}>
        <LocationBannerServer />
      </Suspense>

      {/* Hero — static shell renders immediately; count streams in */}
      <section className="grid-bg min-h-[280px] md:min-h-[400px] flex flex-col items-center justify-center px-6 pt-8 md:pt-12 relative pb-6 md:pb-16">
        <div className="absolute bottom-0 left-0 right-0 h-16 md:h-24 pointer-events-none" style={{ background: "linear-gradient(to bottom, transparent, var(--surface-base))" }} />
        <div className="max-w-3xl md:max-w-5xl lg:max-w-6xl w-full text-center space-y-6 md:space-y-8">
          <div>
            {/* h1 is fully static — paints on first byte */}
            <h1
              className="font-[family-name:var(--font-display)] leading-none"
              style={{ fontSize: "clamp(3.5rem, 10vw, 7rem)", letterSpacing: "0.02em" }}
            >
              Ask anything.
              <br />
              <span style={{ color: "var(--accent)" }}>Eat gluten-free with confidence.</span>
            </h1>
            {/* Count streams in — placeholder holds space */}
            <Suspense fallback={<p className="mt-5 h-4 opacity-0">placeholder</p>}>
              <HeroCount />
            </Suspense>
          </div>

          <HomeAskInput />
        </div>
      </section>

      {/* Top rated / search results — deferred */}
      <Suspense fallback={!query ? <TopRatedSkeleton /> : null}>
        <PageContent query={query} cityParam={params.city} />
      </Suspense>
    </main>
  );
}
