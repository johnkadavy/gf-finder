import Link from "next/link";
import type { ReactNode } from "react";
import { getGaugeColor, getScoreLabel, type ScoringDossier, type VerifiedData } from "@/lib/score";
import { isNewRestaurant, formatLocation } from "@/lib/utils";
import { getHighlights, HIGHLIGHT_LABELS } from "@/lib/highlights";
import { cuisineFilterKey } from "@/lib/cuisine";
import { ScoreBadge } from "./ScoreBadge";

/**
 * Shared ranked-list presentation used by /rankings and the /gluten-free SEO
 * pages. Pure presentational server component — no data fetching, no filter
 * logic, no imports from app/rankings (keep it that way; see
 * RANKINGS_UI_MIGRATION.md).
 *
 * Mobile vs desktop: every row change for phones is scoped below `md` —
 * the desktop row layout is intentionally unchanged.
 * Rows carry data-* flags (excellent / fryer / labeled / kitchen, cuisine) so
 * RankedListFilters can filter in place with CSS (see globals.css).
 */

export type RankedRestaurant = {
  id: number;
  name: string;
  display_name: string | null;
  slug: string | null;
  score: number;
  city?: string | null;
  neighborhood: string | null;
  region?: string | null;
  cuisine?: string | null;
  dossier: (ScoringDossier & { summary?: { short_summary?: string } }) | null;
  source?: string | null;
  ingested_at?: string | null;
  dedicated_gf_kitchen?: string | null;
  verified_data?: VerifiedData | null;
};

type Props = {
  restaurants: RankedRestaurant[];
  /** Full text of the count header, e.g. "Showing 25 of 312 Restaurants — West Village" */
  countLabel: string;
  /** Second line under the name. Defaults to neighborhood / city / region. */
  metaLine?: (r: RankedRestaurant) => string;
  /** Renders the Load More link when set. */
  loadMoreHref?: string;
  /** Block rendered inside the list after the given number of rows (e.g. a follow prompt). */
  inlineSlot?: { afterRow: number; node: ReactNode };
};

export function RankedList({ restaurants, countLabel, metaLine, loadMoreHref, inlineSlot }: Props) {
  const meta =
    metaLine ?? ((r: RankedRestaurant) => formatLocation(r.neighborhood, r.city ?? "", r.region ?? null));

  return (
    <div className="space-y-0">
      {/* Count header */}
      <div
        className="flex items-center justify-between py-4 border-b"
        style={{ borderColor: "var(--border-default)" }}
      >
        <span className="font-mono text-ui-sm uppercase tracking-stamp text-text-tertiary">
          {countLabel}
        </span>
      </div>

      {restaurants.map((restaurant, index) => {
        const color = getGaugeColor(restaurant.score);
        const rank = index + 1;
        const metaText = meta(restaurant);
        const { label: verdict } = getScoreLabel(restaurant.score);
        const highlights = getHighlights(restaurant);

        return (
          <div key={restaurant.id} className="contents">
            {inlineSlot && index === inlineSlot.afterRow && restaurants.length > inlineSlot.afterRow && (
              <div className="border-b" style={{ borderColor: "var(--border-subtle)" }}>
                {inlineSlot.node}
              </div>
            )}
            <Link
              href={restaurant.slug ? `/restaurant/${restaurant.slug}` : `/restaurant/${restaurant.id}`}
              data-rl-row=""
              data-excellent={restaurant.score >= 85 ? "" : undefined}
              data-fryer={highlights.includes("fryer") ? "" : undefined}
              data-labeled={highlights.includes("labeled") ? "" : undefined}
              data-kitchen={highlights.includes("kitchen") ? "" : undefined}
              data-cuisine={cuisineFilterKey(restaurant.cuisine) ?? undefined}
              className="group grid grid-cols-[1.75rem_1fr_auto] md:grid-cols-[5rem_1fr_auto] items-start md:items-center border-b gap-2.5 md:gap-10 py-3.5 md:py-6 pl-3 pr-4 md:px-6 transition-colors duration-150 hover:bg-surface-raised"
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
                      className="font-[family-name:var(--font-display)] leading-tight line-clamp-2 md:line-clamp-1 md:truncate [--rl-name:1.55rem] md:[--rl-name:clamp(1.15rem,2.5vw,2.1rem)]"
                      style={{
                        fontSize: "var(--rl-name)",
                        letterSpacing: "0.02em",
                        color: "var(--text-primary)",
                      }}
                    >
                      {restaurant.display_name ?? restaurant.name}
                    </span>
                    <span
                      className="absolute bottom-0 left-0 h-px w-0 group-hover:w-full transition-all duration-300"
                      style={{ backgroundColor: color }}
                    />
                  </div>
                  {isNewRestaurant(restaurant.source ?? null, restaurant.ingested_at ?? null) && (
                    <span className="font-mono text-ui-xs uppercase tracking-editorial px-1.5 py-0.5 shrink-0" style={{ backgroundColor: "var(--accent-tint-md)", color: "var(--accent)", border: "1px solid var(--accent-tint-lg)" }}>
                      New
                    </span>
                  )}
                </div>
                {metaText && (
                  <p className="font-mono text-ui-sm md:text-ui-md uppercase tracking-label md:tracking-editorial text-text-dim md:text-text-label mt-1 md:mt-2 truncate">
                    {metaText}
                  </p>
                )}
                {restaurant.dossier?.summary?.short_summary && (
                  <>
                    <p className="md:hidden font-sans text-ui-xl leading-snug text-text-secondary mt-1.5 line-clamp-2">
                      {restaurant.dossier.summary.short_summary}
                    </p>
                    <p className="hidden md:block text-ui-xl leading-[1.7] text-text-secondary mt-2 max-w-xl">
                      {restaurant.dossier.summary.short_summary}
                    </p>
                  </>
                )}
                {/* Highlights — mobile only (desktop row unchanged) */}
                {highlights.length > 0 && (
                  <div className="md:hidden flex flex-wrap gap-1.5 mt-2">
                    {highlights.map((h) => (
                      <span
                        key={h}
                        className="inline-flex items-center px-1.5 py-0.5 font-mono text-ui-sm uppercase tracking-snug border"
                        style={{ color: "var(--signal-positive)", borderColor: "var(--signal-border-positive)" }}
                      >
                        {HIGHLIGHT_LABELS[h]}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Score — ScoreBadge hides its verdict below md, so add it back on phones */}
              <div className="flex flex-col items-end shrink-0">
                <ScoreBadge score={restaurant.score} />
                <span
                  className="md:hidden max-w-16 mt-1 font-mono text-ui-xs uppercase tracking-snug leading-tight text-right"
                  style={{ color }}
                >
                  {verdict}
                </span>
              </div>
            </Link>
          </div>
        );
      })}

      {/* Load More */}
      {loadMoreHref && (
        <div className="flex justify-center pt-10 pb-2">
          <Link
            href={loadMoreHref}
            scroll={false}
            className="font-mono text-ui-md uppercase tracking-editorial px-8 py-3.5 border transition-colors duration-150 text-text-tertiary hover:text-text-primary"
            style={{ borderColor: "var(--border-emphasis)" }}
          >
            Load More
          </Link>
        </div>
      )}
    </div>
  );
}
