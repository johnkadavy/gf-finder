import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  calculateScore,
  getGaugeColor,
  getScoreLabel,
  type ScoringDossier,
} from "@/lib/score";
import { SafetyGauge } from "@/app/components/SafetyGauge";

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
  cuisine_types: string[] | null;
  opening_hours: OpeningHours | null;
  dossier: Dossier | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function formatCuisine(raw: string): string {
  return raw
    .replace(/_restaurant$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function priceSymbol(level: number | null): string {
  if (level === null) return "";
  return ["Free", "$", "$$", "$$$", "$$$$"][level] ?? "";
}

const CUISINE_EXCLUDE = new Set([
  "food", "meal_takeaway", "meal_delivery", "bar", "night_club",
  "lodging", "tourist_attraction", "shopping_mall",
]);

function cleanCuisineTypes(types: string[] | null): string[] {
  if (!types) return [];
  return types
    .filter((t) => !CUISINE_EXCLUDE.has(t))
    .map(formatCuisine)
    .slice(0, 4);
}

// ── Signal row ─────────────────────────────────────────────────────────────

type SignalLevel = "positive" | "neutral" | "warning" | "negative" | "unknown";

function signalColor(level: SignalLevel): string {
  switch (level) {
    case "positive": return "#4A7C59";
    case "neutral":  return "oklch(0.55 0 0)";
    case "warning":  return "#C5A04A";
    case "negative": return "#FF7444";
    default:         return "oklch(0.35 0 0)";
  }
}

function SignalRow({ label, value, level }: {
  label: string; value: string; level: SignalLevel;
}) {
  const color = signalColor(level);
  return (
    <div
      className="flex items-center justify-between py-2.5 border-b"
      style={{ borderColor: "oklch(0.16 0 0)" }}
    >
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[oklch(0.45_0_0)]">
        {label}
      </span>
      <span
        className="font-mono text-[11px] uppercase tracking-[0.1em]"
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}

function SignalPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="border p-5"
      style={{ borderColor: "oklch(0.2 0 0)", backgroundColor: "oklch(0.095 0 0)" }}
    >
      <p className="font-mono text-[9px] uppercase tracking-[0.35em] text-[oklch(0.35_0_0)] mb-4">
        {title}
      </p>
      {children}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data, error } = await supabase
    .from("restaurants")
    .select(
      "id, name, city, neighborhood, address, phone, website_url, google_maps_url, google_rating, price_level, cuisine_types, opening_hours, dossier"
    )
    .eq("id", id)
    .single();

  if (error || !data) notFound();

  const r = data as Restaurant;
  const score = r.dossier ? calculateScore(r.dossier) : null;
  const { label: scoreLabel } = getScoreLabel(score);
  const color = getGaugeColor(score);
  const d = r.dossier;
  const cuisines = cleanCuisineTypes(r.cuisine_types);
  const sickCount = d?.reviews?.sick_reports_recent ?? 0;
  const price = priceSymbol(r.price_level);

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
    d?.operations?.cross_contamination_risk === "medium" ? "neutral"  :
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

  const hours = r.opening_hours?.weekdayDescriptions;

  return (
    <main className="pt-16">
      {/* ── Hero ── */}
      <section
        className="grid-bg border-b px-8 py-14 md:py-20 relative"
        style={{ borderColor: "oklch(0.2 0 0)" }}
      >
        <div
          className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, oklch(0.08 0 0))" }}
        />
        <div className="max-w-6xl mx-auto">

          {/* Back breadcrumb */}
          <Link
            href="/rankings"
            className="inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[oklch(0.38_0_0)] hover:text-[oklch(0.6_0_0)] transition-colors mb-10"
          >
            ← Rankings
          </Link>

          {/* Two-column: meta left, gauge right */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-12 items-center">

            {/* Left */}
            <div>
              {/* Illness warning */}
              {sickCount > 0 && (
                <div
                  className="inline-flex items-center gap-2.5 px-4 py-2 border mb-6"
                  style={{ borderColor: "#FF744440", backgroundColor: "#FF744408" }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF7444] shrink-0" />
                  <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#FF7444]">
                    {sickCount} illness report{sickCount !== 1 ? "s" : ""} in the past 6 months
                  </span>
                </div>
              )}

              {/* Location + cuisine */}
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[oklch(0.4_0_0)] mb-3">
                {[r.neighborhood, r.city].filter(Boolean).join(" / ")}
              </p>

              {/* Name */}
              <h1
                className="font-[family-name:var(--font-display)] leading-none mb-5"
                style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)", letterSpacing: "0.02em" }}
              >
                {r.name}
              </h1>

              {/* Cuisine tags */}
              {cuisines.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-5">
                  {cuisines.map((c) => (
                    <span
                      key={c}
                      className="font-mono text-[10px] uppercase tracking-[0.15em] px-3 py-1.5 border"
                      style={{ borderColor: "oklch(0.22 0 0)", color: "oklch(0.5 0 0)" }}
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}

              {/* Meta row: rating, price, address */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mb-6">
                {r.google_rating && (
                  <span className="font-mono text-[12px] uppercase tracking-[0.15em] text-[oklch(0.58_0_0)]">
                    ★ {r.google_rating.toFixed(1)} Google
                  </span>
                )}
                {price && (
                  <span className="font-mono text-[12px] uppercase tracking-[0.15em] text-[oklch(0.58_0_0)]">
                    {price}
                  </span>
                )}
                {r.address && (
                  <span className="font-mono text-[11px] tracking-[0.08em] text-[oklch(0.42_0_0)]">
                    {r.address}
                  </span>
                )}
              </div>

              {/* Links */}
              <div className="flex items-center gap-5">
                {r.website_url && (
                  <a
                    href={r.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.45_0_0)] hover:text-[#FF7444] transition-colors"
                  >
                    Website ↗
                  </a>
                )}
                {r.google_maps_url && (
                  <a
                    href={r.google_maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.45_0_0)] hover:text-[#FF7444] transition-colors"
                  >
                    Google Maps ↗
                  </a>
                )}
                {r.phone && (
                  <a
                    href={`tel:${r.phone}`}
                    className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.45_0_0)] hover:text-[#FF7444] transition-colors"
                  >
                    {r.phone}
                  </a>
                )}
              </div>
            </div>

            {/* Right — score gauge */}
            <div className="flex items-center justify-center md:justify-center">
              <SafetyGauge score={score} size="lg" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Body ── */}
      <section className="px-8 pb-32 mt-10">
        <div className="max-w-6xl mx-auto space-y-10">

          {/* Summary */}
          {d?.summary?.short_summary && (
            <p
              className="font-mono text-[13px] leading-[1.9] max-w-2xl"
              style={{ color: "oklch(0.62 0 0)" }}
            >
              {d.summary.short_summary}
            </p>
          )}

          {/* Signal panels — 3 columns */}
          {d && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* Menu */}
              <SignalPanel title="Menu">
                <SignalRow label="GF labeling"  value={labelingText} level={labelingLevel} />
                <SignalRow label="GF options"   value={optionsText}  level={optionsLevel} />
                <SignalRow
                  label="GF substitutes"
                  value={
                    d.menu?.gf_substitutes?.available === true  ? "Available" :
                    d.menu?.gf_substitutes?.available === false ? "Not available" : "Unknown"
                  }
                  level={
                    d.menu?.gf_substitutes?.available === true  ? "positive" :
                    d.menu?.gf_substitutes?.available === false ? "neutral" : "unknown"
                  }
                />
              </SignalPanel>

              {/* Kitchen */}
              <SignalPanel title="Kitchen Safety">
                <SignalRow label="Cross-contamination" value={contamText}  level={contamLevel} />
                <SignalRow label="Staff knowledge"     value={staffText}   level={staffLevel} />
                <SignalRow
                  label="Dedicated fryer"
                  value={
                    d.operations?.dedicated_equipment?.fryer === true  ? "Yes" :
                    d.operations?.dedicated_equipment?.fryer === false ? "No" : "Unknown"
                  }
                  level={
                    d.operations?.dedicated_equipment?.fryer === true  ? "positive" :
                    d.operations?.dedicated_equipment?.fryer === false ? "neutral" : "unknown"
                  }
                />
                <SignalRow
                  label="Dedicated prep area"
                  value={
                    d.operations?.dedicated_equipment?.prep_area === "yes" ? "Yes" :
                    d.operations?.dedicated_equipment?.prep_area === "no"  ? "No" : "Unknown"
                  }
                  level={
                    d.operations?.dedicated_equipment?.prep_area === "yes" ? "positive" :
                    d.operations?.dedicated_equipment?.prep_area === "no"  ? "neutral" : "unknown"
                  }
                />
              </SignalPanel>

              {/* Reviews */}
              <SignalPanel title="Diner Reviews">
                <SignalRow label="GF sentiment"    value={sentimentText} level={sentimentLevel} />
                <SignalRow
                  label="Positive reviews"
                  value={d.reviews?.positive_count != null ? String(d.reviews.positive_count) : "Unknown"}
                  level={
                    (d.reviews?.positive_count ?? 0) >= 10 ? "positive" :
                    (d.reviews?.positive_count ?? 0) > 0   ? "neutral"  : "unknown"
                  }
                />
                <SignalRow
                  label="Illness reports"
                  value={sickCount > 0 ? String(sickCount) : "None reported"}
                  level={sickCount > 0 ? "negative" : "positive"}
                />
                <SignalRow
                  label="Data recency"
                  value={
                    d.reviews?.recency_coverage === "good"    ? "Good" :
                    d.reviews?.recency_coverage === "limited" ? "Limited" :
                    d.reviews?.recency_coverage === "poor"    ? "Poor" : "Unknown"
                  }
                  level={
                    d.reviews?.recency_coverage === "good"    ? "positive" :
                    d.reviews?.recency_coverage === "limited" ? "neutral"  :
                    d.reviews?.recency_coverage === "poor"    ? "warning"  : "unknown"
                  }
                />
              </SignalPanel>
            </div>
          )}

          {/* Opening hours */}
          {hours && hours.length > 0 && (
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.35em] text-[oklch(0.35_0_0)] mb-4">
                Hours
              </p>
              <div
                className="border p-5 inline-block min-w-[280px]"
                style={{ borderColor: "oklch(0.2 0 0)", backgroundColor: "oklch(0.095 0 0)" }}
              >
                {hours.map((line) => {
                  const [day, ...rest] = line.split(": ");
                  return (
                    <div key={line} className="flex justify-between gap-8 py-1.5 border-b last:border-0" style={{ borderColor: "oklch(0.16 0 0)" }}>
                      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[oklch(0.4_0_0)]">
                        {day}
                      </span>
                      <span className="font-mono text-[11px] text-[oklch(0.58_0_0)]">
                        {rest.join(": ")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Data confidence notice */}
          {d?.data_quality?.confidence && d.data_quality.confidence !== "high" && (
            <p
              className="font-mono text-[9px] uppercase tracking-[0.2em] border-l-2 pl-4 py-1"
              style={{
                borderColor: "oklch(0.3 0 0)",
                color: "oklch(0.38 0 0)",
              }}
            >
              {d.data_quality.confidence === "low"
                ? "Limited data — scores are based on partial information and may not fully reflect this restaurant's practices."
                : "Moderate confidence — some signals are inferred. Confirm details directly with the restaurant."}
            </p>
          )}

        </div>
      </section>
    </main>
  );
}
