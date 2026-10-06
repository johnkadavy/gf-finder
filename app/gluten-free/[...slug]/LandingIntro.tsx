import Link from "next/link";
import { parseCopy, resolveTokenHref, type CityLandingIndex } from "@/lib/landing-copy";

/**
 * Renders generated intro copy (public.landing_copy). Link tokens become links
 * only if the target page exists right now; otherwise their label renders as
 * plain text — so stored copy can never produce a broken link.
 */
export function LandingIntro({
  body,
  generatedAt,
  citySlug,
  nbhdSlug,
  index,
  restaurantSlugs,
}: {
  body: string;
  generatedAt: string;
  citySlug: string;
  nbhdSlug?: string;
  index: CityLandingIndex;
  /** slugs of the restaurants this page lists — restaurant links only resolve to these */
  restaurantSlugs: string[];
}) {
  const paragraphs = parseCopy(body);
  const slugSet = new Set(restaurantSlugs);
  const updated = new Date(generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="max-w-2xl space-y-3 md:space-y-4">
      {paragraphs.map((segments, i) => (
        <p key={i} className="font-sans text-ui-2xl md:text-ui-body leading-normal md:leading-[1.75] text-text-secondary">
          {segments.map((seg, j) => {
            if ("text" in seg) return <span key={j}>{seg.text}</span>;
            const href = resolveTokenHref(seg, { citySlug, nbhdSlug, index, restaurantSlugs: slugSet });
            return href ? (
              <Link
                key={j}
                href={href}
                className="text-text-primary underline decoration-accent decoration-[1.5px] underline-offset-4 transition-colors hover:text-accent"
              >
                {seg.label}
              </Link>
            ) : (
              <span key={j}>{seg.label}</span>
            );
          })}
        </p>
      ))}
      <p className="font-mono text-ui-sm uppercase tracking-label text-text-dim pt-1">
        Updated {updated}
      </p>
    </div>
  );
}
