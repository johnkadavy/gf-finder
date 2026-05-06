import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { getGaugeColor, getScoreLabel } from "@/lib/score";
import { isNewRestaurant } from "@/lib/utils";

export const revalidate = 86400; // regenerate at most once per 24 hours

// ── Slug helpers ─────────────────────────────────────────────────────────────

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Category definitions ──────────────────────────────────────────────────────

type CategoryDef = {
  type: "gf_food" | "place_type" | "fryer" | "dedicated";
  value?: string;            // used for gf_food and place_type
  label: string;
  labelPlural: string;       // neighborhood-level plural: "GF Pizza Spots"
  cityLabelPlural: string;   // city-level plural: "Best Gluten-Free Pizza Restaurants"
  editorialIntro: string;    // editorial paragraph shown on city-level pages
};

const CATEGORIES: Record<string, CategoryDef> = {
  "pizza": {
    type: "gf_food", value: "gf_pizza",
    label: "GF Pizza",
    labelPlural: "GF Pizza Spots",
    cityLabelPlural: "Best Gluten-Free Pizza Restaurants",
    editorialIntro: "Finding gluten-free pizza in NYC means more than tracking down a GF crust — it means knowing whether flour is airborne in an open kitchen, whether the dough is prepped on shared surfaces, and whether recent diners have reported getting sick. CleanPlate evaluates each GF pizza spot against cross-contamination signals, dedicated prep practices, and illness reports from the past six months. Every restaurant below has earned a top GF safety score, not just for offering a GF option.",
  },
  "pasta": {
    type: "gf_food", value: "gf_pasta",
    label: "GF Pasta",
    labelPlural: "GF Pasta Restaurants",
    cityLabelPlural: "Best Gluten-Free Pasta Restaurants",
    editorialIntro: "Gluten-free pasta is one of the trickier categories — shared boiling water, flour-dusted prep surfaces, and cross-contact from fresh pasta kitchens are all common hazards. CleanPlate looks at kitchen operations, staff awareness, and real diner illness reports to distinguish restaurants where GF pasta is genuinely safe from places where it's an afterthought. The spots below score in the top tier for GF safety.",
  },
  "bakery": {
    type: "gf_food", value: "gf_baked_goods",
    label: "GF Baked Goods",
    labelPlural: "GF Baked Goods Spots",
    cityLabelPlural: "Best Gluten-Free Bakeries",
    editorialIntro: "Gluten-free baked goods from a shared bakery kitchen carry real risk — flour dust settles on every surface, and many \"GF options\" at conventional bakeries involve meaningful cross-contact. The bakeries and cafés below either operate dedicated gluten-free kitchens or have demonstrated consistently safe practices backed by real diner feedback. These are places where GF means more than just the ingredients list.",
  },
  "breakfast": {
    type: "gf_food", value: "gf_breakfast",
    label: "GF Breakfast",
    labelPlural: "GF Breakfast & Brunch Spots",
    cityLabelPlural: "Best Gluten-Free Breakfast & Brunch Spots",
    editorialIntro: "Brunch kitchens are notoriously high-risk for gluten cross-contact — pancake batters, pastry prep, and shared griddles all create contamination opportunities. CleanPlate scores each spot using cross-contamination signals, menu labeling clarity, and real illness reports, so you can show up knowing the restaurant actually takes it seriously. The places below have earned top marks for GF safety.",
  },
  "desserts": {
    type: "gf_food", value: "gf_desserts",
    label: "GF Desserts",
    labelPlural: "GF Dessert Spots",
    cityLabelPlural: "Best Gluten-Free Desserts",
    editorialIntro: "Gluten-free desserts require a kitchen that takes separation seriously — most baked desserts involve flour, and a single contaminated surface can compromise an otherwise GF item. The spots below have been scored for GF safety and offer desserts that meet a high bar for celiac-safe preparation. Check the score and illness signal before ordering.",
  },
  "fryer": {
    type: "fryer",
    label: "GF Fryer",
    labelPlural: "Restaurants with GF Fryer",
    cityLabelPlural: "Restaurants with a Dedicated Gluten-Free Fryer",
    editorialIntro: "A dedicated gluten-free fryer is one of the clearest safety signals a restaurant can offer. In a shared fryer, even a few breadcrumbs contaminate the oil — meaning nothing fried in it is safe for celiacs. Every restaurant below has a documented dedicated GF fryer, so fried items like fries, wings, or calamari can be ordered with significantly lower cross-contamination risk.",
  },
  "dedicated": {
    type: "dedicated",
    label: "Dedicated GF",
    labelPlural: "Dedicated GF Restaurants",
    cityLabelPlural: "Best Dedicated Gluten-Free Restaurants",
    editorialIntro: "A dedicated gluten-free restaurant eliminates an entire category of risk. No shared flour, no gluten-containing items moving through the kitchen, no guesswork for the staff. The restaurants below have been flagged as dedicated GF or near-dedicated through a combination of AI-analyzed menu content and diner reports, and carry CleanPlate's lowest cross-contamination risk ratings.",
  },
  "cafe": {
    type: "place_type", value: "cafe",
    label: "Café",
    labelPlural: "Cafés",
    cityLabelPlural: "Best Gluten-Free Cafés",
    editorialIntro: "Cafés are a daily ritual for many people, but for gluten-sensitive diners, shared pastry cases, contaminated counters, and unlabeled baked goods create real friction. The cafés below have been scored for GF safety based on menu labeling, cross-contamination risk, and diner reports — places where ordering a coffee and a bite is actually straightforward.",
  },
  "bar": {
    type: "place_type", value: "bar",
    label: "Bar",
    labelPlural: "Bars",
    cityLabelPlural: "Best Gluten-Free Bars",
    editorialIntro: "Most bar food — fried apps, wings, sliders — runs through shared fryers and prep surfaces, making bars one of the harder categories for celiacs. The bars below have demonstrated awareness of cross-contamination risks through dedicated equipment, clear staff knowledge, and safe diner track records. A high score here means you can actually eat, not just drink.",
  },
  "fine-dining": {
    type: "place_type", value: "fine_dining",
    label: "Fine Dining",
    labelPlural: "Fine Dining Restaurants",
    cityLabelPlural: "Best Gluten-Free Fine Dining",
    editorialIntro: "Fine dining restaurants often handle GF requests more carefully than casual spots — knowledgeable staff, separate prep areas, and willingness to modify dishes are common. But even high-end kitchens can slip on shared surfaces or unlabeled sauces. The restaurants below score at the top of CleanPlate's GF safety rankings, making them among the safest upscale dining options in the city.",
  },
};

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
              "name": r.name,
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

// ── Category filter helper ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyCategoryFilter(query: any, catDef: CategoryDef): any {
  if (catDef.type === "gf_food" && catDef.value)    return query.contains("gf_food_categories", [catDef.value]);
  if (catDef.type === "place_type" && catDef.value) return query.contains("place_type",         [catDef.value]);
  if (catDef.type === "fryer")     return query.eq("dossier->operations->dedicated_equipment->>fryer", "true");
  if (catDef.type === "dedicated") return query.eq("dossier->operations->>cross_contamination_risk", "low");
  return query;
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
  dossier: { summary?: { short_summary?: string } } | null;
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
      .select("id, name, score, slug, neighborhood, cuisine, dossier, source, ingested_at")
      .not("score", "is", null)
      .eq("city", city)
      .gte("score", 75)
      .order("score", { ascending: false })
      .limit(25);
    query = applyCategoryFilter(query, catDef);

    const { data } = await query;
    const restaurants = (data ?? []) as RestaurantRow[];
    if (restaurants.length < 5) notFound();

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
          className="grid-bg border-b px-4 md:px-8 py-14 md:py-20 relative"
          style={{ borderColor: "oklch(0.22 0 0)" }}
        >
          <div
            className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
            style={{ background: "linear-gradient(to bottom, transparent, oklch(0.08 0 0))" }}
          />
          <div className="max-w-4xl mx-auto">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 flex-wrap mb-6">
              <Link
                href="/rankings"
                className="font-mono text-[10px] uppercase tracking-[0.25em] text-[oklch(0.58_0_0)] hover:text-white transition-colors"
              >
                Rankings
              </Link>
              <span className="text-[oklch(0.3_0_0)]">/</span>
              <Link
                href={`/rankings?city=${encodeURIComponent(city)}`}
                className="font-mono text-[10px] uppercase tracking-[0.25em] text-[oklch(0.58_0_0)] hover:text-white transition-colors"
              >
                {city}
              </Link>
              <span className="text-[oklch(0.3_0_0)]">/</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[oklch(0.75_0_0)]">
                {catDef.label}
              </span>
            </div>

            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[oklch(0.58_0_0)] mb-4">
              CleanPlate · {city}
            </p>

            <h1
              className="font-[family-name:var(--font-display)] leading-tight mb-6"
              style={{ fontSize: "clamp(2rem, 6vw, 4rem)", letterSpacing: "0.02em" }}
            >
              {h1}
            </h1>

            {/* Editorial intro */}
            <p className="text-[15px] leading-[1.8] text-[oklch(0.78_0_0)] max-w-2xl">
              {catDef.editorialIntro}
            </p>
          </div>
        </section>

        {/* ── Restaurant list ── */}
        <section className="px-4 md:px-8 py-10">
          <div className="max-w-4xl mx-auto">
            <div
              className="flex items-center justify-between py-3 border-b mb-1"
              style={{ borderColor: "oklch(0.22 0 0)" }}
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[oklch(0.58_0_0)]">
                {restaurants.length} Restaurant{restaurants.length !== 1 ? "s" : ""} — Ranked by GF Safety
              </span>
            </div>

            <div className="space-y-0">
              {restaurants.map((r, i) => {
                const color = getGaugeColor(r.score);
                const { label } = getScoreLabel(r.score);
                const summary = r.dossier?.summary?.short_summary;

                return (
                  <Link
                    key={r.id}
                    href={r.slug ? `/restaurant/${r.slug}` : `/restaurant/${r.id}`}
                    className="grid grid-cols-[3rem_1fr_auto] md:grid-cols-[4rem_1fr_auto] items-start border-b gap-3 md:gap-8 py-4 md:py-5 px-2 md:px-4 transition-colors duration-150 hover:bg-[oklch(0.11_0_0)]"
                    style={{ borderColor: "oklch(0.18 0 0)", borderLeft: `2px solid ${color}` }}
                  >
                    {/* Rank */}
                    <span
                      className="font-[family-name:var(--font-display)] leading-none tabular-nums text-right pt-0.5"
                      style={{ fontSize: "clamp(1rem, 2vw, 1.5rem)", color: i < 3 ? color : "oklch(0.45 0 0)" }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>

                    {/* Name + meta */}
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span
                          className="font-[family-name:var(--font-display)] leading-tight"
                          style={{ fontSize: "clamp(1rem, 2.5vw, 1.75rem)", color: "oklch(0.95 0 0)", letterSpacing: "0.02em" }}
                        >
                          {r.name}
                        </span>
                        {isNewRestaurant(r.source, r.ingested_at) && (
                          <span className="font-mono text-[9px] uppercase tracking-[0.2em] px-1.5 py-0.5 shrink-0" style={{ backgroundColor: "#FF744420", color: "#FF7444", border: "1px solid #FF744450" }}>
                            New
                          </span>
                        )}
                      </div>
                      {/* Show neighborhood + cuisine on city-level pages */}
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[oklch(0.58_0_0)] mt-1">
                        {[r.neighborhood, r.cuisine].filter(Boolean).join(" · ")}
                      </p>
                      {summary && (
                        <p className="text-[13px] leading-[1.6] text-[oklch(0.72_0_0)] mt-1.5 max-w-lg line-clamp-2">
                          {summary}
                        </p>
                      )}
                    </div>

                    {/* Score */}
                    <div className="flex flex-col items-end shrink-0 pt-0.5">
                      <span
                        className="font-[family-name:var(--font-display)] leading-none tabular-nums"
                        style={{ fontSize: "clamp(1.25rem, 3vw, 2.25rem)", color }}
                      >
                        {Math.round(r.score)}
                      </span>
                      <span
                        className="hidden md:block font-mono text-[9px] uppercase tracking-[0.15em] mt-1"
                        style={{ color: `${color}cc` }}
                      >
                        {label}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* ── Internal links ── */}
            <div className="mt-14 pt-8 border-t space-y-8" style={{ borderColor: "oklch(0.22 0 0)" }}>
              <div>
                <h2 className="font-mono text-[10px] uppercase tracking-[0.25em] text-[oklch(0.58_0_0)] mb-4">
                  More GF Features in {city}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {otherCategories.map(([cs, def]) => (
                    <Link
                      key={cs}
                      href={`/gluten-free/${s0}/${cs}`}
                      className="font-mono text-[10px] uppercase tracking-[0.15em] px-3 py-2 border transition-colors duration-150 hover:border-[#FF7444] hover:text-[#FF7444]"
                      style={{ borderColor: "oklch(0.28 0 0)", color: "oklch(0.65_0_0)" }}
                    >
                      {def.label}
                    </Link>
                  ))}
                </div>
              </div>
              <div>
                <Link
                  href={`/rankings?city=${encodeURIComponent(city)}`}
                  className="font-mono text-[11px] uppercase tracking-[0.15em] px-4 py-2.5 border transition-colors duration-150 hover:border-[#FF7444] hover:text-[#FF7444] inline-block"
                  style={{ borderColor: "oklch(0.28 0 0)", color: "oklch(0.65_0_0)" }}
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
    .select("id, name, score, slug, neighborhood, cuisine, dossier, source, ingested_at")
    .not("score", "is", null)
    .eq("city", city)
    .eq("neighborhood", neighborhood)
    .gte("score", 75)
    .order("score", { ascending: false })
    .limit(25);

  if (catDef) query = applyCategoryFilter(query, catDef);

  const { data } = await query;
  const restaurants = (data ?? []) as RestaurantRow[];

  if (restaurants.length < 3) notFound();

  // ── Content ────────────────────────────────────────────────────────────────
  const h1 = catDef
    ? `Best ${catDef.labelPlural} in ${neighborhood}, ${city}`
    : `Best Gluten-Free Restaurants in ${neighborhood}, ${city}`;

  const intro = catDef
    ? `Looking for gluten-free ${catDef.label.toLowerCase()} in ${neighborhood}? CleanPlate rates ${restaurants.length} spot${restaurants.length !== 1 ? "s" : ""} in ${neighborhood} based on GF safety signals including cross-contamination risk, dedicated fryers, menu labeling, and real diner experiences.`
    : `Looking for gluten-free restaurants in ${neighborhood}? CleanPlate rates ${restaurants.length} restaurant${restaurants.length !== 1 ? "s" : ""} in ${neighborhood} based on GF safety signals including cross-contamination risk, dedicated fryers, menu labeling, and real diner experiences.`;

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
        className="grid-bg border-b px-4 md:px-8 py-14 md:py-20 relative"
        style={{ borderColor: "oklch(0.22 0 0)" }}
      >
        <div
          className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, oklch(0.08 0 0))" }}
        />
        <div className="max-w-4xl mx-auto">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 flex-wrap mb-6">
            <Link
              href="/rankings"
              className="font-mono text-[10px] uppercase tracking-[0.25em] text-[oklch(0.58_0_0)] hover:text-white transition-colors"
            >
              Rankings
            </Link>
            <span className="text-[oklch(0.3_0_0)]">/</span>
            {categorySlug ? (
              <Link
                href={`/gluten-free/${citySlug}/${neighborhoodSlug}`}
                className="font-mono text-[10px] uppercase tracking-[0.25em] text-[oklch(0.58_0_0)] hover:text-white transition-colors"
              >
                {neighborhood}
              </Link>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[oklch(0.75_0_0)]">
                {neighborhood}
              </span>
            )}
            {catDef && (
              <>
                <span className="text-[oklch(0.3_0_0)]">/</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[oklch(0.75_0_0)]">
                  {catDef.label}
                </span>
              </>
            )}
          </div>

          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[oklch(0.58_0_0)] mb-4">
            CleanPlate · {city}
          </p>

          <h1
            className="font-[family-name:var(--font-display)] leading-tight mb-5"
            style={{ fontSize: "clamp(2rem, 6vw, 4rem)", letterSpacing: "0.02em" }}
          >
            {h1}
          </h1>

          <p className="font-mono text-[13px] leading-[1.7] text-[oklch(0.72_0_0)] max-w-2xl">
            {intro}
          </p>
        </div>
      </section>

      {/* ── Restaurant list ── */}
      <section className="px-4 md:px-8 py-10">
        <div className="max-w-4xl mx-auto">
          <div
            className="flex items-center justify-between py-3 border-b mb-1"
            style={{ borderColor: "oklch(0.22 0 0)" }}
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[oklch(0.58_0_0)]">
              {restaurants.length} Restaurant{restaurants.length !== 1 ? "s" : ""} — Ranked by GF Safety
            </span>
          </div>

          <div className="space-y-0">
            {restaurants.map((r, i) => {
              const color = getGaugeColor(r.score);
              const { label } = getScoreLabel(r.score);
              const summary = r.dossier?.summary?.short_summary;

              return (
                <Link
                  key={r.id}
                  href={r.slug ? `/restaurant/${r.slug}` : `/restaurant/${r.id}`}
                  className="grid grid-cols-[3rem_1fr_auto] md:grid-cols-[4rem_1fr_auto] items-start border-b gap-3 md:gap-8 py-4 md:py-5 px-2 md:px-4 transition-colors duration-150 hover:bg-[oklch(0.11_0_0)]"
                  style={{ borderColor: "oklch(0.18 0 0)", borderLeft: `2px solid ${color}` }}
                >
                  {/* Rank */}
                  <span
                    className="font-[family-name:var(--font-display)] leading-none tabular-nums text-right pt-0.5"
                    style={{ fontSize: "clamp(1rem, 2vw, 1.5rem)", color: i < 3 ? color : "oklch(0.45 0 0)" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>

                  {/* Name + meta */}
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span
                        className="font-[family-name:var(--font-display)] leading-tight"
                        style={{ fontSize: "clamp(1rem, 2.5vw, 1.75rem)", color: "oklch(0.95 0 0)", letterSpacing: "0.02em" }}
                      >
                        {r.name}
                      </span>
                      {isNewRestaurant(r.source, r.ingested_at) && (
                        <span className="font-mono text-[9px] uppercase tracking-[0.2em] px-1.5 py-0.5 shrink-0" style={{ backgroundColor: "#FF744420", color: "#FF7444", border: "1px solid #FF744450" }}>
                          New
                        </span>
                      )}
                    </div>
                    {r.cuisine && (
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[oklch(0.58_0_0)] mt-1">
                        {r.cuisine}
                      </p>
                    )}
                    {summary && (
                      <p className="text-[13px] leading-[1.6] text-[oklch(0.72_0_0)] mt-1.5 max-w-lg line-clamp-2">
                        {summary}
                      </p>
                    )}
                  </div>

                  {/* Score */}
                  <div className="flex flex-col items-end shrink-0 pt-0.5">
                    <span
                      className="font-[family-name:var(--font-display)] leading-none tabular-nums"
                      style={{ fontSize: "clamp(1.25rem, 3vw, 2.25rem)", color }}
                    >
                      {Math.round(r.score)}
                    </span>
                    <span
                      className="hidden md:block font-mono text-[9px] uppercase tracking-[0.15em] mt-1"
                      style={{ color: `${color}cc` }}
                    >
                      {label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* ── Internal links ── */}
          <div className="mt-14 pt-8 border-t space-y-8" style={{ borderColor: "oklch(0.22 0 0)" }}>

            {/* Other GF options in this neighborhood (base neighborhood page) */}
            {!categorySlug && (
              <div>
                <h2 className="font-mono text-[10px] uppercase tracking-[0.25em] text-[oklch(0.58_0_0)] mb-4">
                  More GF Options in {neighborhood}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {availableCategories.map(([cs, def]) => (
                    <Link
                      key={cs}
                      href={`/gluten-free/${citySlug}/${neighborhoodSlug}/${cs}`}
                      className="font-mono text-[10px] uppercase tracking-[0.15em] px-3 py-2 border transition-colors duration-150 hover:border-[#FF7444] hover:text-[#FF7444]"
                      style={{ borderColor: "oklch(0.28 0 0)", color: "oklch(0.65_0_0)" }}
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
                  <h2 className="font-mono text-[10px] uppercase tracking-[0.25em] text-[oklch(0.58_0_0)] mb-4">
                    All GF Restaurants in {neighborhood}
                  </h2>
                  <Link
                    href={`/gluten-free/${citySlug}/${neighborhoodSlug}`}
                    className="font-mono text-[11px] uppercase tracking-[0.15em] px-4 py-2.5 border transition-colors duration-150 hover:border-[#FF7444] hover:text-[#FF7444] inline-block"
                    style={{ borderColor: "oklch(0.28 0 0)", color: "oklch(0.65_0_0)" }}
                  >
                    View All GF Restaurants →
                  </Link>
                </div>
                <div>
                  <h2 className="font-mono text-[10px] uppercase tracking-[0.25em] text-[oklch(0.58_0_0)] mb-4">
                    {catDef.cityLabelPlural} in {city}
                  </h2>
                  <Link
                    href={`/gluten-free/${citySlug}/${categorySlug}`}
                    className="font-mono text-[11px] uppercase tracking-[0.15em] px-4 py-2.5 border transition-colors duration-150 hover:border-[#FF7444] hover:text-[#FF7444] inline-block"
                    style={{ borderColor: "oklch(0.28 0 0)", color: "oklch(0.65_0_0)" }}
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
                className="font-mono text-[11px] uppercase tracking-[0.15em] px-4 py-2.5 border transition-colors duration-150 hover:border-[#FF7444] hover:text-[#FF7444] inline-block"
                style={{ borderColor: "oklch(0.28 0 0)", color: "oklch(0.65_0_0)" }}
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
