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
  type: "gf_food" | "place_type";
  value: string;
  label: string;
  labelPlural: string;
};

const CATEGORIES: Record<string, CategoryDef> = {
  "pizza":       { type: "gf_food",    value: "gf_pizza",        label: "GF Pizza",     labelPlural: "GF Pizza Spots"           },
  "pasta":       { type: "gf_food",    value: "gf_pasta",        label: "GF Pasta",     labelPlural: "GF Pasta Restaurants"     },
  "bakery":      { type: "gf_food",    value: "gf_bread_bakery", label: "GF Bakery",    labelPlural: "GF Bakeries"              },
  "breakfast":   { type: "gf_food",    value: "gf_breakfast",    label: "GF Breakfast", labelPlural: "GF Breakfast Spots"       },
  "cafe":        { type: "place_type", value: "cafe",            label: "Café",         labelPlural: "Cafés"                    },
  "bar":         { type: "place_type", value: "bar",             label: "Bar",          labelPlural: "Bars"                     },
  "fine-dining": { type: "place_type", value: "fine_dining",     label: "Fine Dining",  labelPlural: "Fine Dining Restaurants"  },
};

// ── Slug resolution ───────────────────────────────────────────────────────────

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
  cuisine: string | null;
  dossier: { summary?: { short_summary?: string } } | null;
  source: string | null;
  ingested_at: string | null;
};

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [citySlug, neighborhoodSlug, categorySlug] = slug ?? [];
  if (!citySlug || !neighborhoodSlug) return {};

  const resolved = await resolveSlugs(citySlug, neighborhoodSlug);
  if (!resolved) return {};

  const { city, neighborhood } = resolved;
  const catDef = categorySlug ? CATEGORIES[categorySlug] : null;

  const title = catDef
    ? `Best ${catDef.labelPlural} in ${neighborhood}, ${city} | CleanPlate`
    : `Best Gluten-Free Restaurants in ${neighborhood}, ${city} | CleanPlate`;

  const description = catDef
    ? `Top gluten-free ${catDef.label.toLowerCase()} spots in ${neighborhood}, ${city} ranked by GF safety score. Find places with dedicated fryers, clear labeling, and low cross-contamination risk.`
    : `The best gluten-free restaurants in ${neighborhood}, ${city} ranked by GF safety score. Find places with dedicated fryers, clear labeling, and low cross-contamination risk.`;

  const canonicalPath = `/gluten-free/${citySlug}/${neighborhoodSlug}${categorySlug ? `/${categorySlug}` : ""}`;

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
  const [citySlug, neighborhoodSlug, categorySlug] = slug ?? [];

  if (!citySlug || !neighborhoodSlug) notFound();

  const resolved = await resolveSlugs(citySlug, neighborhoodSlug);
  if (!resolved) notFound();

  const { city, neighborhood } = resolved;
  const catDef = categorySlug ? CATEGORIES[categorySlug] : null;
  if (categorySlug && !catDef) notFound();

  // ── Fetch restaurants ────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from("restaurants")
    .select("id, name, score, cuisine, dossier, source, ingested_at")
    .not("score", "is", null)
    .eq("city", city)
    .eq("neighborhood", neighborhood)
    .order("score", { ascending: false })
    .limit(25);

  if (catDef?.type === "gf_food")    query = query.contains("gf_food_categories", [catDef.value]);
  if (catDef?.type === "place_type") query = query.contains("place_type",         [catDef.value]);
  // Only show well-rated restaurants — don't recommend low-quality GF experiences
  query = query.gte("score", 75);

  const { data } = await query;
  const restaurants = (data ?? []) as RestaurantRow[];

  if (restaurants.length < 3) notFound();

  // ── Content ──────────────────────────────────────────────────────────────
  const h1 = catDef
    ? `Best ${catDef.labelPlural} in ${neighborhood}, ${city}`
    : `Best Gluten-Free Restaurants in ${neighborhood}, ${city}`;

  const intro = catDef
    ? `Looking for gluten-free ${catDef.label.toLowerCase()} in ${neighborhood}? CleanPlate rates ${restaurants.length} spot${restaurants.length !== 1 ? "s" : ""} in ${neighborhood} based on GF safety signals including cross-contamination risk, dedicated fryers, menu labeling, and real diner experiences.`
    : `Looking for gluten-free restaurants in ${neighborhood}? CleanPlate rates ${restaurants.length} restaurant${restaurants.length !== 1 ? "s" : ""} in ${neighborhood} based on GF safety signals including cross-contamination risk, dedicated fryers, menu labeling, and real diner experiences.`;

  const availableCategories = Object.entries(CATEGORIES).filter(([cs]) => cs !== categorySlug);

  return (
    <main className="pt-16">
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
              const summary = (r.dossier as { summary?: { short_summary?: string } } | null)?.summary?.short_summary;

              return (
                <Link
                  key={r.id}
                  href={`/restaurant/${r.id}`}
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

          {/* ── Internal links (S6b) ── */}
          <div className="mt-14 pt-8 border-t space-y-8" style={{ borderColor: "oklch(0.22 0 0)" }}>

            {/* Other GF options in this neighborhood (shown on base neighborhood page) */}
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

            {/* Back to neighborhood page (shown on category pages) */}
            {categorySlug && (
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
