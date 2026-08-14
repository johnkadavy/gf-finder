/**
 * App-wide loading fallback. The App Router shows this instantly on navigation
 * (client-side, no server round-trip) for any route without its own loading.tsx
 * — search, map, about, restaurant detail, the gluten-free pages, etc. Routes
 * with a tailored skeleton (e.g. /rankings) override this automatically.
 *
 * Kept deliberately neutral and content-shaped (title, bar, tile grid) so it
 * reads as "page loading" on any route rather than mimicking one specific page.
 * The persistent chrome (top header, mobile bottom nav) lives in the layout
 * outside {children}, so it stays put while only this content area swaps in.
 */
export default function Loading() {
  return (
    <main className="pt-16" aria-busy="true" aria-label="Loading">
      <div className="max-w-6xl mx-auto px-4 md:px-8 pt-12 md:pt-20 animate-pulse">
        {/* Title */}
        <div
          className="h-10 md:h-16 w-2/3 rounded mb-6"
          style={{ backgroundColor: "var(--border-subtle)" }}
        />
        {/* Subtitle */}
        <div
          className="h-4 w-1/2 rounded mb-10"
          style={{ backgroundColor: "var(--surface-overlay)" }}
        />
        {/* Primary bar (search / filter row) */}
        <div
          className="h-12 w-full rounded mb-10"
          style={{ backgroundColor: "var(--border-subtle)" }}
        />
        {/* Tile / row grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-28 rounded"
              style={{ backgroundColor: "var(--border-subtle)" }}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
