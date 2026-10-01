import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import type { ScoringDossier, VerifiedData } from "@/lib/score";
import { RankedList, type RankedRestaurant } from "@/app/components/RankedList";
import { RankedListFilters, type QuickFilter } from "@/app/components/RankedListFilters";
import { getHighlights } from "@/lib/highlights";
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
  verified_data: VerifiedData | null;
  gf_food_categories: string[] | null;
  place_type: string[] | null;
  source: string | null;
  ingested_at: string | null;
};

// ── Mobile helpers ────────────────────────────────────────────────────────────

// Quick filters only where they help: long lists, and only filters that leave
// a useful subset (≥3, not everything) and don't repeat the page's own filter.
const QUICK_FILTER_MIN_RESULTS = 15;

function buildQuickFilters(rows: RestaurantRow[], pageCategory: string | null): QuickFilter[] {
  if (rows.length < QUICK_FILTER_MIN_RESULTS) return [];
  const hl = rows.map((r) => getHighlights(r));
  const defs: (QuickFilter & { skip?: boolean })[] = [
    { key: "excellent", label: "85+", count: rows.filter((r) => r.score >= 85).length, summary: "" },
    { key: "fryer", label: "Dedicated fryer", count: hl.filter((h) => h.includes("fryer")).length, summary: "", skip: pageCategory === "fryer" },
    { key: "labeled", label: "Menu labeled", count: hl.filter((h) => h.includes("labeled")).length, summary: "" },
    { key: "kitchen", label: "Dedicated GF kitchen", count: hl.filter((h) => h.includes("kitchen")).length, summary: "", skip: pageCategory === "dedicated" },
  ];
  const summaries: Record<QuickFilter["key"], (n: number) => string> = {
    excellent: (n) => `${n} scored excellent · 85+`,
    fryer: (n) => `${n} with a dedicated fryer`,
    labeled: (n) => `${n} with a labeled GF menu`,
    kitchen: (n) => `${n} with a dedicated GF kitchen`,
  };
  return defs
    .filter((d) => !d.skip && d.count >= 3 && d.count < rows.length)
    .map(({ key, label, count }) => ({ key, label, count, summary: summaries[key](count) }));
}

function rowMatchesCategory(r: RestaurantRow, def: CategoryDef): boolean {
  if (def.type === "gf_food" && def.value)    return r.gf_food_categories?.includes(def.value) ?? false;
  if (def.type === "place_type" && def.value) return r.place_type?.includes(def.value) ?? false;
  if (def.type === "fryer")                   return r.dossier?.operations?.dedicated_equipment?.fryer === true;
  if (def.type === "dedicated")               return r.dossier?.operations?.cross_contamination_risk === "low";
  return false;
}

/** One-line stats for phones (desktop keeps the StatStrip). */
function MobileStats({ restaurants }: { restaurants: RestaurantRow[] }) {
  const excellent = restaurants.filter((r) => r.score >= 85).length;
  const num = "font-[family-name:var(--font-display)] text-2xl leading-none mr-1.5";
  return (
    <p className="md:hidden flex flex-wrap items-baseline gap-x-5 gap-y-1 mt-4 font-mono text-ui-md uppercase tracking-label text-text-label">
      <span><span className={num} style={{ color: "var(--accent)" }}>{restaurants.length}</span>rated</span>
      {excellent > 0 && (
        <span><span className={num} style={{ color: "var(--score-excellent)" }}>{excellent}</span>excellent · 85+</span>
      )}
    </p>
  );
}

const relatedTileClass =
  "flex items-center justify-between gap-2 min-h-13 md:min-h-0 px-3.5 md:px-3 md:py-2 border font-mono text-ui-sm uppercase tracking-label transition-colors duration-150 hover:border-accent hover:text-accent";
const backLinkClass =
  "flex md:inline-flex items-center justify-between gap-3 min-h-13 md:min-h-0 px-4 md:py-2.5 border font-mono text-ui-md uppercase tracking-label transition-colors duration-150 hover:border-accent hover:text-accent";

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
    const description = `${catDef.cityLabelPlural} in ${city} ranked by gluten-free safety score. CleanPlate evaluates cross-contamination risk, dedicated fryers, menu labeling, and real diner experiences.`;
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

  // Spell out "Gluten-Free" for search-query match; strip the "GF" abbreviation
  // out of the category noun so descriptions don't read "gluten-free gf breakfast".
  const catNoun = catDef ? catDef.labelPlural.replace(/\bGF\b/gi, "").replace(/\s+/g, " ").trim().toLowerCase() : "";
  const title = catDef
    ? `${catDef.cityLabelPlural} in ${neighborhood}, ${city} | CleanPlate`
    : `Best Gluten-Free Restaurants in ${neighborhood}, ${city} | CleanPlate`;
  const description = catDef
    ? `The safest gluten-free ${catNoun} in ${neighborhood}, ${city}, ranked by gluten-free safety score — dedicated fryers, clear labeling, and low cross-contamination risk.`
    : `The best gluten-free restaurants in ${neighborhood}, ${city}, ranked by gluten-free safety score — dedicated fryers, clear labeling, and low cross-contamination risk.`;
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
      .select("id, name, score, slug, neighborhood, cuisine, website_url, google_maps_url, dedicated_gf_kitchen, display_name, dossier, verified_data, gf_food_categories, place_type, source, ingested_at")
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
        { name: "Gluten-Free", item: `${BASE_URL}/rankings` },
        { name: city, item: `${BASE_URL}/rankings?city=${encodeURIComponent(city)}` },
        { name: catDef.label.replace(/\bGF\b/g, "").replace(/\s+/g, " ").trim() },
      ],
      restaurants,
    });

    return (
      <main className="pt-16">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(cityJsonLd) }} />

        {/* ── Hero ── */}
        <section
          className="grid-bg border-b px-4 md:px-8 pt-6 pb-6 md:py-24 relative"
          style={{ borderColor: "var(--border-default)" }}
        >
          <div
            className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
            style={{ background: "linear-gradient(to bottom, transparent, var(--surface-base))" }}
          />
          <div className={isTableLayout ? "max-w-6xl mx-auto" : "max-w-4xl mx-auto"}>
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 flex-wrap mb-3 md:mb-6">
              <Link
                href="/rankings"
                className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim hover:text-text-primary transition-colors"
              >
                Rankings
              </Link>
              <span className="text-[var(--border-emphasis)]">/</span>
              <Link
                href={`/rankings?city=${encodeURIComponent(city)}`}
                className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim hover:text-text-primary transition-colors"
              >
                {city}
              </Link>
              <span className="text-[var(--border-emphasis)]">/</span>
              <span className="font-mono text-ui-sm uppercase tracking-stamp text-text-tertiary">
                {catDef.label}
              </span>
            </div>

            <h1
              className="font-[family-name:var(--font-display)] leading-none mb-4 md:mb-10"
              style={{ fontSize: "clamp(2.4rem, 8vw, 5.5rem)", letterSpacing: "0.02em" }}
            >
              {catDef.cityLabelPlural}
              <br />
              <span style={{ color: "var(--accent)" }}>in {city}</span>
            </h1>

            {/* Editorial intro */}
            <p className="font-sans text-ui-2xl leading-normal md:leading-[1.8] text-text-secondary max-w-2xl">
              {catDef.editorialIntro}
            </p>
            <MobileStats restaurants={restaurants} />
          </div>
        </section>

        {/* ── Restaurant list ── */}
        <section className="px-4 md:px-8 pt-2 pb-10 md:py-10">
          <div className={isTableLayout ? "max-w-6xl mx-auto" : "max-w-4xl mx-auto"}>
            <div className="hidden md:block">
              <StatStrip restaurants={restaurants as TableRestaurant[]} entityLabel={catDef.labelPlural} />
            </div>
            <RankedListFilters
              filters={buildQuickFilters(restaurants, catSlug)}
              total={restaurants.length}
              source={`/gluten-free/${s0}/${s1}`}
            >
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
            </RankedListFilters>
            <div className="mt-8">
              <FollowPrompt
                variant="section"
                source={`/gluten-free/${s0}/${s1}`}
              />
            </div>

            {/* ── Internal links ── */}
            <div className="mt-14 pt-8 border-t space-y-8" style={{ borderColor: "var(--border-default)" }}>
              <div>
                <h2 className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim mb-4">
                  More GF Features in {city}
                </h2>
                <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
                  {otherCategories.map(([cs, def]) => (
                    <Link
                      key={cs}
                      href={`/gluten-free/${s0}/${cs}`}
                      className={relatedTileClass}
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
                  className={backLinkClass}
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
    .select("id, name, score, slug, neighborhood, cuisine, website_url, google_maps_url, dedicated_gf_kitchen, display_name, dossier, verified_data, gf_food_categories, place_type, source, ingested_at")
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

  const introNoun = catDef ? catDef.label.replace(/\bGF\b/gi, "").replace(/\s+/g, " ").trim().toLowerCase() : "";
  const intro = catDef
    ? `Every gluten-free ${introNoun} spot in ${neighborhood} with a gluten-free safety score of 75 or higher. Scores weigh cross-contamination risk, dedicated fryers, menu labeling, and recent diner reports.`
    : `Every restaurant in ${neighborhood} with a gluten-free safety score of 75 or higher. Scores weigh cross-contamination risk, dedicated fryers, menu labeling, and recent diner reports.`;

  // Sub-guides that actually exist for this neighborhood (≥3 qualifying,
  // mirroring the notFound threshold) — computed from the rows already loaded.
  const availableCategories = Object.entries(CATEGORIES)
    .filter(([cs]) => cs !== categorySlug)
    .map(([cs, def]) => [cs, def, restaurants.filter((r) => rowMatchesCategory(r, def)).length] as const)
    .filter(([, , count]) => count >= 3);

  const neighborhoodJsonLd = buildPageJsonLd({
    pageUrl: `/gluten-free/${citySlug}/${neighborhoodSlug}${categorySlug ? `/${categorySlug}` : ""}`,
    name: h1,
    description: intro,
    breadcrumbs: [
      { name: "Gluten-Free", item: `${BASE_URL}/rankings` },
      { name: city, item: `${BASE_URL}/rankings?city=${encodeURIComponent(city)}` },
      { name: neighborhood, item: `${BASE_URL}/gluten-free/${citySlug}/${neighborhoodSlug}` },
      ...(catDef ? [{ name: catDef.label.replace(/\bGF\b/g, "").replace(/\s+/g, " ").trim() }] : []),
    ],
    restaurants,
  });

  return (
    <main className="pt-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(neighborhoodJsonLd) }} />

      {/* ── Hero ── */}
      <section
        className="grid-bg border-b px-4 md:px-8 pt-6 pb-6 md:py-24 relative"
        style={{ borderColor: "var(--border-default)" }}
      >
        <div
          className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, var(--surface-base))" }}
        />
        <div className="max-w-6xl mx-auto">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 flex-wrap mb-3 md:mb-6">
            <Link
              href="/rankings"
              className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim hover:text-text-primary transition-colors"
            >
              Rankings
            </Link>
            <span className="text-[var(--border-emphasis)]">/</span>
            <Link
              href={`/rankings?city=${encodeURIComponent(city)}`}
              className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim hover:text-text-primary transition-colors"
            >
              {city}
            </Link>
            <span className="text-[var(--border-emphasis)]">/</span>
            {categorySlug ? (
              <Link
                href={`/gluten-free/${citySlug}/${neighborhoodSlug}`}
                className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim hover:text-text-primary transition-colors"
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
                <span className="text-[var(--border-emphasis)]">/</span>
                <span className="font-mono text-ui-sm uppercase tracking-stamp text-text-tertiary">
                  {catDef.label}
                </span>
              </>
            )}
          </div>

          <h1
            className="font-[family-name:var(--font-display)] leading-none mb-4 md:mb-10"
            style={{ fontSize: "clamp(2.4rem, 8vw, 5.5rem)", letterSpacing: "0.02em" }}
          >
            {catDef ? `Best ${catDef.labelPlural}` : "Best Gluten-Free Restaurants"}
            <br />
            <span style={{ color: "var(--accent)" }}>in {neighborhood}</span>
          </h1>

          <p className="font-sans text-ui-2xl leading-normal md:leading-[1.8] text-text-secondary max-w-2xl">
            {intro}
          </p>
          <MobileStats restaurants={restaurants} />
        </div>
      </section>

      {/* ── Restaurant list ── */}
      <section className="px-4 md:px-8 pt-2 pb-10 md:py-10">
        <div className="max-w-6xl mx-auto">
          <div className="hidden md:block">
            <StatStrip
              restaurants={restaurants as TableRestaurant[]}
              entityLabel={catDef ? catDef.labelPlural : "Restaurants"}
            />
          </div>
          <RankedListFilters
            filters={buildQuickFilters(restaurants, categorySlug)}
            total={restaurants.length}
            source={`/gluten-free/${citySlug}/${neighborhoodSlug}${categorySlug ? `/${categorySlug}` : ""}`}
          >
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
          </RankedListFilters>
          <div className="mt-8">
            <FollowPrompt
              variant="section"
              source={`/gluten-free/${citySlug}/${neighborhoodSlug}${categorySlug ? `/${categorySlug}` : ""}`}
            />
          </div>

          {/* ── Internal links ── */}
          <div className="mt-14 pt-8 border-t space-y-8" style={{ borderColor: "var(--border-default)" }}>

            {/* Other GF options in this neighborhood (base neighborhood page) */}
            {!categorySlug && availableCategories.length > 0 && (
              <div>
                <h2 className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim mb-4">
                  More GF Options in {neighborhood}
                </h2>
                <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
                  {availableCategories.map(([cs, def, count]) => (
                    <Link
                      key={cs}
                      href={`/gluten-free/${citySlug}/${neighborhoodSlug}/${cs}`}
                      className={relatedTileClass}
                      style={{ borderColor: "var(--border-emphasis)", color: "var(--text-label)" }}
                    >
                      <span>{def.label}</span>
                      <span className="text-text-dim">{count}</span>
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
                    className={backLinkClass}
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
                    className={backLinkClass}
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
                className={backLinkClass}
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
