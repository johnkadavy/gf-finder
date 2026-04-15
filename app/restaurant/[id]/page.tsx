import Link from "next/link";
import { notFound } from "next/navigation";
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
import { isNewRestaurant } from "@/lib/utils";

type OpeningHours = {
  weekdayDescriptions?: string[];
};

type Dossier = ScoringDossier & {
  summary?: { short_summary?: string };
};

type Restaurant = {
  id: number;
  name: string;
  city: string;
  neighborhood: string | null;
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

// Value text — bright so it reads as the primary info
function signalColor(level: SignalLevel): string {
  switch (level) {
    case "positive": return "#7ECF9A";
    case "neutral":  return "oklch(0.72 0 0)";
    case "warning":  return "#D4AE62";
    case "negative": return "#FF8060";
    default:         return "oklch(0.62 0 0)";
  }
}

function signalBg(level: SignalLevel): string {
  switch (level) {
    case "positive": return "#4A7C590D";
    case "negative": return "#FF74440D";
    case "warning":  return "#C5A04A0D";
    default:         return "oklch(0.095 0 0)";
  }
}

function signalBorder(level: SignalLevel): string {
  switch (level) {
    case "positive": return "#4A7C5938";
    case "negative": return "#FF744438";
    case "warning":  return "#C5A04A38";
    default:         return "oklch(0.18 0 0)";
  }
}

// ── Signal card ────────────────────────────────────────────────────────────

function SignalCard({ label, value, level }: {
  label: string;
  value: string;
  level: SignalLevel;
}) {
  const color = signalColor(level);
  return (
    <div
      className="border p-3 flex flex-col gap-2"
      style={{ borderColor: signalBorder(level), backgroundColor: signalBg(level) }}
    >
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[oklch(0.68_0_0)] leading-none">
          {label}
        </p>
      </div>
      <p className="font-mono text-[12px] uppercase tracking-[0.04em] leading-snug" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────

const IconPin = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
);

const IconPhone = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8 19.79 19.79 0 01.13 1.18 2 2 0 012.11 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.46-.46a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
  </svg>
);

const IconGlobe = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
  </svg>
);

const IconClock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
);

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

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await supabase
    .from("restaurants")
    .select("name, city, neighborhood, dossier, verified_data")
    .eq("id", id)
    .single();

  if (!data) return {};

  const score = data.dossier
    ? calculateScore(data.dossier as ScoringDossier, (data.verified_data ?? undefined) as VerifiedData | undefined)
    : null;
  const d = data.dossier as ScoringDossier | null;
  const location = [data.neighborhood, data.city].filter(Boolean).join(", ");
  const canonicalUrl = `/restaurant/${id}`;

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
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const fromMap = from === "map";

  const { data, error } = await supabase
    .from("restaurants")
    .select(
      "id, name, city, neighborhood, address, phone, website_url, google_maps_url, google_rating, price_level, cuisine, opening_hours, dossier, verified_data, google_place_id, source, ingested_at"
    )
    .eq("id", id)
    .single();

  if (error || !data) notFound();

  const r = data as Restaurant;

  // Fetch verified visit if one exists
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

  // Check if current user has saved this restaurant
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  let initialSaved = false;
  if (user) {
    const { data: save } = await serverClient
      .from("saved_restaurants")
      .select("id")
      .eq("user_id", user.id)
      .eq("restaurant_id", r.id)
      .maybeSingle();
    initialSaved = !!save;
  }
  const { label: scoreLabel } = getScoreLabel(score);
  const color = getGaugeColor(score);
  const d = r.dossier;
  const cuisine = r.cuisine;
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

  // ── JSON-LD structured data ──────────────────────────────────────────────
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "name": r.name,
    ...(r.address ? {
      "address": {
        "@type": "PostalAddress",
        "streetAddress": r.address,
        "addressLocality": r.city,
      },
    } : {}),
    ...(r.phone        ? { "telephone": r.phone }                                               : {}),
    ...(r.website_url  ? { "url": r.website_url }                                               : {}),
    ...(r.cuisine      ? { "servesCuisine": r.cuisine }                                         : {}),
    ...(score !== null ? {
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": Math.round(score),
        "bestRating": 100,
        "worstRating": 0,
        "ratingCount": 1,
      },
    } : {}),
  };

  return (
    <main className="pt-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <StickyInfoBar name={r.name} score={score} googleMapsUrl={r.google_maps_url} />

      {/* ── Hero ── */}
      <section
        className="grid-bg border-b px-6 pt-8 pb-10 md:pt-12 md:pb-14 relative"
        style={{ borderColor: "oklch(0.2 0 0)" }}
      >
        <div
          className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, oklch(0.08 0 0))" }}
        />

        {/* Back breadcrumb */}
        <div className="max-w-6xl mx-auto mb-6 md:mb-10">
          <Link
            href={fromMap ? "/map" : "/rankings"}
            className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.75_0_0)] hover:text-[oklch(0.95_0_0)] transition-colors"
          >
            {fromMap ? "← Map" : "← Rankings"}
          </Link>
        </div>

        {/* ── Mobile layout ── */}
        <div className="md:hidden max-w-6xl mx-auto space-y-3">
          {/* Name + gauge inline */}
          <div className="flex items-start justify-between gap-3">
            <div>
              {isNewRestaurant(r.source, r.ingested_at) && (
                <span className="inline-block font-mono text-[9px] uppercase tracking-[0.2em] px-1.5 py-0.5 mb-2" style={{ backgroundColor: "#FF744420", color: "#FF7444", border: "1px solid #FF744450" }}>
                  New
                </span>
              )}
              <h1
                className="font-[family-name:var(--font-display)] leading-none"
                style={{ fontSize: "clamp(2rem, 9vw, 3rem)", letterSpacing: "0.02em" }}
              >
                {r.name}
              </h1>
            </div>
            <div className="shrink-0">
              <SafetyGauge score={score} size="xs" showDescriptor={false} />
            </div>
          </div>

          {/* Neighborhood + cuisine */}
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[oklch(0.65_0_0)]">
            {[r.neighborhood, cuisine].filter(Boolean).join(" · ")}
          </p>

          {/* Illness warning */}
          {sickCount > 0 && (
            <div
              className="inline-flex items-center gap-2.5 px-3 py-2 border"
              style={{ borderColor: "#FF744440", backgroundColor: "#FF744408" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF7444] shrink-0" />
              {sickSourceUrl ? (
                <a href={sickSourceUrl} target="_blank" rel="noopener noreferrer"
                  className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#FF7444] hover:underline">
                  {sickCount} illness report{sickCount !== 1 ? "s" : ""} — past 6 months
                </a>
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#FF7444]">
                  {sickCount} illness report{sickCount !== 1 ? "s" : ""} — past 6 months
                </span>
              )}
            </div>
          )}

          {/* Summary */}
          {d?.summary?.short_summary && (
            <p className="text-[14px] leading-[1.65] text-[oklch(0.82_0_0)]">
              {d.summary.short_summary}
            </p>
          )}

          {/* Save button */}
          <div>
            <SaveButton
              restaurantId={r.id}
              initialSaved={initialSaved}
              redirectPath={`/restaurant/${r.id}`}
              showLabel
            />
          </div>
        </div>

        {/* ── Desktop layout (unchanged) ── */}
        <div className="hidden md:block max-w-4xl mx-auto text-center">
          {/* Gauge */}
          <div className="flex justify-center mb-6">
            <SafetyGauge score={score} size="lg" />
          </div>

          {/* Illness warning */}
          {sickCount > 0 && (
            <div className="flex justify-center mb-5">
              <div
                className="inline-flex items-center gap-2.5 px-4 py-2 border"
                style={{ borderColor: "#FF744440", backgroundColor: "#FF744408" }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF7444] shrink-0" />
                {sickSourceUrl ? (
                  <a href={sickSourceUrl} target="_blank" rel="noopener noreferrer"
                    className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#FF7444] hover:underline">
                    {sickCount} illness report{sickCount !== 1 ? "s" : ""} in the past 6 months
                  </a>
                ) : (
                  <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#FF7444]">
                    {sickCount} illness report{sickCount !== 1 ? "s" : ""} in the past 6 months
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Name + save */}
          <div className="flex items-center justify-center gap-3 mb-5">
            <div className="text-center">
              {isNewRestaurant(r.source, r.ingested_at) && (
                <span className="inline-block font-mono text-[9px] uppercase tracking-[0.2em] px-1.5 py-0.5 mb-2" style={{ backgroundColor: "#FF744420", color: "#FF7444", border: "1px solid #FF744450" }}>
                  New
                </span>
              )}
              <p
                aria-hidden="true"
                className="font-[family-name:var(--font-display)] leading-none"
                style={{ fontSize: "clamp(2.5rem, 7vw, 5rem)", letterSpacing: "0.02em" }}
              >
                {r.name}
              </p>
            </div>
            <div className="mt-2 shrink-0">
              <SaveButton
                restaurantId={r.id}
                initialSaved={initialSaved}
                redirectPath={`/restaurant/${r.id}`}
                showLabel
              />
            </div>
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            {r.google_rating && (
              <span className="font-mono text-[13px] uppercase tracking-[0.1em] text-[oklch(0.8_0_0)]">
                ★ {r.google_rating.toFixed(1)} Google
              </span>
            )}
            {price && <span className="font-mono text-[13px] text-[oklch(0.65_0_0)]">·</span>}
            {price && (
              <span className="font-mono text-[13px] uppercase tracking-[0.1em] text-[oklch(0.8_0_0)]">{price}</span>
            )}
            {cuisine && (
              <>
                <span className="font-mono text-[13px] text-[oklch(0.65_0_0)]">·</span>
                <span className="font-mono text-[13px] uppercase tracking-[0.1em] text-[oklch(0.8_0_0)]">{cuisine}</span>
              </>
            )}
            <span className="font-mono text-[13px] text-[oklch(0.65_0_0)]">·</span>
            <span className="font-mono text-[13px] uppercase tracking-[0.1em] text-[oklch(0.8_0_0)]">
              {[r.neighborhood, r.city].filter(Boolean).join(", ")}
            </span>
          </div>
        </div>

      </section>

      {/* ── Body — two-column ── */}
      <section className="px-6 pb-32 mt-10">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-[1fr_300px] gap-10 items-start">

          {/* ── Left column ── */}
          <div className="space-y-10">

            {/* Summary — hidden on mobile (shown in hero) */}
            {d?.summary?.short_summary && (
              <div className="hidden md:block">
                <div className="flex items-center gap-4 mb-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[oklch(0.65_0_0)]">
                    Overview
                  </p>
                  <div className="flex-1 h-px" style={{ backgroundColor: "oklch(0.2 0 0)" }} />
                </div>
                <p
                  className="text-[19px] leading-[1.65] max-w-xl"
                  style={{ color: "oklch(0.92 0 0)" }}
                >
                  {d.summary.short_summary}
                </p>
              </div>
            )}

            {/* Signal grid */}
            {d && (
              <div>
                <div className="flex items-center gap-4 mb-5">
                  <h2 className="font-mono text-[10px] uppercase tracking-[0.15em] text-[oklch(0.65_0_0)]">
                    Signal Breakdown
                  </h2>
                  <div className="flex-1 h-px" style={{ backgroundColor: "oklch(0.2 0 0)" }} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
                  <SignalCard label="GF Labeling" value={labelingText} level={labelingLevel} />
                  <SignalCard label="GF Options" value={optionsText} level={optionsLevel} />
                  <SignalCard label="Cross-Contamination" value={contamText} level={contamLevel} />
                  <SignalCard label="Staff Knowledge" value={staffText} level={staffLevel} />
                  <SignalCard label="GF Sentiment" value={sentimentText} level={sentimentLevel} />
                  <SignalCard
                    label="Illness Reports"
                    value={sickCount > 0 ? `${sickCount} reported` : "None reported"}
                    level={sickCount > 0 ? "negative" : "positive"}
                  />
                </div>
              </div>
            )}

            {/* Reviews section */}
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <h2 className="font-mono text-[10px] uppercase tracking-[0.15em] text-[oklch(0.65_0_0)]">
                  Reviews
                </h2>
                <div className="flex-1 h-px" style={{ backgroundColor: "oklch(0.2 0 0)" }} />
              </div>

              {visit ? (
                <div
                  className="border p-6 space-y-5"
                  style={{ borderColor: "#4A7C5930", backgroundColor: "#4A7C5908" }}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4A7C59" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#4A7C59]">
                        Verified Visit
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {visit.overall_sentiment && (
                        <span
                          className="font-mono text-[10px] uppercase tracking-[0.15em] px-2.5 py-1 border"
                          style={{
                            borderColor: visit.overall_sentiment === "mostly_positive" ? "#4A7C5940" : visit.overall_sentiment === "mixed" ? "#D4AE6240" : "#FF744440",
                            color: visit.overall_sentiment === "mostly_positive" ? "#4A7C59" : visit.overall_sentiment === "mixed" ? "#D4AE62" : "#FF7444",
                            backgroundColor: visit.overall_sentiment === "mostly_positive" ? "#4A7C5910" : visit.overall_sentiment === "mixed" ? "#D4AE6210" : "#FF744410",
                          }}
                        >
                          {visit.overall_sentiment === "mostly_positive" ? "Positive" : visit.overall_sentiment === "mixed" ? "Mixed" : "Negative"}
                        </span>
                      )}
                      {visit.visit_date && (
                        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[oklch(0.58_0_0)]">
                          {new Date(visit.visit_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Notes */}
                  {visit.notes && (
                    <p className="text-[15px] leading-[1.7] text-[oklch(0.85_0_0)]">
                      {visit.notes}
                    </p>
                  )}

                  {/* Signal chips */}
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
                              className="font-mono text-[11px] uppercase tracking-[0.08em] px-2.5 py-1 border"
                              style={{
                                borderColor: `${signalColor(level)}40`,
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
                <p className="font-mono text-[11px] text-[oklch(0.58_0_0)]">
                  No verified reviews yet.
                </p>
              )}

              {/* Write a review — verified reviewers only */}
              {r.google_place_id && (
                <ReviewForm
                  restaurantId={r.id}
                  googlePlaceId={r.google_place_id}
                />
              )}
            </div>

            {/* Data confidence notice */}
            {d?.data_quality?.confidence && d.data_quality.confidence !== "high" && (
              <p
                className="font-mono text-[10px] uppercase tracking-[0.2em] border-l-2 pl-4 py-1"
                style={{
                  borderColor: "oklch(0.45 0 0)",
                  color: "oklch(0.72 0 0)",
                }}
              >
                {d.data_quality.confidence === "low"
                  ? "Limited data — scores are based on partial information and may not fully reflect this restaurant's practices."
                  : "Moderate confidence — some signals are inferred. Confirm details directly with the restaurant."}
              </p>
            )}
          </div>

          {/* ── Right sidebar ── */}
          <div
            className="border p-6 space-y-6 md:sticky md:top-24"
            style={{ borderColor: "oklch(0.2 0 0)", backgroundColor: "oklch(0.095 0 0)" }}
          >
            <h2 className="font-mono text-[10px] uppercase tracking-[0.15em] text-[oklch(0.72_0_0)]">
              Info
            </h2>

            {/* Address */}
            {r.address && (
              <div className="flex gap-3">
                <span className="text-[oklch(0.65_0_0)] mt-0.5 shrink-0"><IconPin /></span>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[oklch(0.72_0_0)] mb-1">Location</p>
                  <p className="font-mono text-[13px] text-[oklch(0.82_0_0)] leading-relaxed">{r.address}</p>
                </div>
              </div>
            )}

            {/* Phone */}
            {r.phone && (
              <div className="flex gap-3">
                <span className="text-[oklch(0.65_0_0)] mt-0.5 shrink-0"><IconPhone /></span>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[oklch(0.72_0_0)] mb-1">Phone</p>
                  <a
                    href={`tel:${r.phone}`}
                    className="font-mono text-[13px] text-[oklch(0.82_0_0)] hover:text-[#FF7444] transition-colors"
                  >
                    {r.phone}
                  </a>
                </div>
              </div>
            )}

            {/* Links */}
            {(r.website_url || r.google_maps_url) && (
              <div className="flex gap-3">
                <span className="text-[oklch(0.65_0_0)] mt-0.5 shrink-0"><IconGlobe /></span>
                <div className="space-y-1.5">
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[oklch(0.72_0_0)] mb-1">Links</p>
                  {r.website_url && (
                    <a
                      href={r.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block font-mono text-[13px] text-[oklch(0.82_0_0)] hover:text-[#FF7444] transition-colors"
                    >
                      Website ↗
                    </a>
                  )}
                  {r.google_maps_url && (
                    <a
                      href={r.google_maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block font-mono text-[13px] text-[oklch(0.82_0_0)] hover:text-[#FF7444] transition-colors"
                    >
                      Google Maps ↗
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Hours */}
            {hours && hours.length > 0 && (
              <div className="flex gap-3">
                <span className="text-[oklch(0.65_0_0)] mt-0.5 shrink-0"><IconClock /></span>
                <div className="w-full">
                  <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-[oklch(0.72_0_0)] mb-3">Hours</h3>
                  <div className="space-y-2">
                    {hours.map((line) => {
                      const [day, ...rest] = line.split(": ");
                      return (
                        <div key={line} className="flex justify-between gap-4">
                          <span className="font-mono text-[11px] tracking-[0.02em] text-[oklch(0.82_0_0)]">
                            {day}
                          </span>
                          <span className="font-mono text-[11px] text-[oklch(0.78_0_0)] text-right">
                            {rest.join(": ")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </section>

      {/* ── Neighborhood links (S6b) ── */}
      {r.neighborhood && (
        <section className="px-6 py-8 border-t" style={{ borderColor: "oklch(0.18 0 0)" }}>
          <div className="max-w-6xl mx-auto flex flex-wrap gap-3">
            <Link
              href={`/gluten-free/${r.city.toLowerCase().replace(/'/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}/${r.neighborhood.toLowerCase().replace(/'/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}`}
              className="font-mono text-[10px] uppercase tracking-[0.2em] px-4 py-2.5 border transition-colors duration-150 hover:border-[#FF7444] hover:text-[#FF7444]"
              style={{ borderColor: "oklch(0.26 0 0)", color: "oklch(0.65 0 0)" }}
            >
              More GF restaurants in {r.neighborhood} →
            </Link>
            <Link
              href={`/rankings?city=${encodeURIComponent(r.city)}`}
              className="font-mono text-[10px] uppercase tracking-[0.2em] px-4 py-2.5 border transition-colors duration-150 hover:border-[#FF7444] hover:text-[#FF7444]"
              style={{ borderColor: "oklch(0.26 0 0)", color: "oklch(0.65 0 0)" }}
            >
              All GF restaurants in {r.city} →
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
