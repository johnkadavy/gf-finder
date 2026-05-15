import { cache, Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { createClient } from "@/lib/supabase-server";
import { SaveButton } from "@/app/components/SaveButton";
import {
  calculateScore,
  getGaugeColor,
  getScoreLabel,
  type ScoringDossier,
  type VerifiedData,
} from "@/lib/score";
import { SafetyGauge } from "@/app/components/SafetyGauge";
import { ReviewForm } from "@/app/components/ReviewForm";
import { StickyInfoBar } from "@/app/components/StickyInfoBar";
import { isNewRestaurant, formatLocation } from "@/lib/utils";
import { SIGNAL_COLORS, SIGNAL_BG, SIGNAL_BORDER } from "@/lib/tokens";
import { CollapsibleText } from "./CollapsibleText";

type OpeningHours = {
  weekdayDescriptions?: string[];
};

type Dossier = ScoringDossier & {
  summary?: { short_summary?: string };
};

type MenuItem = {
  name: string;
  description?: string;
  gf: boolean | null;
};

type MenuSection = {
  section: string | null;
  items: MenuItem[];
};

type MenuData = {
  menu_sections?: MenuSection[];
  menu_items?: MenuItem[];
  menu_source?: string;
  confidence?: string;
};

type Restaurant = {
  id: number;
  name: string;
  city: string;
  neighborhood: string | null;
  region: string | null;
  address: string | null;
  phone: string | null;
  website_url: string | null;
  google_maps_url: string | null;
  google_rating: number | null;
  price_level: number | null;
  cuisine: string | null;
  opening_hours: OpeningHours | null;
  dossier: Dossier | null;
  verified_data: VerifiedData | null;
  google_place_id: string | null;
  source: string | null;
  ingested_at: string | null;
  slug: string | null;
  gf_food_categories: string[] | null;
  restaurant_description: string | null;
  menu_items: MenuData | null;
};

type VerifiedVisit = {
  visit_date: string | null;
  overall_sentiment: string | null;
  staff_knowledge: string | null;
  gf_labeling: string | null;
  gf_options_level: string | null;
  cross_contamination_risk: string | null;
  dedicated_fryer: string | null;
  notes: string | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function priceSymbol(level: number | null): string {
  if (level === null) return "";
  return ["Free", "$", "$$", "$$$", "$$$$"][level] ?? "";
}

// ── Signal types ───────────────────────────────────────────────────────────

type SignalLevel = "positive" | "neutral" | "warning" | "negative" | "unknown";

function signalColor(level: SignalLevel): string {
  return SIGNAL_COLORS[level] ?? SIGNAL_COLORS.unknown;
}

function signalBg(level: SignalLevel): string {
  return SIGNAL_BG[level] ?? SIGNAL_BG.unknown;
}

function signalBorder(level: SignalLevel): string {
  return SIGNAL_BORDER[level] ?? SIGNAL_BORDER.unknown;
}

// ── GF food category tags ─────────────────────────────────────────────────

const GF_FOOD_LABELS: Record<string, string> = {
  gf_pizza:       "GF Pizza",
  gf_pasta:       "GF Pasta",
  gf_bread:       "GF Bread",
  gf_baked_goods: "GF Pastries",
  gf_bagels:      "GF Bagels",
  gf_beer:        "GF Beer",
  gf_fried_items: "GF Fryer",
  gf_desserts:    "GF Desserts",
  gf_sandwiches:  "GF Sandwiches",
  gf_buns:        "GF Buns",
  gf_breakfast:   "GF Breakfast",
  gf_soy_sauce:   "GF Soy Sauce",
};

function GfFoodTags({ categories }: { categories: string[] | null }) {
  const tags = (categories ?? []).filter((c) => GF_FOOD_LABELS[c]);
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((cat) => (
        <span
          key={cat}
          className="inline-flex items-center px-2.5 py-1 font-mono text-ui-xs uppercase tracking-label border"
          style={{
            borderColor: SIGNAL_BORDER.positive,
            backgroundColor: SIGNAL_BG.positive,
            color: SIGNAL_COLORS.positive,
          }}
        >
          {GF_FOOD_LABELS[cat]}
        </span>
      ))}
    </div>
  );
}

// ── Metadata ───────────────────────────────────────────────────────────────

function buildSignalSummary(d: ScoringDossier | null): string {
  if (!d) return "";
  const signals: string[] = [];
  if (d.operations?.dedicated_equipment?.prep_area === "dedicated") signals.push("dedicated GF prep area");
  if (d.operations?.dedicated_equipment?.fryer)                     signals.push("dedicated GF fryer");
  if (d.menu?.gf_labeling === "clear")                              signals.push("clearly labeled menu");
  if (d.operations?.cross_contamination_risk === "low")             signals.push("low cross-contamination risk");
  if (d.operations?.staff_knowledge === "high")                     signals.push("knowledgeable staff");
  const top = signals.slice(0, 3);
  if (top.length === 0) return "";
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (top.length === 1) return ` ${cap(top[0])}.`;
  if (top.length === 2) return ` ${cap(top[0])} and ${top[1]}.`;
  return ` ${cap(top[0])}, ${top[1]}, and ${top[2]}.`;
}

// ── Auth — deferred behind Suspense so it never blocks the page shell ───────

const getRestaurantAuth = cache(async (restaurantId: number) => {
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return false;
  const { data: save } = await serverClient
    .from("saved_restaurants")
    .select("id")
    .eq("user_id", user.id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  return !!save;
});

async function SaveState({
  restaurantId,
  redirectPath,
  showLabel,
}: {
  restaurantId: number;
  redirectPath: string;
  showLabel?: boolean;
}) {
  const initialSaved = await getRestaurantAuth(restaurantId);
  return (
    <SaveButton
      restaurantId={restaurantId}
      initialSaved={initialSaved}
      redirectPath={redirectPath}
      showLabel={showLabel}
    />
  );
}

// ── Slug resolution ────────────────────────────────────────────────────────

async function resolveRestaurant(slugOrId: string) {
  const isNumericId = /^\d+$/.test(slugOrId);

  if (isNumericId) {
    const { data } = await supabase
      .from("restaurants")
      .select("slug")
      .eq("id", slugOrId)
      .single();
    if (data?.slug) redirect(`/restaurant/${data.slug}`);
    return null;
  }

  const { data } = await supabase
    .from("restaurants")
    .select("id, name, city, neighborhood, region, address, phone, website_url, google_maps_url, google_rating, price_level, cuisine, opening_hours, dossier, verified_data, google_place_id, source, ingested_at, slug, gf_food_categories, restaurant_description, menu_items")
    .eq("slug", slugOrId)
    .single();

  return data ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const isNumericId = /^\d+$/.test(slug);

  const query = isNumericId
    ? supabase.from("restaurants").select("name, city, neighborhood, region, dossier, verified_data, slug").eq("id", slug).single()
    : supabase.from("restaurants").select("name, city, neighborhood, region, dossier, verified_data, slug").eq("slug", slug).single();

  const { data } = await query;
  if (!data) return {};

  const score = data.dossier
    ? calculateScore(data.dossier as ScoringDossier, (data.verified_data ?? undefined) as VerifiedData | undefined)
    : null;
  const d = data.dossier as ScoringDossier | null;
  const location = formatLocation(data.neighborhood, data.city, data.region, ", ");
  const canonicalUrl = `/restaurant/${data.slug ?? slug}`;

  const title = `${data.name} — Gluten-Free Safety Rating | CleanPlate`;
  const description = score !== null
    ? `${data.name}${location ? ` in ${location}` : ""} scores ${Math.round(score)}/100 for gluten-free safety.${buildSignalSummary(d)} See the full GF breakdown on CleanPlate.`
    : `Find gluten-free details for ${data.name}${location ? ` in ${location}` : ""} — menu labeling, cross-contamination risk, and GF safety signals on CleanPlate.`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonicalUrl,
    },
  };
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function RestaurantPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { slug } = await params;
  const { from } = await searchParams;
  const fromMap = from === "map";

  const data = await resolveRestaurant(slug);
  if (!data) notFound();

  const r = data as Restaurant;

  const { data: visitData } = r.google_place_id
    ? await supabase
        .from("verified_visits")
        .select("visit_date, overall_sentiment, staff_knowledge, gf_labeling, gf_options_level, cross_contamination_risk, dedicated_fryer, notes")
        .eq("google_place_id", r.google_place_id)
        .order("visit_date", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const visit = visitData as VerifiedVisit | null;
  const score = r.dossier ? calculateScore(r.dossier, r.verified_data ?? undefined) : null;

  const { label: scoreLabel } = getScoreLabel(score);
  const color = getGaugeColor(score);
  const d = r.dossier;
  const cuisine = r.cuisine;
  const menuData = r.menu_items;
  const allSections: MenuSection[] = menuData?.confidence !== "low"
    ? (menuData?.menu_sections ?? (menuData?.menu_items ? [{ section: null, items: menuData.menu_items }] : []))
    : [];
  const gfSections: MenuSection[] = allSections
    .map((s) => ({ ...s, items: s.items.filter((item) => item.gf === true) }))
    .filter((s) => s.items.length > 0);
  const gfItemCount = gfSections.flatMap((s) => s.items).length;
  const sickCount = d?.reviews?.sick_reports_recent ?? 0;
  const sickSourceUrl = d?.reviews?.sick_reports_details?.find((r) => r.source_url)?.source_url ?? null;
  const price = priceSymbol(r.price_level);
  const hours = r.opening_hours?.weekdayDescriptions;

  // ── Signal levels ──────────────────────────────────────────────────────

  const labelingLevel: SignalLevel =
    d?.menu?.gf_labeling === "clear"   ? "positive" :
    d?.menu?.gf_labeling === "partial" ? "neutral"  :
    d?.menu?.gf_labeling === "none"    ? "negative" : "unknown";

  const labelingText =
    d?.menu?.gf_labeling === "clear"   ? "Clearly labeled" :
    d?.menu?.gf_labeling === "partial" ? "Partially labeled" :
    d?.menu?.gf_labeling === "none"    ? "Not labeled" : "Unknown";

  const optionsLevel: SignalLevel =
    d?.menu?.gf_options_level === "many"  ? "positive" :
    d?.menu?.gf_options_level === "ample" ? "positive" :
    d?.menu?.gf_options_level === "few"   ? "warning"  :
    d?.menu?.gf_options_level === "none"  ? "negative" : "unknown";

  const optionsText =
    d?.menu?.gf_options_level === "many"  ? "Many options" :
    d?.menu?.gf_options_level === "ample" ? "Ample options" :
    d?.menu?.gf_options_level === "few"   ? "Few options" :
    d?.menu?.gf_options_level === "none"  ? "No options" : "Unknown";

  const staffLevel: SignalLevel =
    d?.operations?.staff_knowledge === "high"   ? "positive" :
    d?.operations?.staff_knowledge === "medium" ? "neutral"  :
    d?.operations?.staff_knowledge === "low"    ? "negative" : "unknown";

  const staffText =
    d?.operations?.staff_knowledge === "high"   ? "High" :
    d?.operations?.staff_knowledge === "medium" ? "Medium" :
    d?.operations?.staff_knowledge === "low"    ? "Low" : "Unknown";

  const contamLevel: SignalLevel =
    d?.operations?.cross_contamination_risk === "low"    ? "positive" :
    d?.operations?.cross_contamination_risk === "medium" ? "warning"  :
    d?.operations?.cross_contamination_risk === "high"   ? "negative" : "unknown";

  const contamText =
    d?.operations?.cross_contamination_risk === "low"    ? "Low" :
    d?.operations?.cross_contamination_risk === "medium" ? "Medium" :
    d?.operations?.cross_contamination_risk === "high"   ? "High" : "Unknown";

  const sentimentLevel: SignalLevel =
    d?.reviews?.recent_sentiment === "mostly_positive" ? "positive" :
    d?.reviews?.recent_sentiment === "mixed"           ? "neutral"  :
    d?.reviews?.recent_sentiment === "mostly_negative" ? "negative" : "unknown";

  const sentimentText =
    d?.reviews?.recent_sentiment === "mostly_positive" ? "Mostly positive" :
    d?.reviews?.recent_sentiment === "mixed"           ? "Mixed" :
    d?.reviews?.recent_sentiment === "mostly_negative" ? "Mostly negative" : "Unknown";

  // ── JSON-LD ──────────────────────────────────────────────────────────────
  const reviewCount = (d?.reviews?.positive_count ?? 0) + (d?.reviews?.negative_count ?? 0);
  const summary = d?.summary?.short_summary;

  const openingHoursSpec: string[] = [];
  const dayMap: Record<string, string> = {
    Monday: "Mo", Tuesday: "Tu", Wednesday: "We", Thursday: "Th",
    Friday: "Fr", Saturday: "Sa", Sunday: "Su",
  };
  for (const line of r.opening_hours?.weekdayDescriptions ?? []) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (!m) continue;
    const day = dayMap[m[1]];
    if (!day) continue;
    const times = m[2].trim();
    if (times.toLowerCase() === "closed") continue;
    const rangeParts = times.split(/\s*[–-]\s*/);
    if (rangeParts.length !== 2) continue;
    const toH = (t: string) => {
      const pm = /pm/i.test(t);
      const [h, mm] = t.replace(/[^\d:]/g, "").split(":");
      let hour = parseInt(h, 10);
      if (pm && hour !== 12) hour += 12;
      if (!pm && hour === 12) hour = 0;
      return `${String(hour).padStart(2, "0")}:${mm ?? "00"}`;
    };
    openingHoursSpec.push(`${day} ${toH(rangeParts[0])}-${toH(rangeParts[1])}`);
  }

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "name": r.name,
    ...(summary ? { "description": summary } : {}),
    ...(r.address ? {
      "address": {
        "@type": "PostalAddress",
        "streetAddress": r.address,
        "addressLocality": r.neighborhood ?? r.city,
        "addressRegion": "NY",
        "addressCountry": "US",
      },
    } : {}),
    ...(r.phone          ? { "telephone": r.phone }                      : {}),
    ...(r.website_url    ? { "url": r.website_url }                      : {}),
    ...(r.google_maps_url ? { "hasMap": r.google_maps_url,
                               "sameAs": r.google_maps_url }             : {}),
    ...(r.cuisine        ? { "servesCuisine": r.cuisine }                : {}),
    ...(r.price_level    ? { "priceRange": priceSymbol(r.price_level) }  : {}),
    ...(openingHoursSpec.length > 0 ? { "openingHours": openingHoursSpec } : {}),
    ...(score !== null && reviewCount >= 3 ? {
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": (score / 20).toFixed(1),
        "bestRating": "5",
        "worstRating": "1",
        "reviewCount": reviewCount,
      },
    } : {}),
  };

  const redirectPath = `/restaurant/${r.slug ?? r.id}`;

  return (
    <main className="pt-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <StickyInfoBar name={r.name} score={score} googleMapsUrl={r.google_maps_url} />

      <div className="max-w-6xl mx-auto px-6 pt-10 pb-32">

        {/* ── Utility row ── */}
        <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
          <Link
            href={fromMap ? "/map" : "/rankings"}
            className="font-mono text-ui-sm uppercase tracking-label transition-colors"
            style={{ color: "var(--text-dim)" }}
          >
            {fromMap ? "← Map" : "← Rankings"}
          </Link>
          <div className="flex flex-wrap gap-2">
            <Suspense fallback={<SaveButton restaurantId={r.id} initialSaved={false} redirectPath={redirectPath} showLabel />}>
              <SaveState restaurantId={r.id} redirectPath={redirectPath} showLabel />
            </Suspense>
            {r.google_maps_url && (
              <a
                href={r.google_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-ui-sm uppercase tracking-label px-4 py-2.5 border transition-all inline-flex items-center gap-2"
                style={{ borderColor: "var(--border-default)", color: "var(--text-label)" }}
              >
                Directions <span style={{ opacity: 0.7 }}>↗</span>
              </a>
            )}
            {r.website_url && (
              <a
                href={r.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-ui-sm uppercase tracking-label px-4 py-2.5 border transition-all inline-flex items-center gap-2"
                style={{ borderColor: "var(--border-default)", color: "var(--text-label)" }}
              >
                Website <span style={{ opacity: 0.7 }}>↗</span>
              </a>
            )}
          </div>
        </div>

        {/* ── Hero ── */}
        <div
          className="border mb-12 relative overflow-hidden"
          style={{ borderColor: "var(--border-default)", backgroundColor: "var(--surface-raised)" }}
        >
          {/* Radial gradient decoration */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(circle at 70% 50%, color-mix(in oklch, var(--score-good) 6%, transparent), transparent 60%)" }}
          />

          <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-12 p-8 md:p-14">

            {/* Left */}
            <div className="flex flex-col">

              {/* Meta row */}
              <div
                className="flex flex-wrap items-center gap-3 mb-6 font-mono text-ui-sm uppercase tracking-label"
                style={{ color: "var(--text-dim)" }}
              >
                {cuisine && <span>{cuisine}</span>}
                {cuisine && <span style={{ color: "var(--text-disabled)" }}>·</span>}
                <span>{formatLocation(r.neighborhood, r.city, r.region, ", ")}</span>
                {price && (
                  <>
                    <span style={{ color: "var(--text-disabled)" }}>·</span>
                    <span>{price}</span>
                  </>
                )}
                {r.google_rating && (
                  <>
                    <span style={{ color: "var(--text-disabled)" }}>·</span>
                    <span style={{ color: "var(--text-tertiary)" }}>
                      ★ {r.google_rating.toFixed(1)} Google
                    </span>
                  </>
                )}
              </div>

              {/* New badge */}
              {isNewRestaurant(r.source, r.ingested_at) && (
                <span
                  className="self-start font-mono text-ui-xs uppercase tracking-label px-1.5 py-0.5 mb-3 border"
                  style={{ backgroundColor: "var(--accent-tint-md)", color: "var(--accent)", borderColor: "var(--accent-tint-lg)" }}
                >
                  New
                </span>
              )}

              {/* Restaurant name */}
              <h1
                className="font-[family-name:var(--font-display)] leading-none mb-7"
                style={{ fontSize: "clamp(3rem, 7vw, 5.5rem)", letterSpacing: "0.01em", color: "var(--text-primary)" }}
              >
                {r.name}
              </h1>

              {/* Illness warning */}
              {sickCount > 0 && (
                <div
                  className="self-start inline-flex items-center gap-2.5 px-3 py-2 border mb-5"
                  style={{ borderColor: "var(--accent-tint-lg)", backgroundColor: "var(--accent-tint-xs)" }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                  {sickSourceUrl ? (
                    <a href={sickSourceUrl} target="_blank" rel="noopener noreferrer"
                      className="font-mono text-ui-sm uppercase tracking-label text-accent hover:underline">
                      {sickCount} illness report{sickCount !== 1 ? "s" : ""} — past 6 months
                    </a>
                  ) : (
                    <span className="font-mono text-ui-sm uppercase tracking-label text-accent">
                      {sickCount} illness report{sickCount !== 1 ? "s" : ""} — past 6 months
                    </span>
                  )}
                </div>
              )}

              {/* Verdict block */}
              {score !== null && (
                <div
                  className="flex flex-wrap items-baseline gap-5 py-5 border-y mb-6"
                  style={{ borderColor: "var(--border-default)" }}
                >
                  <span
                    className="font-[family-name:var(--font-display)] text-4xl"
                    style={{ color, letterSpacing: "0.02em" }}
                  >
                    {scoreLabel}
                  </span>
                  {d?.data_quality?.confidence && (
                    <span
                      className="font-mono text-ui-sm uppercase tracking-label flex items-center gap-2"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: d.data_quality.confidence === "high"
                            ? "var(--signal-positive)"
                            : "var(--signal-warning)",
                        }}
                      />
                      {d.data_quality.confidence} confidence
                    </span>
                  )}
                </div>
              )}

              {/* Summary */}
              {d?.summary?.short_summary && (
                <p
                  className="font-sans text-base leading-[1.55] mb-7"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {d.summary.short_summary}
                </p>
              )}

              {/* GF food tags */}
              {r.gf_food_categories && r.gf_food_categories.length > 0 && (
                <div className="border-t pt-5 mt-auto" style={{ borderColor: "var(--border-subtle)" }}>
                  <p
                    className="font-mono text-ui-xs uppercase tracking-label mb-3 flex items-center gap-2"
                    style={{ color: "var(--text-dim)" }}
                  >
                    <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: "var(--signal-positive)" }} />
                    Gluten-Free Offerings
                  </p>
                  <GfFoodTags categories={r.gf_food_categories} />
                </div>
              )}
            </div>

            {/* Right — score gauge */}
            <div className="flex items-center justify-center py-4 md:py-0 order-first md:order-last">
              <SafetyGauge score={score} size="lg" showDescriptor={false} />
            </div>
          </div>
        </div>

        {/* ── Risk strip — 3 primary signals ── */}
        {d && (
          <div
            className="grid grid-cols-1 md:grid-cols-3 border mb-px"
            style={{ borderColor: "var(--border-default)", backgroundColor: "var(--surface-raised)" }}
          >
            {/* Cross-contamination */}
            <div className="p-7 border-b md:border-b-0 md:border-r" style={{ borderColor: "var(--border-default)" }}>
              <div className="flex items-center gap-2 font-mono text-ui-xs uppercase tracking-label mb-4" style={{ color: "var(--text-dim)" }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: signalColor(contamLevel) }} />
                Cross-Contamination
              </div>
              <div
                className="font-[family-name:var(--font-display)] text-3xl mb-3"
                style={{ color: signalColor(contamLevel), letterSpacing: "0.02em" }}
              >
                {contamText}
              </div>
              <p className="font-mono text-ui-md leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                {contamLevel === "positive" ? "Low risk of cross-contamination reported." :
                 contamLevel === "warning"  ? "Shared prep surfaces or fryer. Confirm practices on arrival." :
                 contamLevel === "negative" ? "High cross-contamination risk in this kitchen." :
                 "Contamination risk level not yet assessed."}
              </p>
            </div>

            {/* Staff knowledge */}
            <div className="p-7 border-b md:border-b-0 md:border-r" style={{ borderColor: "var(--border-default)" }}>
              <div className="flex items-center gap-2 font-mono text-ui-xs uppercase tracking-label mb-4" style={{ color: "var(--text-dim)" }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: signalColor(staffLevel) }} />
                Staff Knowledge
              </div>
              <div
                className="font-[family-name:var(--font-display)] text-3xl mb-3"
                style={{ color: signalColor(staffLevel), letterSpacing: "0.02em" }}
              >
                {staffText}
              </div>
              <p className="font-mono text-ui-md leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                {staffLevel === "positive" ? "Staff are knowledgeable and can guide GF diners confidently." :
                 staffLevel === "neutral"  ? "Staff have some GF awareness but may need prompting." :
                 staffLevel === "negative" ? "Limited staff knowledge reported — ask for a manager." :
                 "Staff knowledge level not yet assessed."}
              </p>
            </div>

            {/* Illness reports */}
            <div className="p-7">
              <div className="flex items-center gap-2 font-mono text-ui-xs uppercase tracking-label mb-4" style={{ color: "var(--text-dim)" }}>
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: signalColor(sickCount > 0 ? "negative" : "positive") }}
                />
                Illness Reports
              </div>
              <div
                className="font-[family-name:var(--font-display)] text-3xl mb-3"
                style={{ color: signalColor(sickCount > 0 ? "negative" : "positive"), letterSpacing: "0.02em" }}
              >
                {sickCount > 0 ? `${sickCount} Reported` : "None"}
              </div>
              <p className="font-mono text-ui-md leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                {sickCount > 0
                  ? `${sickCount} gluten-related illness report${sickCount !== 1 ? "s" : ""} in the past 6 months.`
                  : "No GF-related illness reports found in recent data."}
              </p>
            </div>
          </div>
        )}

        {/* ── Secondary strip — 3 supplementary signals ── */}
        {d && (
          <div
            className="grid grid-cols-1 md:grid-cols-3 gap-px mb-16"
            style={{ backgroundColor: "var(--border-subtle)" }}
          >
            <div className="px-7 py-5" style={{ backgroundColor: "var(--surface-base)" }}>
              <div className="flex items-center gap-2 font-mono text-ui-xs uppercase tracking-label mb-2" style={{ color: "var(--text-dim)" }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: signalColor(labelingLevel) }} />
                GF Labeling
              </div>
              <div className="font-mono text-ui-md uppercase tracking-label" style={{ color: "var(--text-secondary)" }}>
                {labelingText}
              </div>
            </div>

            <div className="px-7 py-5" style={{ backgroundColor: "var(--surface-base)" }}>
              <div className="flex items-center gap-2 font-mono text-ui-xs uppercase tracking-label mb-2" style={{ color: "var(--text-dim)" }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: signalColor(optionsLevel) }} />
                GF Options
              </div>
              <div className="font-mono text-ui-md uppercase tracking-label" style={{ color: "var(--text-secondary)" }}>
                {gfItemCount > 0 ? `${gfItemCount} item${gfItemCount !== 1 ? "s" : ""} identified` : optionsText}
              </div>
            </div>

            <div className="px-7 py-5" style={{ backgroundColor: "var(--surface-base)" }}>
              <div className="flex items-center gap-2 font-mono text-ui-xs uppercase tracking-label mb-2" style={{ color: "var(--text-dim)" }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: signalColor(sentimentLevel) }} />
                GF Sentiment
              </div>
              <div className="font-mono text-ui-md uppercase tracking-label" style={{ color: "var(--text-secondary)" }}>
                {sentimentText}
              </div>
            </div>
          </div>
        )}

        {/* ── About ── */}
        {r.restaurant_description && (
          <section
            className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-12 py-12 border-t"
            style={{ borderColor: "var(--border-default)" }}
          >
            <div className="font-mono text-ui-sm uppercase tracking-label" style={{ color: "var(--text-dim)" }}>
              About
            </div>
            <CollapsibleText
              text={r.restaurant_description.replace(/\[(high|medium|low)\]\s*$/i, "").trim()}
              className="font-sans text-base leading-[1.6]"
              style={{ color: "var(--text-secondary)" }}
            />
          </section>
        )}

        {/* ── GF Menu ── */}
        {gfSections.length > 0 && (
          <section
            className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-12 py-12 border-t"
            style={{ borderColor: "var(--border-default)" }}
          >
            <div>
              <div className="font-mono text-ui-sm uppercase tracking-label" style={{ color: "var(--text-dim)" }}>
                GF Menu
              </div>
              <div className="font-mono text-ui-xs uppercase tracking-label mt-1" style={{ color: "var(--text-disabled)" }}>
                Snapshot — verify on arrival
              </div>
            </div>

            <div>
              {/* Section header */}
              <div className="flex justify-between items-center mb-6">
                <div className="font-mono text-ui-xs uppercase tracking-label" style={{ color: "var(--text-dim)" }}>
                  {gfItemCount} item{gfItemCount !== 1 ? "s" : ""}
                </div>
                {menuData?.menu_source && (
                  <a
                    href={menuData.menu_source}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-ui-sm uppercase tracking-label px-4 py-2.5 border transition-all inline-flex items-center gap-2"
                    style={{ borderColor: "var(--border-default)", color: "var(--text-label)" }}
                  >
                    View Full Menu <span style={{ opacity: 0.7 }}>↗</span>
                  </a>
                )}
              </div>

              {/* Menu groups */}
              {gfSections.map((section, si) => (
                <div key={si} className={si > 0 ? "mt-7" : ""}>
                  {section.section && (
                    <div
                      className="flex items-center gap-3 font-mono text-ui-xs uppercase tracking-label mb-3"
                      style={{ color: "var(--text-dim)" }}
                    >
                      {section.section}
                      <div className="flex-1 h-px" style={{ backgroundColor: "var(--border-subtle)" }} />
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {section.items.map((item, i) => {
                      const displayName = item.name === item.name.toUpperCase()
                        ? item.name.charAt(0) + item.name.slice(1).toLowerCase()
                        : item.name;
                      return (
                        <div
                          key={i}
                          className="border p-5 flex flex-col gap-1.5"
                          style={{ borderColor: "var(--border-default)", backgroundColor: "var(--surface-raised)" }}
                        >
                          <div className="font-sans text-base leading-snug" style={{ color: "var(--text-primary)" }}>
                            {displayName}
                          </div>
                          {item.description && (
                            <div className="font-mono text-ui-md leading-relaxed" style={{ color: "var(--text-dim)" }}>
                              {item.description}
                            </div>
                          )}
                          <div className="flex gap-1.5 mt-1">
                            <span
                              className="font-mono text-ui-xs uppercase tracking-label px-1.5 py-0.5 border"
                              style={{
                                color: SIGNAL_COLORS.positive,
                                borderColor: SIGNAL_BORDER.positive,
                                backgroundColor: SIGNAL_BG.positive,
                              }}
                            >
                              GF
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Reviews ── */}
        {(visit || r.google_place_id) && (
          <section
            className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-12 py-12 border-t"
            style={{ borderColor: "var(--border-default)" }}
          >
            <div className="font-mono text-ui-sm uppercase tracking-label" style={{ color: "var(--text-dim)" }}>
              Reviews
            </div>

            <div className="space-y-5">
              {visit ? (
                <div
                  className="border p-6 space-y-5"
                  style={{ borderColor: signalBorder("positive"), backgroundColor: signalBg("positive") }}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--signal-positive)" }}>
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      <span className="font-mono text-ui-sm uppercase tracking-label" style={{ color: "var(--signal-positive)" }}>
                        Verified Visit
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {visit.overall_sentiment && (() => {
                        const sentLevel: SignalLevel =
                          visit.overall_sentiment === "mostly_positive" ? "positive" :
                          visit.overall_sentiment === "mixed"           ? "neutral"  : "negative";
                        return (
                          <span
                            className="font-mono text-ui-sm uppercase tracking-label px-2.5 py-1 border"
                            style={{
                              borderColor: signalBorder(sentLevel),
                              color: signalColor(sentLevel),
                              backgroundColor: signalBg(sentLevel),
                            }}
                          >
                            {visit.overall_sentiment === "mostly_positive" ? "Positive" :
                             visit.overall_sentiment === "mixed" ? "Mixed" : "Negative"}
                          </span>
                        );
                      })()}
                      {visit.visit_date && (
                        <span className="font-mono text-ui-sm uppercase tracking-label" style={{ color: "var(--text-dim)" }}>
                          {new Date(visit.visit_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                        </span>
                      )}
                    </div>
                  </div>

                  {visit.notes && (
                    <p className="text-ui-2xl leading-[1.7]" style={{ color: "var(--text-secondary)" }}>
                      {visit.notes}
                    </p>
                  )}

                  {(() => {
                    const chipLevel = (field: string, value: string): SignalLevel => {
                      if (field === "GF Labeling") return value === "clear" ? "positive" : value === "partial" ? "warning" : value === "none" ? "negative" : "unknown";
                      if (field === "GF Options") return value === "many" || value === "ample" ? "positive" : value === "moderate" ? "neutral" : value === "few" ? "warning" : value === "none" ? "negative" : "unknown";
                      if (field === "Staff Knowledge") return value === "high" ? "positive" : value === "medium" ? "neutral" : value === "low" ? "negative" : "unknown";
                      if (field === "Cross-Contamination") return value === "low" ? "positive" : value === "medium" ? "warning" : value === "high" ? "negative" : "unknown";
                      if (field === "Dedicated Fryer") return value === "yes" ? "positive" : "neutral";
                      return "unknown";
                    };
                    const chips: { label: string; value: string }[] = [];
                    if (visit.gf_labeling) chips.push({ label: "GF Labeling", value: visit.gf_labeling });
                    if (visit.gf_options_level) chips.push({ label: "GF Options", value: visit.gf_options_level });
                    if (visit.staff_knowledge) chips.push({ label: "Staff Knowledge", value: visit.staff_knowledge });
                    if (visit.cross_contamination_risk) chips.push({ label: "Cross-Contamination", value: visit.cross_contamination_risk });
                    if (visit.dedicated_fryer) chips.push({ label: "Dedicated Fryer", value: visit.dedicated_fryer });
                    if (chips.length === 0) return null;
                    return (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {chips.map(({ label, value }) => {
                          const level = chipLevel(label, value);
                          return (
                            <span
                              key={label}
                              className="font-mono text-ui-md uppercase tracking-label px-2.5 py-1 border"
                              style={{
                                borderColor: signalBorder(level),
                                color: signalColor(level),
                                backgroundColor: signalBg(level),
                              }}
                            >
                              {label}: {value}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <p className="font-mono text-ui-md" style={{ color: "var(--text-dim)" }}>
                  No verified reviews yet.
                </p>
              )}

              {r.google_place_id && (
                <ReviewForm restaurantId={r.id} googlePlaceId={r.google_place_id} />
              )}
            </div>
          </section>
        )}

        {/* ── Data confidence notice ── */}
        {d?.data_quality?.confidence && d.data_quality.confidence !== "high" && (
          <div className="py-6 border-t" style={{ borderColor: "var(--border-default)" }}>
            <p
              className="font-mono text-ui-sm uppercase tracking-label border-l-2 pl-4 py-1"
              style={{ borderColor: "var(--text-disabled)", color: "var(--text-tertiary)" }}
            >
              {d.data_quality.confidence === "low"
                ? "Limited data — scores are based on partial information and may not fully reflect this restaurant's practices."
                : "Moderate confidence — some signals are inferred. Confirm details directly with the restaurant."}
            </p>
          </div>
        )}

        {/* ── Logistics ── */}
        {(r.address || r.phone || r.website_url || r.google_maps_url || (hours && hours.length > 0)) && (
          <section
            className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-12 py-12 border-t"
            style={{ borderColor: "var(--border-default)" }}
          >
            <div className="font-mono text-ui-sm uppercase tracking-label" style={{ color: "var(--text-dim)" }}>
              Logistics
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
              {(r.address || r.phone) && (
                <div className="flex flex-col gap-5">
                  {r.address && (
                    <div>
                      <div className="font-mono text-ui-xs uppercase tracking-label mb-1.5" style={{ color: "var(--text-dim)" }}>
                        Address
                      </div>
                      <div className="font-mono text-ui-md leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        {r.address}
                      </div>
                    </div>
                  )}
                  {r.phone && (
                    <div>
                      <div className="font-mono text-ui-xs uppercase tracking-label mb-1.5" style={{ color: "var(--text-dim)" }}>
                        Phone
                      </div>
                      <a
                        href={`tel:${r.phone}`}
                        className="font-mono text-ui-md border-b pb-0.5 transition-colors"
                        style={{ color: "var(--text-secondary)", borderColor: "var(--border-default)" }}
                      >
                        {r.phone}
                      </a>
                    </div>
                  )}
                </div>
              )}

              {hours && hours.length > 0 && (
                <div>
                  <div className="font-mono text-ui-xs uppercase tracking-label mb-1.5" style={{ color: "var(--text-dim)" }}>
                    Hours
                  </div>
                  <div className="space-y-1.5">
                    {hours.map((line) => {
                      const [day, ...rest] = line.split(": ");
                      return (
                        <div key={line} className="flex justify-between gap-4">
                          <span className="font-mono text-ui-md" style={{ color: "var(--text-secondary)" }}>{day}</span>
                          <span className="font-mono text-ui-md text-right" style={{ color: "var(--text-secondary)" }}>{rest.join(": ")}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(r.website_url || r.google_maps_url) && (
                <div>
                  <div className="font-mono text-ui-xs uppercase tracking-label mb-1.5" style={{ color: "var(--text-dim)" }}>
                    Links
                  </div>
                  <div className="flex flex-col gap-2">
                    {r.website_url && (
                      <a
                        href={r.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-ui-md border-b pb-0.5 transition-colors self-start"
                        style={{ color: "var(--text-secondary)", borderColor: "var(--border-default)" }}
                      >
                        Website ↗
                      </a>
                    )}
                    {r.google_maps_url && (
                      <a
                        href={r.google_maps_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-ui-md border-b pb-0.5 transition-colors self-start"
                        style={{ color: "var(--text-secondary)", borderColor: "var(--border-default)" }}
                      >
                        Get Directions ↗
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

      </div>

      {/* ── Neighborhood links ── */}
      {r.neighborhood && (
        <section className="px-6 py-8 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="max-w-6xl mx-auto flex flex-wrap gap-3">
            <Link
              href={`/gluten-free/${r.city.toLowerCase().replace(/'/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}/${r.neighborhood.toLowerCase().replace(/'/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}`}
              className="font-mono text-ui-sm uppercase tracking-label px-4 py-2.5 border transition-colors duration-150 hover:border-accent hover:text-accent"
              style={{ borderColor: "var(--border-emphasis)", color: "var(--text-label)" }}
            >
              More GF restaurants in {r.neighborhood} →
            </Link>
            <Link
              href={`/rankings?city=${encodeURIComponent(r.city)}`}
              className="font-mono text-ui-sm uppercase tracking-label px-4 py-2.5 border transition-colors duration-150 hover:border-accent hover:text-accent"
              style={{ borderColor: "var(--border-emphasis)", color: "var(--text-label)" }}
            >
              All GF restaurants in {r.city} →
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
