"use client";

import Link from "next/link";

/**
 * Shown when a landing page's data fetch fails (e.g. a Supabase timeout).
 * The page throws instead of calling notFound() so a database outage never
 * caches a 404 for a real page; ISR keeps serving the last good render where
 * one exists, so this only appears on uncached pages.
 */
export default function LandingError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const buttonClass =
    "inline-flex items-center justify-center min-h-13 md:min-h-0 px-4 py-3 border font-mono text-ui-sm uppercase tracking-label transition-colors duration-150 hover:border-accent hover:text-accent";

  return (
    <main className="pt-16">
      <div className="max-w-6xl mx-auto px-4 md:px-8 pt-12 md:pt-20">
        <h1
          className="font-[family-name:var(--font-display)] leading-none mb-4 text-text-primary"
          style={{ fontSize: "clamp(2rem, 6vw, 4rem)" }}
        >
          This page didn&apos;t load
        </h1>
        <p className="mb-8 text-text-secondary" style={{ fontSize: "var(--font-size-lg)" }}>
          We couldn&apos;t reach our restaurant data just now. Try again in a moment.
        </p>
        <div className="flex flex-col md:flex-row gap-3">
          <button type="button" onClick={reset} className={buttonClass} style={{ borderColor: "var(--border-default)" }}>
            Try again
          </button>
          <Link href="/rankings" className={buttonClass} style={{ borderColor: "var(--border-default)" }}>
            Browse all rankings
          </Link>
        </div>
      </div>
    </main>
  );
}
