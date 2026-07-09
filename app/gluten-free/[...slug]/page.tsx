import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { getGaugeColor } from "@/lib/score";
import type { ScoringDossier } from "@/lib/score";
import { ScoreBadge } from "@/app/components/ScoreBadge";
import { isNewRestaurant } from "@/lib/utils";
import { RankedList, type RankedRestaurant } from "@/app/components/RankedList";
import { lookupBorough } from "@/lib/borough-lookup";
import { FollowPrompt } from "./FollowPrompt";
import { StatStrip, type TableRestaurant } from "./StatStrip";
import { CATEGORIES, applyCategoryFilter, toSlug } from "@/lib/categories";
import type { CategoryDef } from "@/lib/categories";

export const revalidate = 86400; // regenerate at most once per 24 hours

const TABLE_LAYOUT_MIN_RESULTS = 8;


// ── Structured data ───────────────────────────────────────────────────────────

const BASE_URL = "https://trycleanplate.com";

function buildPageJsonLd({
  pageUrl,
  name,
  description,
  breadcrumbs,
  restaurants,
}: {
  pageUrl: string;
  name: string;
  description: string;
  breadcrumbs: Array<{ name: string; item?: string }>;
  restaurants: RestaurantRow[];
}) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "itemListElement": breadcrumbs.map((b, i) => ({
          "@type": "ListItem",
          "position": i + 1,
          "name": b.name,
          ...(b.item ? { "item": b.item } : {}),
        })),
      },
      {
        "@type": "CollectionPage",
        "name": name,
        "description": description,
        "url": `${BASE_URL}${pageUrl}`,
        "numberOfItems": restaurants.length,
        "mainEntity": {
          "@type": "ItemList",
          "numberOfItems": restaurants.length,
          "itemListElement": restaurants.map((r, i) => ({
            "@type": "ListItem",
            "position": i + 1,
            "item": {
              "@type": "Restaurant",
              "name": r.display_name ?? r.name,
              "url": `${BASE_URL}/restaurant/${r.slug ?? r.id}`,
              ...(r.neighborhood ? {
                "address": {
                  "@type": "PostalAddress",
                  "addressLocality": r.neighborhood,
                  "addressRegion": "NY",
                  "addressCountry": "US",
                },
              } : {}),
            },
          })),
        },
      },
    ],
  };
}


// ── Slug resolution ───────────────────────────────────────────────────────────

async function resolveCity(citySlug: string): Promise<string | null> {
  const { data } = await supabase
    .from("restaurants")
    .select("city")
    .not("score", "is", null);
  if (!data) return null;
  const cities = [...new Set(data.map((r: { city: string }) => r.city))];
  return cities.find((c) => toSlug(c) === citySlug) ?? null;
}

async function resolveSlugs(citySlug: string, neighborhoodSlug: string) {
  const { data } = await supabase
    .from("restaurants")
    .select("city, neighborhood")
    .not("score", "is", null)
    .not("neighborhood", "is", null);

  if (!data) return null;

  const cities = [...new Set(data.map((r: { city: string }) => r.city))];
  const city = cities.find((c) => toSlug(c) === citySlug);
  if (!city) return null;

  const neighborhoods = [
    ...new Set(
      data
        .filter((r: { city: string; neighborhood: string | null }) => r.city === city)
        .map((r: { neighborhood: string | null }) => r.neighborhood as string)
    ),
  ];
  const neighborhood = neighborhoods.find((n) => toSlug(n) === neighborhoodSlug);
  if (!neighborhood) return null;

  return { city, neighborhood };
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = { params: Promise<{ slug: string[] }> };

type RestaurantRow = {
  id: number;
  name: string;
  score: number;
  slug: string | null;
  neighborhood: string | null;
  cuisine: string | null;
  website_url: string | null;
  google_maps_url: string | null;
  dedicated_gf_kitchen: string | null;
  display_name: string | null;
  dossier: (ScoringDossier & { summary?: { short_summary?: string } }) | null;
  source: string | null;
  ingested_at: string | null;
};

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [s0, s1, s2] = slug ?? [];
  if (!s0 || !s1) return {};

  // City-level category page: /gluten-free/[citySlug]/[catSlug]
  if (s1 && CATEGORIES[s1] && !s2) {
    const city = await resolveCity(s0);
    if (!city) return {};
    const catDef = CATEGORIES[s1];
    const title = `${catDef.cityLabelPlural} in ${city} | CleanPlate`;
    const description = `${catDef.cityLabelPlural} in ${city} ranked by GF safety score. CleanPlate evaluates cross-contamination risk, dedicated fryers, menu labeling, and real diner experiences.`;
    const canonicalPath = `/gluten-free/${s0}/${s1}`;
    return {
      title,
      description,
      alternates: { canonical: canonicalPath },
      openGraph: { title, description, type: "website", url: canonicalPath },
    };
  }

  // Neighborhood pages: /gluten-free/[citySlug]/[neighborhoodSlug]/[catSlug?]
  const resolved = await resolveSlugs(s0, s1);
  if (!resolved) return {};
  const { city, neighborhood } = resolved;
  const catDef = s2 ? CATEGORIES[s2] : null;

  const title = catDef
    ? `Best ${catDef.labelPlural} in ${neighborhood}, ${city} | CleanPlate`
    : `Best Gluten-Free Restaurants in ${neighborhood}, ${city} | CleanPlate`;
  const description = catDef
    ? `Top gluten-free ${catDef.label.toLowerCase()} spots in ${neighborhood}, ${city} ranked by GF safety score. Find places with dedicated fryers, clear labeling, and low cross-contamination risk.`
    : `The best gluten-free restaurants in ${neighborhood}, ${city} ranked by GF safety score. Find places with dedicated fryers, clear labeling, and low cross-contamination risk.`;
  const canonicalPath = `/gluten-free/${s0}/${s1}${s2 ? `/${s2}` : ""}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: { title, description, type: "website", url: canonicalPath },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function LandingPage({ params }: Props) {
  const { slug } = await params;
  const [s0, s1, s2] = slug ?? [];
  if (!s0 || !s1) notFound();

  // ── Detect page type ────────────────────────────────────────────────────────
  // City-level category: /gluten-free/[citySlug]/[catSlug]  (s1 matches a category key, no s2)
  // Neighborhood page:   /gluten-free/[citySlug]/[neighborhoodSlug]/[catSlug?]
  const isCityLevel = !s2 && !!CATEGORIES[s1];

  // ── City-level category page ────────────────────────────────────────────────
  if (isCityLevel) {
    const catSlug = s1;
    const catDef = CATEGORIES[catSlug];
    const city = await resolveCity(s0);
    if (!city) notFound();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from("restaurants")
      .select("id, name, score, slug, neighborhood, cuisine, website_url, google_maps_url, dedicated_gf_kitchen, display_name, dossier, source, ingested_at")
      .not("score", "is", null)
      .eq("city", city)
      .gte("score", 75)
      .order("score", { ascending: false })
      .limit(100);
    query = applyCategoryFilter(query, catDef);

    const { data } = await query;
    const restaurants = (data ?? []) as RestaurantRow[];
    if (restaurants.length < 5) notFound();

    const isTableLayout = restaurants.length >= TABLE_LAYOUT_MIN_RESULTS;

    const h1 = `${catDef.cityLabelPlural} in ${city}`;
    const otherCategories = Object.entries(CATEGORIES).filter(([cs]) => cs !== catSlug);

    const cityJsonLd = buildPageJsonLd({
      pageUrl: `/gluten-free/${s0}/${s1}`,
      name: h1,
      description: catDef.editorialIntro,
      breadcrumbs: [
        { name: "Rankings", item: `${BASE_URL}/rankings` },
        { name: city, item: `${BASE_URL}/rankings?city=${encodeURIComponent(city)}` },
        { name: catDef.label },
      ],
      restaurants,
    });

    return (
      <main className="pt-16">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(cityJsonLd) }} />

        {/* ── Hero ── */}
        <section
          className="grid-bg border-b px-4 md:px-8 py-16 md:py-24 relative"
          style={{ borderColor: "var(--border-default)" }}
        >
          <div
            className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
            style={{ background: "linear-gradient(to bottom, transparent, var(--surface-base))" }}
          />
          <div className={isTableLayout ? "max-w-6xl mx-auto" : "max-w-4xl mx-auto"}>
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 flex-wrap mb-6">
              <Link
                href="/rankings"
                className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim hover:text-white transition-colors"
              >
                Rankings
              </Link>
              <span className="text-[oklch(0.3_0_0)]">/</span>
              <Link
                href={`/rankings?city=${encodeURIComponent(city)}`}
                className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim hover:text-white transition-colors"
              >
                {city}
              </Link>
              <span className="text-[oklch(0.3_0_0)]">/</span>
              <span className="font-mono text-ui-sm uppercase tracking-stamp text-text-tertiary">
                {catDef.label}
              </span>
            </div>

            <h1
              className="font-[family-name:var(--font-display)] leading-none mb-10"
              style={{ fontSize: "clamp(3rem, 8vw, 5.5rem)", letterSpacing: "0.02em" }}
            >
              {catDef.cityLabelPlural}
              <br />
              <span style={{ color: "var(--accent)" }}>in {city}</span>
            </h1>

            {/* Editorial intro */}
            <p className="text-ui-2xl leading-[1.8] text-text-secondary max-w-2xl">
              {catDef.editorialIntro}
            </p>
          </div>
        </section>

        {/* ── Restaurant list ── */}
        <section className="px-4 md:px-8 py-10">
          <div className={isTableLayout ? "max-w-6xl mx-auto" : "max-w-4xl mx-auto"}>
            {isTableLayout ? (
              <>
                <StatStrip restaurants={restaurants as TableRestaurant[]} entityLabel={catDef.labelPlural} />
                <RankedList
                  restaurants={restaurants as unknown as RankedRestaurant[]}
                  countLabel={`${restaurants.length} ${catDef.labelPlural} — Ranked by GF Safety`}
                  metaLine={(r) => {
                    const borough = r.neighborhood ? lookupBorough(r.neighborhood) : null;
                    const hood = r.neighborhood
                      ? `${r.neighborhood}${borough && borough !== "Manhattan" ? `, ${borough}` : ""}`
                      : null;
                    return [hood, r.cuisine].filter(Boolean).join(" · ");
                  }}
                  inlineSlot={{
                    afterRow: 8,
                    node: (
                      <FollowPrompt
                        variant="inline"
                        source={`/gluten-free/${s0}/${s1}`}
                      />
                    ),
                  }}
                />
                <div className="mt-8">
                  <FollowPrompt
                    variant="section"
                    source={`/gluten-free/${s0}/${s1}`}
                  />
                </div>
              </>
            ) : (
              <>
                <div
                  className="flex items-center justify-between py-3 border-b mb-1"
                  style={{ borderColor: "var(--border-default)" }}
                >
                  <span className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim">
                    {restaurants.length} Restaurant{restaurants.length !== 1 ? "s" : ""} — Ranked by GF Safety
                  </span>
                </div>

                <div className="space-y-0">
                  {restaurants.map((r, i) => {
                    const color = getGaugeColor(r.score);
                    const summary = r.dossier?.summary?.short_summary;

                    return (
                      <Link
                        key={r.id}
                        href={r.slug ? `/restaurant/${r.slug}` : `/restaurant/${r.id}`}
                        className="grid grid-cols-[3rem_1fr_auto] md:grid-cols-[4rem_1fr_auto] items-start border-b gap-3 md:gap-8 py-4 md:py-5 px-2 md:px-4 transition-colors duration-150 hover:bg-surface-raised"
                        style={{ borderColor: "var(--border-subtle)", borderLeft: `2px solid ${color}` }}
                      >
                        {/* Rank */}
                        <span
                          className="font-[family-name:var(--font-display)] leading-none tabular-nums text-right pt-0.5"
                          style={{ fontSize: "clamp(1rem, 2vw, 1.5rem)", color: i < 3 ? color : "var(--text-disabled)" }}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </span>

                        {/* Name + meta */}
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span
                              className="font-[family-name:var(--font-display)] leading-tight"
                              style={{ fontSize: "clamp(1rem, 2.5vw, 1.75rem)", color: "var(--text-primary)", letterSpacing: "0.02em" }}
                            >
                              {r.display_name ?? r.name}
                            </span>
                            {isNewRestaurant(r.source, r.ingested_at) && (
                              <span className="font-mono text-ui-xs uppercase tracking-editorial px-1.5 py-0.5 shrink-0" style={{ backgroundColor: "var(--accent-tint-md)", color: "var(--accent)", border: "1px solid var(--accent-tint-lg)" }}>
                                New
                              </span>
                            )}
                          </div>
                          {/* Show neighborhood + cuisine on city-level pages */}
                          <p className="font-mono text-ui-sm uppercase tracking-broad text-text-dim mt-1">
                            {[r.neighborhood, r.cuisine].filter(Boolean).join(" · ")}
                          </p>
                          {summary && (
                            <p className="text-ui-lg leading-[1.6] text-text-tertiary mt-1.5 max-w-lg line-clamp-2">
                              {summary}
                            </p>
                          )}
                        </div>

                        {/* Score */}
                        <ScoreBadge score={r.score} size="sm" />
                      </Link>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── Internal links ── */}
            <div className="mt-14 pt-8 border-t space-y-8" style={{ borderColor: "var(--border-default)" }}>
              <div>
                <h2 className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim mb-4">
                  More GF Features in {city}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {otherCategories.map(([cs, def]) => (
                    <Link
                      key={cs}
                      href={`/gluten-free/${s0}/${cs}`}
                      className="font-mono text-ui-sm uppercase tracking-label px-3 py-2 border transition-colors duration-150 hover:border-accent hover:text-accent"
                      style={{ borderColor: "var(--border-emphasis)", color: "var(--text-label)" }}
                    >
                      {def.label}
                    </Link>
                  ))}
                </div>
              </div>
              <div>
                <Link
                  href={`/rankings?city=${encodeURIComponent(city)}`}
                  className="font-mono text-ui-md uppercase tracking-label px-4 py-2.5 border transition-colors duration-150 hover:border-accent hover:text-accent inline-block"
                  style={{ borderColor: "var(--border-emphasis)", color: "var(--text-label)" }}
                >
                  ← Explore All {city} Rankings
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  // ── Neighborhood page ───────────────────────────────────────────────────────
  const citySlug = s0;
  const neighborhoodSlug = s1;
  const categorySlug = s2 ?? null;

  const resolved = await resolveSlugs(citySlug, neighborhoodSlug);
  if (!resolved) notFound();

  const { city, neighborhood } = resolved;
  const catDef = categorySlug ? CATEGORIES[categorySlug] : null;
  if (categorySlug && !catDef) notFound();

  // ── Fetch restaurants ──────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from("restaurants")
    .select("id, name, score, slug, neighborhood, cuisine, website_url, google_maps_url, dedicated_gf_kitchen, display_name, dossier, source, ingested_at")
    .not("score", "is", null)
    .eq("city", city)
    .eq("neighborhood", neighborhood)
    .gte("score", 75)
    .order("score", { ascending: false })
    .limit(100);

  if (catDef) query = applyCategoryFilter(query, catDef);

  const { data } = await query;
  const restaurants = (data ?? []) as RestaurantRow[];

  if (restaurants.length < 3) notFound();

  // ── Content ────────────────────────────────────────────────────────────────
  const h1 = catDef
    ? `Best ${catDef.labelPlural} in ${neighborhood}, ${city}`
    : `Best Gluten-Free Restaurants in ${neighborhood}, ${city}`;

  const intro = catDef
    ? `Every ${catDef.label.toLowerCase()} spot in ${neighborhood} with a GF safety score of 75 or higher. Scores weigh cross-contamination risk, dedicated fryers, menu labeling, and recent diner reports.`
    : `Every restaurant in ${neighborhood} with a GF safety score of 75 or higher. Scores weigh cross-contamination risk, dedicated fryers, menu labeling, and recent diner reports.`;

  const availableCategories = Object.entries(CATEGORIES).filter(([cs]) => cs !== categorySlug);

  const neighborhoodJsonLd = buildPageJsonLd({
    pageUrl: `/gluten-free/${citySlug}/${neighborhoodSlug}${categorySlug ? `/${categorySlug}` : ""}`,
    name: h1,
    description: intro,
    breadcrumbs: [
      { name: "Rankings", item: `${BASE_URL}/rankings` },
      { name: neighborhood, item: `${BASE_URL}/gluten-free/${citySlug}/${neighborhoodSlug}` },
      ...(catDef ? [{ name: catDef.label }] : []),
    ],
    restaurants,
  });

  return (
    <main className="pt-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(neighborhoodJsonLd) }} />

      {/* ── Hero ── */}
      <section
        className="grid-bg border-b px-4 md:px-8 py-16 md:py-24 relative"
        style={{ borderColor: "var(--border-default)" }}
      >
        <div
          className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, var(--surface-base))" }}
        />
        <div className="max-w-6xl mx-auto">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 flex-wrap mb-6">
            <Link
              href="/rankings"
              className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim hover:text-white transition-colors"
            >
              Rankings
            </Link>
            <span className="text-[oklch(0.3_0_0)]">/</span>
            <Link
              href={`/rankings?city=${encodeURIComponent(city)}`}
              className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim hover:text-white transition-colors"
            >
              {city}
            </Link>
            <span className="text-[oklch(0.3_0_0)]">/</span>
            {categorySlug ? (
              <Link
                href={`/gluten-free/${citySlug}/${neighborhoodSlug}`}
                className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim hover:text-white transition-colors"
              >
                {neighborhood}
              </Link>
            ) : (
              <span className="font-mono text-ui-sm uppercase tracking-stamp text-text-tertiary">
                {neighborhood}
              </span>
            )}
            {catDef && (
              <>
                <span className="text-[oklch(0.3_0_0)]">/</span>
                <span className="font-mono text-ui-sm uppercase tracking-stamp text-text-tertiary">
                  {catDef.label}
                </span>
              </>
            )}
          </div>

          <h1
            className="font-[family-name:var(--font-display)] leading-none mb-10"
            style={{ fontSize: "clamp(3rem, 8vw, 5.5rem)", letterSpacing: "0.02em" }}
          >
            {catDef ? `Best ${catDef.labelPlural}` : "Best Gluten-Free Restaurants"}
            <br />
            <span style={{ color: "var(--accent)" }}>in {neighborhood}</span>
          </h1>

          <p className="text-ui-2xl leading-[1.8] text-text-secondary max-w-2xl">
            {intro}
          </p>
        </div>
      </section>

      {/* ── Restaurant list ── */}
      <section className="px-4 md:px-8 py-10">
        <div className="max-w-6xl mx-auto">
          <StatStrip
            restaurants={restaurants as TableRestaurant[]}
            entityLabel={catDef ? catDef.labelPlural : "Restaurants"}
          />
          <RankedList
            restaurants={restaurants as unknown as RankedRestaurant[]}
            countLabel={`${restaurants.length} ${catDef ? catDef.labelPlural : `Restaurant${restaurants.length !== 1 ? "s" : ""}`} — Ranked by GF Safety`}
            metaLine={(r) => r.cuisine ?? ""}
            inlineSlot={{
              afterRow: 8,
              node: (
                <FollowPrompt
                  variant="inline"
                  source={`/gluten-free/${citySlug}/${neighborhoodSlug}${categorySlug ? `/${categorySlug}` : ""}`}
                />
              ),
            }}
          />
          <div className="mt-8">
            <FollowPrompt
              variant="section"
              source={`/gluten-free/${citySlug}/${neighborhoodSlug}${categorySlug ? `/${categorySlug}` : ""}`}
            />
          </div>

          {/* ── Internal links ── */}
          <div className="mt-14 pt-8 border-t space-y-8" style={{ borderColor: "var(--border-default)" }}>

            {/* Other GF options in this neighborhood (base neighborhood page) */}
            {!categorySlug && (
              <div>
                <h2 className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim mb-4">
                  More GF Options in {neighborhood}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {availableCategories.map(([cs, def]) => (
                    <Link
                      key={cs}
                      href={`/gluten-free/${citySlug}/${neighborhoodSlug}/${cs}`}
                      className="font-mono text-ui-sm uppercase tracking-label px-3 py-2 border transition-colors duration-150 hover:border-accent hover:text-accent"
                      style={{ borderColor: "var(--border-emphasis)", color: "var(--text-label)" }}
                    >
                      {def.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Back to neighborhood page + link to city-level category page (category pages) */}
            {categorySlug && catDef && (
              <>
                <div>
                  <h2 className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim mb-4">
                    All GF Restaurants in {neighborhood}
                  </h2>
                  <Link
                    href={`/gluten-free/${citySlug}/${neighborhoodSlug}`}
                    className="font-mono text-ui-md uppercase tracking-label px-4 py-2.5 border transition-colors duration-150 hover:border-accent hover:text-accent inline-block"
                    style={{ borderColor: "var(--border-emphasis)", color: "var(--text-label)" }}
                  >
                    View All GF Restaurants →
                  </Link>
                </div>
                <div>
                  <h2 className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim mb-4">
                    {catDef.cityLabelPlural} in {city}
                  </h2>
                  <Link
                    href={`/gluten-free/${citySlug}/${categorySlug}`}
                    className="font-mono text-ui-md uppercase tracking-label px-4 py-2.5 border transition-colors duration-150 hover:border-accent hover:text-accent inline-block"
                    style={{ borderColor: "var(--border-emphasis)", color: "var(--text-label)" }}
                  >
                    See All {city} → {catDef.label}
                  </Link>
                </div>
              </>
            )}

            {/* Back to city rankings */}
            <div>
              <Link
                href={`/rankings?city=${encodeURIComponent(city)}`}
                className="font-mono text-ui-md uppercase tracking-label px-4 py-2.5 border transition-colors duration-150 hover:border-accent hover:text-accent inline-block"
                style={{ borderColor: "var(--border-emphasis)", color: "var(--text-label)" }}
              >
                ← Explore {city} Rankings
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
