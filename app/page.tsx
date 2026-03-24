import { supabase } from "@/lib/supabase";
import { SafetyGauge } from "./components/SafetyGauge";
import { SearchForm } from "./components/SearchForm";
import { calculateScore, getGaugeColor, type ScoringDossier } from "@/lib/score";

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
};

type HomePageProps = {
  searchParams: Promise<{ q?: string }>;
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
  positive: { dot: "#4ADE80", text: "oklch(0.55 0 0)" },
  warning:  { dot: "#FACC15", text: "oklch(0.55 0 0)" },
  error:    { dot: "#FF7444", text: "oklch(0.55 0 0)" },
};

function SignalChip({ signal }: { signal: Signal }) {
  const cfg = signalConfig[signal.variant];
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border"
      style={{ borderColor: "oklch(0.22 0 0)" }}
    >
      <span
        className="w-1.5 h-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: cfg.dot }}
      />
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[oklch(0.65_0_0)] leading-tight">
        {signal.label}
      </span>
    </div>
  );
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";

  let restaurants: Restaurant[] = [];

  if (query) {
    const { data, error } = await supabase
      .from("restaurants")
      .select("id, name, city, neighborhood, website_url, google_maps_url, dossier")
      .ilike("name", `%${query}%`)
      .order("name");

    if (!error) restaurants = (data ?? []) as Restaurant[];
  }

  return (
    <main className="pt-16">
      {/* Hero */}
      <section className="grid-bg min-h-[400px] flex flex-col items-center justify-center px-6 relative">
        <div className="max-w-3xl w-full text-center space-y-8">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[oklch(0.4_0_0)] mb-4">
              Gluten-Free Restaurant Intelligence
            </p>
            <h1
              className="font-[family-name:var(--font-display)] leading-none"
              style={{ fontSize: "clamp(3.5rem, 10vw, 7rem)", letterSpacing: "0.02em" }}
            >
              Search less.
              <br />
              <span style={{ color: "#FF7444" }}>Eat gluten-free with confidence.</span>
            </h1>
          </div>

          <SearchForm initialQuery={query} />
        </div>

      </section>

      {/* Results */}
      <section className="max-w-5xl mx-auto px-6 pb-32 mt-12">
        {!query ? null : restaurants.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.4_0_0)]">
              No results for &ldquo;{query}&rdquo;
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            {/* Result count header */}
            <div
              className="flex items-center justify-between px-6 py-4 border-b mb-0"
              style={{ borderColor: "oklch(0.22 0 0)" }}
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[oklch(0.4_0_0)]">
                {restaurants.length} Result{restaurants.length !== 1 ? "s" : ""} — &ldquo;{query}&rdquo;
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[oklch(0.35_0_0)]">
                Safety Scores
              </span>
            </div>

            {restaurants.map((restaurant, index) => {
              const summary = restaurant.dossier?.summary?.short_summary;
              const score = restaurant.dossier ? calculateScore(restaurant.dossier) : null;
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
                  }}
                >
                  <div
                    className="p-6 md:p-8 transition-colors duration-200"
                    style={{
                      borderLeft: `2px solid ${accentColor}`,
                    }}
                  >
                    {/* Index label */}
                    <div className="flex items-center gap-3 mb-5">
                      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[oklch(0.35_0_0)]">
                        {[restaurant.neighborhood, restaurant.city].filter(Boolean).join(" / ")}
                      </span>
                    </div>

                    {/* Sick report warning */}
                    {sickCount > 0 && (
                      <div
                        className="flex items-center gap-3 mb-6 px-4 py-2.5 border"
                        style={{ borderColor: "#FF744440", backgroundColor: "#FF744408" }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#FF7444] shrink-0" />
                        <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#FF7444]">
                          {sickCount} illness report{sickCount > 1 ? "s" : ""} — past 6 months
                        </span>
                      </div>
                    )}

                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-8">
                      {/* Left content */}
                      <div className="flex-1 space-y-4">
                        <h2
                          className="font-[family-name:var(--font-display)] leading-none"
                          style={{
                            fontSize: "clamp(2.5rem, 5vw, 3.5rem)",
                            letterSpacing: "0.02em",
                            color: "oklch(0.95 0 0)",
                          }}
                        >
                          {restaurant.name}
                        </h2>
                        {(restaurant.website_url || restaurant.google_maps_url) && (
                          <div className="flex items-center gap-4">
                            {restaurant.website_url && (
                              <a
                                href={restaurant.website_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-[10px] uppercase tracking-[0.15em] text-[oklch(0.38_0_0)] hover:text-[#FF7444] transition-colors"
                              >
                                Website ↗
                              </a>
                            )}
                            {restaurant.google_maps_url && (
                              <a
                                href={restaurant.google_maps_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-[10px] uppercase tracking-[0.15em] text-[oklch(0.38_0_0)] hover:text-[#FF7444] transition-colors"
                              >
                                Google Maps ↗
                              </a>
                            )}
                          </div>
                        )}
                        {summary && (
                          <p className="font-mono text-[12px] leading-relaxed text-[oklch(0.55_0_0)] max-w-lg">
                            {summary}
                          </p>
                        )}

                        {/* Expanding underline hover element — editorial detail */}
                        <div
                          className="h-px w-12 transition-all duration-500"
                          style={{ backgroundColor: `${accentColor}60` }}
                        />
                      </div>

                      {/* Safety Gauge */}
                      <SafetyGauge score={score} />
                    </div>

                    {/* Signal chips */}
                    {signals.length > 0 && (
                      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0">
                        {signals.map((signal, i) => (
                          <SignalChip key={i} signal={signal} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
