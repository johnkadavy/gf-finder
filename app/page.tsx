import { cache, Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { createClient } from "@/lib/supabase-server";
import { SearchForm } from "./components/SearchForm";
import { ExploreSection } from "./components/ExploreSection";
import { SearchResults, SearchResultsSkeleton, RESULTS_PAGE_SIZE } from "./components/SearchResults";
import { getCityAccess, resolveCity } from "@/lib/cities";
import { getNycLandingIndex, type LandingLink } from "@/lib/landing-index";
import { FollowPrompt } from "@/app/gluten-free/[...slug]/FollowPrompt";

export type QuickLink = LandingLink;

type HomePageProps = {
  searchParams: Promise<{ q?: string; city?: string; n?: string; low?: string }>;
};

// Content depends entirely on searchParams (query/city/pagination), so this
// route is never actually static. Without this, the build attempts a static
// prerender pass for "/" that hangs/times out on the Suspense-deferred
// Supabase-backed content instead of just skipping straight to per-request
// dynamic rendering (how it always ran anyway).
export const dynamic = "force-dynamic";

// ── Page metadata ────────────────────────────────────────────────────────────

export async function generateMetadata(): Promise<Metadata> {
  const totalCount = await getNycRatedCount();
  const roundedCount = Math.floor(totalCount / 100) * 100;
  const countPrefix = roundedCount > 0 ? `${roundedCount.toLocaleString()}+ ` : "";
  return {
    title: "CleanPlate — NYC's Gluten-Free Restaurant Guide",
    description: `${countPrefix}NYC restaurants rated for gluten-free safety. Find celiac-safe dining with dedicated fryers, clear menu labeling, and low cross-contamination risk.`,
    alternates: { canonical: "/" },
    openGraph: {
      title: "CleanPlate — NYC's Gluten-Free Restaurant Guide",
      description: `${countPrefix}NYC restaurants rated for GF safety. No guessing.`,
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

// NYC rated-restaurant count for the hero + metadata.
// Kept OUT of unstable_cache and computed per request (React cache dedupes
// within a request) using an estimated, index-based count. The old version
// cached an exact count for an hour, so a single transient 0/null response got
// served as "0+ restaurants" until the cache expired. Estimated + no long-lived
// cache avoids that poisoning; callers still guard against a 0 for display.
const getNycRatedCount = cache(async (): Promise<number> => {
  const { count } = await supabase
    .from("restaurants")
    .select("*", { count: "estimated", head: true })
    .eq("city", "New York")
    .not("score", "is", null);
  return count ?? 0;
});

// Homepage explore tiles — top slices of the shared landing-page index.
async function getNycQuickLinks(): Promise<{ neighborhoods: QuickLink[]; categories: QuickLink[] }> {
  const { neighborhoods, categories } = await getNycLandingIndex();
  return { neighborhoods: neighborhoods.slice(0, 8), categories: categories.slice(0, 8) };
}

// ── Async server components (each deferred behind Suspense) ──────────────────

async function HeroCount() {
  const totalCount = await getNycRatedCount();
  const roundedCount = Math.floor(totalCount / 100) * 100;
  return (
    <p className="font-mono text-ui-md tracking-snug text-text-dim mt-3">
      {roundedCount > 0
        ? `${roundedCount.toLocaleString()}+ NYC restaurants rated for gluten-free safety`
        : "NYC restaurants rated for gluten-free safety"}
    </p>
  );
}

async function PageContent({ query, cityParam, n, showLow }: { query: string; cityParam?: string; n: number; showLow: boolean }) {
  const { cityAccess } = await getRequestAuth();
  const selectedCity = resolveCity(cityParam, cityAccess);
  const topRatedCity = selectedCity !== "all" ? selectedCity : cityAccess.defaultCity;

  // ── Search mode ────────────────────────────────────────────────────────────
  if (query) {
    return (
      <SearchResults
        query={query}
        cityParam={cityParam}
        selectedCity={selectedCity}
        cityAccess={cityAccess}
        n={n}
        showLow={showLow}
      />
    );
  }

  // ── Explore mode (no search yet) ─────────────────────────────────────────────
  const quickLinks = topRatedCity === "New York"
    ? await getNycQuickLinks()
    : { neighborhoods: [], categories: [] };
  return (
    <ExploreSection
      neighborhoods={quickLinks.neighborhoods}
      categories={quickLinks.categories}
    />
  );
}

// ── Top rated skeleton (shown while PageContent resolves) ────────────────────
function TopRatedSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 mt-8 md:mt-12 pb-24 md:pb-32">
      <div className="h-5 w-40 bg-surface-overlay mb-6 animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-surface-overlay">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-surface-base h-40 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

// ── Page shell ───────────────────────────────────────────────────────────────

function parsePageSize(raw: string | undefined): number {
  const v = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(v) || v < RESULTS_PAGE_SIZE) return RESULTS_PAGE_SIZE;
  return Math.min(v, 400);
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const n = parsePageSize(params.n);
  const showLow = params.low === "1";

  return (
    <main className="pt-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(HOME_JSON_LD) }}
      />

      {query ? (
        /* Results mode — compact search bar pinned under the header so the
           first result is above the fold on phones (no hero). */
        <div
          className="sticky top-16 z-40 border-b"
          style={{ backgroundColor: "var(--surface-base)", borderColor: "var(--border-subtle)" }}
        >
          <div className="max-w-4xl mx-auto px-4 md:px-8 py-2">
            <SearchForm initialQuery={query} selectedCity={params.city ?? "all"} variant="compact" />
          </div>
        </div>
      ) : (
        /* Hero — static shell renders immediately; count streams in */
        <section className="grid-bg min-h-[280px] md:min-h-[400px] flex flex-col items-center justify-center px-5 pt-8 md:pt-12 relative pb-6 md:pb-16">
          <div className="absolute bottom-0 left-0 right-0 h-16 md:h-24 pointer-events-none" style={{ background: "linear-gradient(to bottom, transparent, var(--surface-base))" }} />
          <div className="max-w-3xl md:max-w-5xl lg:max-w-6xl w-full text-center space-y-6 md:space-y-8">
            <div>
              {/* h1 is fully static — paints on first byte */}
              <h1
                className="font-[family-name:var(--font-display)] leading-none"
                style={{ fontSize: "clamp(3.5rem, 10vw, 7rem)", letterSpacing: "0.02em" }}
              >
                Know before
                <br />
                <span style={{ color: "var(--accent)" }}>you go.</span>
              </h1>
              <p className="font-sans text-ui-2xl md:text-ui-body leading-normal text-text-secondary mt-5">
                Gluten-free safety scores for any restaurant in NYC.
              </p>
              {/* Count streams in — placeholder holds space */}
              <Suspense fallback={<p className="mt-3 h-4 opacity-0">placeholder</p>}>
                <HeroCount />
              </Suspense>
            </div>

            <div className="space-y-3">
              <SearchForm initialQuery={query} selectedCity={params.city ?? "all"} variant="hero" />
              <p className="font-mono text-ui-sm tracking-snug text-text-dim">
                Have a more specific question?{" "}
                <Link href="/ask" className="text-accent hover:underline">Ask CleanPlate →</Link>
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Explore tiles / search results — deferred */}
      <Suspense fallback={query ? <SearchResultsSkeleton /> : <TopRatedSkeleton />}>
        <PageContent query={query} cityParam={params.city} n={n} showLow={showLow} />
      </Suspense>

      {/* Subscribe to the NYC digest — top-of-funnel capture.
          Last section on the page: clears the fixed mobile tab bar + home indicator. */}
      <section className="max-w-3xl mx-auto px-4 md:px-8 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] md:pb-16">
        <FollowPrompt variant="section" source="homepage" />
      </section>
    </main>
  );
}
