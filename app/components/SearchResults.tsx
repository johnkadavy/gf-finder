import { supabase } from "@/lib/supabase";
import type { CityAccess } from "@/lib/cities";
import { getGaugeColor, getScoreLabel, type ScoringDossier, type VerifiedData } from "@/lib/score";
import { getNycLandingIndex, matchCategory, matchNeighborhoods, type LandingLink } from "@/lib/landing-index";
import { SearchResultsShown, TrackedResultLink } from "./SearchTracking";

export const RESULTS_PAGE_SIZE = 20;
// Results below this score are grouped at the end behind an explicit "Show".
const STRONG_SCORE = 55;

type Dossier = ScoringDossier & {
  summary?: { short_summary?: string };
};

type ResultRow = {
  id: number;
  name: string;
  city: string;
  neighborhood: string | null;
  slug: string | null;
  score: number | null;
  dossier: Dossier | null;
  verified_data: VerifiedData | null;
};

const RESULT_COLUMNS = "id, name, city, neighborhood, slug, score, dossier, verified_data";

function buildHighlights(r: ResultRow): string[] {
  const d = r.dossier;
  const out: string[] = [];
  const labeling = r.verified_data?.menu?.gf_labeling ?? d?.menu?.gf_labeling;
  if (labeling === "clear") out.push("Menu labeled");
  if (d?.operations?.dedicated_equipment?.fryer === true) out.push("Dedicated fryer");
  if (d?.operations?.dedicated_equipment?.prep_area === "dedicated") out.push("Dedicated prep area");
  return out;
}

function resultsHref(query: string, cityParam: string | undefined, n: number, low: boolean): string {
  const p = new URLSearchParams({ q: query });
  if (cityParam && cityParam !== "all") p.set("city", cityParam);
  p.set("n", String(n));
  if (low) p.set("low", "1");
  return `/?${p.toString()}`;
}

const secLabel = "font-mono text-ui-sm font-medium uppercase tracking-label text-text-tertiary";

export async function SearchResults({
  query,
  cityParam,
  selectedCity,
  cityAccess,
  n,
  showLow,
}: {
  query: string;
  cityParam?: string;
  selectedCity: string;
  cityAccess: CityAccess;
  n: number;
  showLow: boolean;
}) {
  // PostgREST .or() uses commas/parens as syntax — strip them from the term.
  const term = query.replace(/[,()*%\\"]/g, " ").replace(/\s+/g, " ").trim();

  const scoped = <T,>(q: T): T => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let b = (q as any).or(`name.ilike.%${term}%,neighborhood.ilike.%${term}%,cuisine.ilike.%${term}%`);
    if (selectedCity !== "all") b = b.eq("city", selectedCity);
    else if (!cityAccess.isAdmin) b = b.in("city", cityAccess.allowedCities);
    return b as T;
  };

  const nycEligible =
    (selectedCity === "all" || selectedCity === "New York") &&
    (cityAccess.isAdmin || cityAccess.allowedCities.includes("New York"));

  let rowsQuery = scoped(supabase.from("restaurants").select(RESULT_COLUMNS));
  if (!showLow) rowsQuery = rowsQuery.gte("score", STRONG_SCORE);
  rowsQuery = rowsQuery
    .order("score", { ascending: false, nullsFirst: false })
    .order("name")
    .range(0, n - 1);

  const [rowsRes, totalRes, strongRes, landingIndex] = term
    ? await Promise.all([
        rowsQuery,
        scoped(supabase.from("restaurants").select("id", { count: "exact", head: true })),
        scoped(supabase.from("restaurants").select("id", { count: "exact", head: true })).gte("score", STRONG_SCORE),
        nycEligible ? getNycLandingIndex() : Promise.resolve(null),
      ])
    : [null, null, null, nycEligible ? await getNycLandingIndex() : null];

  const rows = ((rowsRes?.error ? [] : rowsRes?.data) ?? []) as ResultRow[];
  const total = totalRes?.count ?? rows.length;
  const strong = strongRes?.count ?? rows.filter((r) => (r.score ?? 0) >= STRONG_SCORE).length;
  const weak = Math.max(0, total - strong);

  // Landing-page shortcuts ("pizza" → GF Pizza guide, "west village" → neighborhood page)
  const shortcuts: LandingLink[] = [];
  if (landingIndex) {
    shortcuts.push(...matchNeighborhoods(query, landingIndex.neighborhoods, 1).filter((nb) =>
      query.toLowerCase().includes(nb.label.toLowerCase()) || nb.label.toLowerCase().startsWith(query.toLowerCase().trim()),
    ));
    const cat = matchCategory(query, landingIndex.categories);
    if (cat) shortcuts.push(cat);
  }

  const shortcutList = shortcuts.length > 0 && (
    <div className="space-y-2 mb-4">
      {shortcuts.map((s) => (
        <TrackedResultLink
          key={s.href}
          href={s.href}
          event={{ query, kind: "guide", href: s.href }}
          className="flex items-center justify-between gap-3 min-h-14 px-4 py-2.5 border transition-colors hover:border-accent"
          style={{ borderColor: "var(--accent-tint-xl)", backgroundColor: "var(--accent-tint-sm)" }}
        >
          <span className="min-w-0">
            <span
              className="block font-[family-name:var(--font-display)] leading-tight text-text-primary"
              style={{ fontSize: "clamp(1.15rem, 3.2vw, 1.5rem)", letterSpacing: "0.02em" }}
            >
              {s.emoji && <span className="mr-2" aria-hidden="true">{s.emoji}</span>}
              {s.emoji ? `Best ${s.label} in NYC` : `Gluten-free in ${s.label}`}
            </span>
            <span className="block font-mono text-ui-sm uppercase tracking-label text-text-label mt-0.5">
              {s.count} spots rated 75+
            </span>
          </span>
          <span className="font-mono text-ui-xl text-accent shrink-0" aria-hidden="true">→</span>
        </TrackedResultLink>
      ))}
    </div>
  );

  const sectionClass = "max-w-4xl mx-auto px-4 md:px-8 pt-4 md:pt-6 pb-10";

  // ── No match ──────────────────────────────────────────────────────────────
  if (total === 0) {
    const cat = landingIndex ? matchCategory(query, landingIndex.categories) : null;
    const dedicated = landingIndex?.categories.find((c) => c.slug === "dedicated");
    const related = [cat, dedicated && dedicated.href !== cat?.href ? dedicated : null].filter(Boolean) as LandingLink[];
    return (
      <section className={sectionClass}>
        <SearchResultsShown query={query} resultCount={0} strongCount={0} shown={0} city={selectedCity} />
        <div className="max-w-xl py-4 md:py-10">
          <p className={secLabel}>No restaurant by that name</p>
          <h2
            className="font-[family-name:var(--font-display)] leading-none mt-3"
            style={{ fontSize: "clamp(2rem, 6vw, 3rem)", letterSpacing: "0.02em" }}
          >
            Sounds like a question.
          </h2>
          <p className="font-sans text-ui-2xl leading-normal text-text-secondary mt-3">
            Search matches restaurant names, neighborhoods and cuisines. For &ldquo;{query}&rdquo;, CleanPlate can answer directly.
          </p>
          <TrackedResultLink
            href={`/ask?q=${encodeURIComponent(query)}`}
            event={{ query, kind: "ask" }}
            className="mt-5 flex items-center justify-center h-13 px-4 font-mono text-ui-md uppercase tracking-label"
            style={{ backgroundColor: "var(--accent)", color: "var(--accent-foreground)" }}
          >
            <span className="truncate">Ask: &ldquo;{query}&rdquo; →</span>
          </TrackedResultLink>

          <p className={`${secLabel} mt-8 mb-2`}>Related</p>
          <div className="space-y-2">
            {[...related, { label: "Top-rated overall", href: "/rankings", count: -1 } as LandingLink].map((l) => (
              <TrackedResultLink
                key={l.href}
                href={l.href}
                event={{ query, kind: "related", href: l.href }}
                className="flex items-center justify-between gap-3 min-h-13 px-4 border transition-colors hover:border-accent"
                style={{ borderColor: "var(--border-default)", backgroundColor: "var(--surface-raised)" }}
              >
                <span className="font-mono text-ui-md uppercase tracking-label text-text-label">
                  {l.emoji && <span className="mr-2" aria-hidden="true">{l.emoji}</span>}
                  {l.label}
                </span>
                <span className="font-mono text-ui-md uppercase tracking-label text-text-dim shrink-0">
                  {l.count >= 0 ? `${l.count} spots →` : "→"}
                </span>
              </TrackedResultLink>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // ── Results ───────────────────────────────────────────────────────────────
  const shownStrong = rows.filter((r) => (r.score ?? -1) >= STRONG_SCORE).length;
  const hasMore = rows.length < (showLow ? total : strong);
  const firstWeakIndex = rows.findIndex((r) => (r.score ?? -1) < STRONG_SCORE);

  return (
    <section className={sectionClass}>
      <SearchResultsShown query={query} resultCount={total} strongCount={strong} shown={rows.length} city={selectedCity} />

      <div className="flex items-baseline justify-between gap-4 pb-3">
        <span className={secLabel}>
          {total.toLocaleString()} match{total !== 1 ? "es" : ""}
        </span>
        <span className="font-mono text-ui-sm uppercase tracking-label text-text-dim">
          Sorted by <span className="text-text-label">GF safety</span>
        </span>
      </div>

      {shortcutList}

      <ol className="border-b" style={{ borderColor: "var(--border-subtle)" }}>
        {rows.map((r, i) => {
          const color = getGaugeColor(r.score);
          const { label } = getScoreLabel(r.score);
          const summary = r.dossier?.summary?.short_summary;
          const highlights = buildHighlights(r);
          const sickCount = r.dossier?.reviews?.sick_reports_recent ?? 0;
          const place = r.neighborhood ?? r.city;

          return (
            <li key={r.id}>
              {i === firstWeakIndex && (
                <p className={`${secLabel} pt-6 pb-3 border-t`} style={{ borderColor: "var(--border-subtle)" }}>
                  Limited, risky, or unknown GF practices
                </p>
              )}
              <TrackedResultLink
                href={`/restaurant/${r.slug ?? r.id}`}
                event={{ query, kind: "restaurant", position: i, restaurant_id: r.id, score: r.score }}
                className="group flex gap-4 py-4 md:py-5 border-t transition-colors"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                {/* Score */}
                <div className="w-14 shrink-0 flex flex-col items-center pt-0.5" style={{ color }}>
                  <span className="font-[family-name:var(--font-display)] text-4xl leading-none" style={{ letterSpacing: "0.02em" }}>
                    {r.score ?? "—"}
                  </span>
                  <span className="relative w-full h-0.5 mt-1" style={{ backgroundColor: "var(--border-subtle)" }} aria-hidden="true">
                    <span className="absolute inset-y-0 left-0" style={{ width: `${r.score ?? 0}%`, backgroundColor: color }} />
                  </span>
                  <span className="font-mono text-ui-xs uppercase tracking-snug text-center leading-tight mt-1.5">
                    {label}
                  </span>
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0">
                  {place && (
                    <p className="font-mono text-ui-sm uppercase tracking-label text-text-dim truncate">{place}</p>
                  )}
                  <h3
                    className="font-[family-name:var(--font-display)] leading-none mt-1 mb-1.5 text-text-primary group-hover:text-accent transition-colors"
                    style={{ fontSize: "clamp(1.5rem, 4vw, 1.9rem)", letterSpacing: "0.02em" }}
                  >
                    {r.name}
                  </h3>
                  {summary && (
                    <p className="font-sans text-ui-xl leading-snug text-text-secondary line-clamp-2 max-w-xl">
                      {summary}
                    </p>
                  )}
                  {highlights.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {highlights.map((h) => (
                        <span
                          key={h}
                          className="inline-flex items-center px-2 py-1 font-mono text-ui-sm uppercase tracking-snug border"
                          style={{ color: "var(--signal-positive)", borderColor: "var(--signal-border-positive)" }}
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                  )}
                  {sickCount > 0 && (
                    <p className="flex items-center gap-2 mt-2.5 font-mono text-ui-sm uppercase tracking-label text-accent">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" aria-hidden="true" />
                      {sickCount} illness report{sickCount > 1 ? "s" : ""} · past 6 months
                    </p>
                  )}
                </div>
              </TrackedResultLink>
            </li>
          );
        })}
      </ol>

      {hasMore && (
        <TrackedResultLink
          href={resultsHref(query, cityParam, n + RESULTS_PAGE_SIZE, showLow)}
          event={{ query, kind: "show_more", shown: rows.length }}
          scroll={false}
          className="mt-4 flex items-center justify-center min-h-13 border font-mono text-ui-md uppercase tracking-label text-text-label transition-colors hover:border-accent hover:text-accent"
          style={{ borderColor: "var(--border-emphasis)" }}
        >
          Show {Math.min(RESULTS_PAGE_SIZE, (showLow ? total : strong) - rows.length)} more
        </TrackedResultLink>
      )}

      {!showLow && !hasMore && weak > 0 && (
        <TrackedResultLink
          href={resultsHref(query, cityParam, Math.max(n, shownStrong) + RESULTS_PAGE_SIZE, true)}
          event={{ query, kind: "show_low", weak }}
          scroll={false}
          className="mt-4 flex items-center justify-between gap-3 min-h-14 px-4 py-3 border border-dashed transition-colors hover:border-accent"
          style={{ borderColor: "var(--border-emphasis)" }}
        >
          <span className="font-mono text-ui-md uppercase tracking-label text-text-label leading-normal">
            {strong === 0 ? "No strong matches · " : ""}
            <span style={{ color: "var(--signal-negative)" }}>{weak.toLocaleString()} {strong === 0 ? "" : "more "}</span>
            with limited, risky, or unknown GF practices
          </span>
          <span className="font-mono text-ui-md uppercase tracking-label text-text-dim shrink-0">Show ▾</span>
        </TrackedResultLink>
      )}
    </section>
  );
}

export function SearchResultsSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 pt-4 md:pt-6 pb-10" aria-hidden="true">
      <div className="h-3 w-28 bg-surface-overlay mb-4 animate-pulse" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-4 py-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="w-14 h-12 bg-surface-overlay animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 bg-surface-overlay animate-pulse" />
            <div className="h-6 w-3/5 bg-surface-overlay animate-pulse" />
            <div className="h-3 w-full bg-surface-overlay animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
