import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { SafetyGauge } from "./components/SafetyGauge";
import { SearchForm } from "./components/SearchForm";
import { calculateScore, getGaugeColor, type ScoringDossier, type VerifiedData } from "@/lib/score";

type Signal = {
  label: string;
  variant: "positive" | "warning" | "error";
};

type Dossier = ScoringDossier & {
  summary?: { gf_experience_level?: string; short_summary?: string };
  menu?: ScoringDossier["menu"] & { gf_labeling?: string; gf_options_level?: string };
};

type Restaurant = {
  id: number;
  name: string;
  city: string;
  neighborhood: string | null;
  website_url: string | null;
  google_maps_url: string | null;
  dossier: Dossier | null;
  verified_data: VerifiedData | null;
};

type HomePageProps = {
  searchParams: Promise<{ q?: string; city?: string }>;
};

function buildSignals(dossier: Dossier): Signal[] {
  const signals: Signal[] = [];

  if (dossier.menu?.gf_labeling === "clear")
    signals.push({ label: "Gluten-free menu clearly labeled", variant: "positive" });
  else if (dossier.menu?.gf_labeling === "partial")
    signals.push({ label: "Some GF items labeled", variant: "warning" });
  else if (dossier.menu?.gf_labeling === "none")
    signals.push({ label: "No GF labeling on menu", variant: "error" });

  if (dossier.operations?.staff_knowledge === "high")
    signals.push({ label: "Staff knowledgeable about celiac", variant: "positive" });
  else if (dossier.operations?.staff_knowledge === "low")
    signals.push({ label: "Staff GF knowledge limited", variant: "error" });

  if (dossier.operations?.cross_contamination_risk === "low")
    signals.push({ label: "Low cross-contamination risk", variant: "positive" });
  else if (dossier.operations?.cross_contamination_risk === "high")
    signals.push({ label: "High cross-contamination risk", variant: "error" });

  if (dossier.operations?.dedicated_equipment?.fryer === true)
    signals.push({ label: "Dedicated gluten-free fryer", variant: "positive" });

  return signals.slice(0, 4);
}

const signalConfig = {
  positive: { dot: "#4ADE80" },
  warning:  { dot: "#FACC15" },
  error:    { dot: "#FF7444" },
};

function SignalChip({ signal }: { signal: Signal }) {
  const cfg = signalConfig[signal.variant];
  return (
    <div
      className="flex items-center gap-3 px-6 py-4 border-b md:border-b-0 md:border-r"
      style={{ borderColor: "oklch(0.16 0 0)" }}
    >
      <span
        className="w-1.5 h-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: cfg.dot }}
      />
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[oklch(0.78_0_0)] leading-normal">
        {signal.label}
      </span>
    </div>
  );
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const selectedCity = params.city ?? "all";

  // Fetch distinct cities for the filter
  const { data: cityRows } = await supabase
    .from("restaurants")
    .select("city")
    .not("score", "is", null);
  const cities = Array.from(new Set((cityRows ?? []).map((r) => r.city))).sort();

  let restaurants: Restaurant[] = [];

  if (query) {
    let q = supabase
      .from("restaurants")
      .select("id, name, city, neighborhood, website_url, google_maps_url, dossier, verified_data")
      .ilike("name", `%${query}%`)
      .order("name");

    if (selectedCity !== "all") q = q.eq("city", selectedCity);

    const { data, error } = await q;
    if (!error) restaurants = (data ?? []) as Restaurant[];
  }

  return (
    <main className="pt-16">
      {/* Hero */}
      <section className="grid-bg min-h-[280px] md:min-h-[400px] flex flex-col items-center justify-center px-6 pt-8 md:pt-12 relative pb-16 md:pb-24">
        {/* Bottom fade — softens grid into results section */}
        <div className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none" style={{ background: "linear-gradient(to bottom, transparent, oklch(0.08 0 0))" }} />
        <div className="max-w-3xl w-full text-center space-y-6 md:space-y-8">
          <div>
            <h1
              className="font-[family-name:var(--font-display)] leading-none"
              style={{ fontSize: "clamp(3.5rem, 10vw, 7rem)", letterSpacing: "0.02em" }}
            >
              Search less.
              <br />
              <span style={{ color: "#FF7444" }}>Eat gluten-free with confidence.</span>
            </h1>
            <p className="font-mono text-[12px] uppercase tracking-[0.15em] text-[oklch(0.7_0_0)] mt-5">
              Gluten-free search made simple
            </p>
          </div>

          <SearchForm initialQuery={query} cities={cities} selectedCity={selectedCity} />
        </div>

      </section>

      {/* Results */}
      <section className="max-w-4xl mx-auto px-4 md:px-8 pb-24 md:pb-32 mt-6 md:mt-8">
        {!query ? null : restaurants.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.65_0_0)]">
              No results for &ldquo;{query}&rdquo;
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            {/* Result count header */}
            <div
              className="flex items-center justify-between px-0 py-4 border-b"
              style={{ borderColor: "oklch(0.22 0 0)" }}
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-[oklch(0.7_0_0)]">
                {restaurants.length} Result{restaurants.length !== 1 ? "s" : ""} — &ldquo;{query}&rdquo;
              </span>
            </div>

            {restaurants.map((restaurant, index) => {
              const summary = restaurant.dossier?.summary?.short_summary;
              const score = restaurant.dossier ? calculateScore(restaurant.dossier, restaurant.verified_data ?? undefined) : null;
              const signals = restaurant.dossier ? buildSignals(restaurant.dossier) : [];
              const sickCount = restaurant.dossier?.reviews?.sick_reports_recent ?? 0;
              const accentColor = getGaugeColor(score);

              return (
                <div
                  key={restaurant.id}
                  className="border-b"
                  style={{
                    borderColor: "oklch(0.22 0 0)",
                    animation: `fadeUp 0.4s ease-out ${index * 0.07}s both`,
                    borderLeft: `2px solid ${accentColor}`,
                  }}
                >
                  {/* Main content: 2-column grid on desktop */}
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-0">

                    {/* Left column */}
                    <div className="px-4 pt-5 pb-4 md:px-8 md:pt-9 md:pb-6">

                      {/* Sick report warning */}
                      {sickCount > 0 && (
                        <div
                          className="flex items-center gap-3 mb-4 md:mb-6 px-4 py-2.5 border"
                          style={{ borderColor: "#FF744430", backgroundColor: "#FF744806" }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#FF7444] shrink-0" />
                          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#FF7444]">
                            {sickCount} illness report{sickCount > 1 ? "s" : ""} — past 6 months
                          </span>
                        </div>
                      )}

                      {/* Location + mobile gauge row */}
                      <div className="flex items-start justify-between gap-4 mb-3 md:mb-0">
                        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[oklch(0.65_0_0)] md:mb-4">
                          {[restaurant.neighborhood, restaurant.city].filter(Boolean).join(" / ")}
                        </p>
                        {/* Gauge — mobile only */}
                        <div className="shrink-0 md:hidden -mt-1">
                          <SafetyGauge score={score} size="sm" />
                        </div>
                      </div>

                      {/* Restaurant name */}
                      <Link
                        href={`/restaurant/${restaurant.id}`}
                        className="group/name relative inline-block font-[family-name:var(--font-display)] leading-none mb-4 md:mb-5 hover:text-[#FF7444] transition-colors duration-150"
                        style={{
                          fontSize: "clamp(1.6rem, 5vw, 2.75rem)",
                          letterSpacing: "0.02em",
                          color: "oklch(0.95 0 0)",
                        }}
                      >
                        {restaurant.name}
                        <span
                          className="absolute bottom-0 left-0 h-px w-0 group-hover/name:w-full transition-all duration-300"
                          style={{ backgroundColor: accentColor }}
                        />
                      </Link>

                      {/* Links */}
                      {(restaurant.website_url || restaurant.google_maps_url) && (
                        <div className="flex items-center gap-6 mb-4 md:mb-6">
                          {restaurant.website_url && (
                            <a
                              href={restaurant.website_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-[11px] uppercase tracking-[0.15em] text-[oklch(0.68_0_0)] hover:text-[#FF7444] transition-colors"
                            >
                              Website ↗
                            </a>
                          )}
                          {restaurant.google_maps_url && (
                            <a
                              href={restaurant.google_maps_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-[11px] uppercase tracking-[0.15em] text-[oklch(0.68_0_0)] hover:text-[#FF7444] transition-colors"
                            >
                              Google Maps ↗
                            </a>
                          )}
                        </div>
                      )}

                      {/* Summary */}
                      {summary && (
                        <p className="text-[14px] leading-[1.75] text-[oklch(0.82_0_0)] max-w-[520px]">
                          {summary}
                        </p>
                      )}
                    </div>

                    {/* Right column — desktop only */}
                    <div className="hidden md:flex items-start justify-end pr-8 pt-5 pb-5">
                      <SafetyGauge score={score} />
                    </div>
                  </div>

                  {/* Signal row — desktop only */}
                  {signals.length > 0 && (
                    <div
                      className="hidden md:grid md:grid-cols-3 border-t"
                      style={{ borderColor: "oklch(0.16 0 0)" }}
                    >
                      {signals.map((signal, i) => (
                        <SignalChip key={i} signal={signal} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
