import { RankingsListSkeleton } from "./RankingsList";

/**
 * Route-level loading UI. The App Router renders this instantly on navigation
 * (client-side, no server round-trip) while the dynamic, auth-gated rankings
 * page streams in — and it makes <Link> prefetch effective. The hero shell
 * mirrors page.tsx exactly so the real page swaps in with no layout shift.
 */
export default function Loading() {
  return (
    <main className="pt-16">
      {/* Hero — mirrors app/rankings/page.tsx */}
      <section
        className="grid-bg border-b px-4 md:px-8 py-8 md:py-24 relative"
        style={{ borderColor: "var(--border-default)" }}
      >
        <div
          className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, var(--surface-base))" }}
        />
        <div className="max-w-6xl mx-auto">
          <p className="font-mono text-ui-sm uppercase tracking-stamp text-text-label mb-3 md:mb-6">
            CleanPlate Rankings
          </p>
          <h1
            className="font-[family-name:var(--font-display)] leading-none mb-6 md:mb-10"
            style={{ fontSize: "clamp(2.25rem, 8vw, 5.5rem)", letterSpacing: "0.02em" }}
          >
            Top Gluten-Free<br /><span style={{ color: "var(--accent)" }}>Restaurants</span>
          </h1>

          {/* Location filter row placeholder */}
          <div className="flex flex-wrap gap-3 animate-pulse">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-11 w-32 rounded"
                style={{ backgroundColor: "var(--border-subtle)" }}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Rankings list */}
      <section className="px-4 md:px-8 pb-32 mt-8">
        <div className="max-w-6xl mx-auto">
          {/* Secondary filter row placeholder */}
          <div className="flex flex-wrap gap-3 mb-8 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-9 w-24 rounded"
                style={{ backgroundColor: "var(--border-subtle)" }}
              />
            ))}
          </div>
          <RankingsListSkeleton />
        </div>
      </section>
    </main>
  );
}
