import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { supabase as publicSupabase } from "@/lib/supabase";
import { calculateScore, getGaugeColor, getScoreLabel, type ScoringDossier, type VerifiedData } from "@/lib/score";
import { normalizeCuisine } from "@/lib/cuisine";
import { AccountFilters } from "./AccountFilters";
import { CopyButton } from "@/app/components/CopyButton";

type SavedRestaurant = {
  id: number;
  name: string;
  city: string;
  neighborhood: string | null;
  cuisine: string | null;
  website_url: string | null;
  google_maps_url: string | null;
  dossier: (ScoringDossier & { summary?: { short_summary?: string } }) | null;
  verified_data: VerifiedData | null;
};

type PageProps = {
  searchParams: Promise<{ city?: string; cuisine?: string }>;
};

export default async function AccountPage({ searchParams }: PageProps) {
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) redirect("/login?next=/account");

  const params = await searchParams;
  const cityFilter = params.city ?? "all";
  const cuisineFilter = params.cuisine ?? "all";

  // Fetch share token
  const { data: profile } = await serverClient
    .from("profiles")
    .select("share_token")
    .eq("user_id", user.id)
    .single();
  const shareToken = profile?.share_token ?? null;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://trycleanplate.com";
  const shareUrl = shareToken ? `${siteUrl}/map/${shareToken}` : null;

  // Fetch saved IDs in save order
  const { data: saves } = await serverClient
    .from("saved_restaurants")
    .select("restaurant_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const ids = (saves ?? []).map((s) => s.restaurant_id);

  let allRestaurants: SavedRestaurant[] = [];
  if (ids.length > 0) {
    const { data } = await publicSupabase
      .from("restaurants")
      .select("id, name, city, neighborhood, cuisine, website_url, google_maps_url, dossier, verified_data")
      .in("id", ids);
    const map = new Map((data ?? []).map((r) => [r.id, r]));
    allRestaurants = ids.map((id) => map.get(id)).filter(Boolean) as SavedRestaurant[];
  }

  // Derive filter options from the full saved set
  const cities = Array.from(new Set(allRestaurants.map((r) => r.city))).sort();
  const cuisines = Array.from(
    new Set(
      allRestaurants
        .map((r) => r.cuisine)
        .filter((c): c is string => !!c && c.toLowerCase() !== "unknown")
        .map(normalizeCuisine)
        .filter((c) => c !== "Other")
    )
  ).sort();

  // Fetch user's reviews
  const { data: reviewVisits } = await serverClient
    .from("verified_visits")
    .select("id, google_place_id, visit_date, overall_sentiment, notes, gf_labeling, gf_options_level, staff_knowledge, cross_contamination_risk, dedicated_fryer, synced_at")
    .eq("user_id", user.id)
    .order("synced_at", { ascending: false });

  const reviewPlaceIds = (reviewVisits ?? []).map((v) => v.google_place_id).filter(Boolean);
  const { data: reviewRestaurants } = reviewPlaceIds.length > 0
    ? await publicSupabase.from("restaurants").select("id, name, google_place_id").in("google_place_id", reviewPlaceIds)
    : { data: [] };
  const placeIdToRestaurant = new Map((reviewRestaurants ?? []).map((r) => [r.google_place_id, r]));

  // Apply filters
  const restaurants = allRestaurants.filter((r) => {
    if (cityFilter !== "all" && r.city !== cityFilter) return false;
    if (cuisineFilter !== "all" && normalizeCuisine(r.cuisine ?? "") !== cuisineFilter) return false;
    return true;
  });

  return (
    <main className="pt-16 max-w-6xl mx-auto px-4 md:px-8">

      {/* Admin header */}
      <div
        className="flex items-center justify-between py-6 border-b"
        style={{ borderColor: "oklch(0.18 0 0)" }}
      >
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[oklch(0.45_0_0)] mb-1">
            Account
          </p>
          <p className="font-mono text-[13px] text-[oklch(0.72_0_0)]">{user.email}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button
            formAction="/auth/signout"
            className="font-mono text-[10px] uppercase tracking-[0.2em] px-4 py-2 border border-[oklch(0.22_0_0)] text-[oklch(0.5_0_0)] transition-colors hover:text-white hover:border-[oklch(0.45_0_0)]"
          >
            Sign out
          </button>
        </form>
      </div>

      {/* My Map */}
      {shareUrl && (
        <div
          className="py-6 border-b"
          style={{ borderColor: "oklch(0.18 0 0)" }}
        >
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[oklch(0.55_0_0)]">
                My Map
              </p>
              <p className="font-mono text-[11px] text-[oklch(0.38_0_0)] mt-1">
                Share your saved spots with anyone.
              </p>
            </div>
            <Link
              href={`/map/${shareToken}`}
              target="_blank"
              className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#FF7444] hover:underline shrink-0"
            >
              Preview →
            </Link>
          </div>
          <div
            className="flex items-center gap-3 border px-4 py-3"
            style={{ borderColor: "oklch(0.22 0 0)", backgroundColor: "oklch(0.09 0 0)" }}
          >
            <span className="font-mono text-[11px] text-[oklch(0.5_0_0)] truncate flex-1 min-w-0">
              {shareUrl}
            </span>
            <CopyButton text={shareUrl} />
          </div>
        </div>
      )}

      {/* Saved restaurants */}
      <div className="py-8">

        {/* Section header + filters */}
        <div
          className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b mb-0"
          style={{ borderColor: "oklch(0.22 0 0)" }}
        >
          <div className="flex items-baseline gap-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[oklch(0.55_0_0)]">
              Saved Restaurants
            </p>
            <span className="font-mono text-[10px] text-[oklch(0.38_0_0)]">
              {restaurants.length}{cityFilter !== "all" || cuisineFilter !== "all" ? ` of ${allRestaurants.length}` : ""}
            </span>
          </div>
          {allRestaurants.length > 0 && (
            <AccountFilters
              cities={cities}
              cuisines={cuisines}
              city={cityFilter}
              cuisine={cuisineFilter}
            />
          )}
        </div>

        {allRestaurants.length === 0 ? (
          <div
            className="border border-dashed px-6 py-16 text-center mt-6"
            style={{ borderColor: "oklch(0.22 0 0)" }}
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.4_0_0)]">
              No saved restaurants yet
            </p>
            <p className="font-mono text-[11px] text-[oklch(0.35_0_0)] mt-2">
              Use the bookmark icon on any restaurant to save it here.
            </p>
          </div>
        ) : restaurants.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.4_0_0)]">
              No saved restaurants match these filters
            </p>
          </div>
        ) : (
          <div>
            {restaurants.map((restaurant, index) => {
              const score = restaurant.dossier
                ? calculateScore(restaurant.dossier, restaurant.verified_data ?? undefined)
                : null;
              const color = getGaugeColor(score);
              const { label } = getScoreLabel(score);

              return (
                <div
                  key={restaurant.id}
                  className="grid grid-cols-[1fr_auto] items-center border-b gap-4 md:gap-10 py-6 px-4 md:px-6 transition-colors duration-150 hover:bg-[oklch(0.11_0_0)]"
                  style={{
                    borderColor: "oklch(0.18 0 0)",
                    borderLeft: `2px solid ${color}`,
                    animation: `fadeUp 0.4s ease-out ${Math.min(index, 20) * 0.03}s both`,
                  }}
                >
                  <div className="min-w-0">
                    <Link
                      href={`/restaurant/${restaurant.id}`}
                      className="group/name font-[family-name:var(--font-display)] leading-none truncate block hover:text-[#FF7444] transition-colors duration-150"
                      style={{
                        fontSize: "clamp(1.4rem, 2.5vw, 2.1rem)",
                        letterSpacing: "0.02em",
                        color: "oklch(0.95 0 0)",
                      }}
                    >
                      <span className="relative inline-block">
                        {restaurant.name}
                        <span
                          className="absolute bottom-0 left-0 h-px w-0 group-hover/name:w-full transition-all duration-300"
                          style={{ backgroundColor: color }}
                        />
                      </span>
                    </Link>
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.65_0_0)] mt-2 truncate">
                      {[restaurant.neighborhood, restaurant.city].filter(Boolean).join(" / ")}
                    </p>
                    {restaurant.dossier?.summary?.short_summary && (
                      <p className="text-[14px] leading-[1.7] text-[oklch(0.82_0_0)] mt-2 max-w-xl">
                        {restaurant.dossier.summary.short_summary}
                      </p>
                    )}
                    {(restaurant.website_url || restaurant.google_maps_url) && (
                      <div className="flex items-center gap-4 mt-2">
                        {restaurant.website_url && (
                          <a href={restaurant.website_url} target="_blank" rel="noopener noreferrer"
                            className="font-mono text-[11px] uppercase tracking-[0.15em] text-[oklch(0.68_0_0)] hover:text-[#FF7444] transition-colors">
                            Website ↗
                          </a>
                        )}
                        {restaurant.google_maps_url && (
                          <a href={restaurant.google_maps_url} target="_blank" rel="noopener noreferrer"
                            className="font-mono text-[11px] uppercase tracking-[0.15em] text-[oklch(0.68_0_0)] hover:text-[#FF7444] transition-colors">
                            Google Maps ↗
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end shrink-0">
                    <span
                      className="font-[family-name:var(--font-display)] leading-none tabular-nums"
                      style={{ fontSize: "clamp(1.75rem, 3.5vw, 2.75rem)", color }}
                    >
                      {score !== null ? Math.round(score) : "—"}
                    </span>
                    <span
                      className="font-mono text-[10px] uppercase tracking-[0.15em] mt-1 text-right"
                      style={{ color: `${color}cc` }}
                    >
                      {label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* My Reviews */}
      {reviewVisits && reviewVisits.length > 0 && (
        <div className="py-8">
          <div
            className="flex items-center justify-between pb-5 border-b mb-6"
            style={{ borderColor: "oklch(0.22 0 0)" }}
          >
            <div className="flex items-baseline gap-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[oklch(0.55_0_0)]">
                My Reviews
              </p>
              <span className="font-mono text-[10px] text-[oklch(0.38_0_0)]">
                {reviewVisits.length}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {reviewVisits.map((visit) => {
              const restaurant = placeIdToRestaurant.get(visit.google_place_id);
              const sentimentColor =
                visit.overall_sentiment === "mostly_positive" ? "#7ECF9A" :
                visit.overall_sentiment === "mixed" ? "#D4AE62" :
                visit.overall_sentiment === "mostly_negative" ? "#FF8060" : null;
              const sentimentLabel =
                visit.overall_sentiment === "mostly_positive" ? "Positive" :
                visit.overall_sentiment === "mixed" ? "Mixed" :
                visit.overall_sentiment === "mostly_negative" ? "Negative" : null;

              return (
                <div key={visit.id} className="space-y-3">
                  {/* Restaurant name link */}
                  {restaurant && (
                    <Link
                      href={`/restaurant/${restaurant.id}`}
                      className="font-[family-name:var(--font-display)] text-[1.5rem] leading-none hover:text-[#FF7444] transition-colors block"
                      style={{ color: "oklch(0.92 0 0)", letterSpacing: "0.02em" }}
                    >
                      {restaurant.name}
                    </Link>
                  )}

                  {/* Review card — mirrors restaurant page style */}
                  <div
                    className="border p-6 space-y-4"
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
                        {sentimentLabel && sentimentColor && (
                          <span
                            className="font-mono text-[10px] uppercase tracking-[0.15em] px-2.5 py-1 border"
                            style={{
                              borderColor: `${sentimentColor}40`,
                              color: sentimentColor,
                              backgroundColor: `${sentimentColor}10`,
                            }}
                          >
                            {sentimentLabel}
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

                    {/* Color-coded chips */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {visit.gf_labeling && <Chip label="GF Labeling" value={visit.gf_labeling} level={chipLevel("GF Labeling", visit.gf_labeling)} />}
                      {visit.gf_options_level && <Chip label="GF Options" value={visit.gf_options_level} level={chipLevel("GF Options", visit.gf_options_level)} />}
                      {visit.staff_knowledge && <Chip label="Staff Knowledge" value={visit.staff_knowledge} level={chipLevel("Staff Knowledge", visit.staff_knowledge)} />}
                      {visit.cross_contamination_risk && <Chip label="Cross-Contamination" value={visit.cross_contamination_risk} level={chipLevel("Cross-Contamination", visit.cross_contamination_risk)} />}
                      {visit.dedicated_fryer && <Chip label="Dedicated Fryer" value={visit.dedicated_fryer} level={chipLevel("Dedicated Fryer", visit.dedicated_fryer)} />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}

type SignalLevel = "positive" | "neutral" | "warning" | "negative" | "unknown";

function signalColor(level: SignalLevel): string {
  switch (level) {
    case "positive": return "#7ECF9A";
    case "neutral":  return "oklch(0.72 0 0)";
    case "warning":  return "#D4AE62";
    case "negative": return "#FF8060";
    default:         return "oklch(0.42 0 0)";
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

function chipLevel(field: string, value: string): SignalLevel {
  if (field === "GF Labeling") return value === "clear" ? "positive" : value === "partial" ? "warning" : value === "none" ? "negative" : "unknown";
  if (field === "GF Options") return value === "many" || value === "ample" ? "positive" : value === "moderate" ? "neutral" : value === "few" ? "warning" : value === "none" ? "negative" : "unknown";
  if (field === "Staff Knowledge") return value === "high" ? "positive" : value === "medium" ? "neutral" : value === "low" ? "negative" : "unknown";
  if (field === "Cross-Contamination") return value === "low" ? "positive" : value === "medium" ? "warning" : value === "high" ? "negative" : "unknown";
  if (field === "Dedicated Fryer") return value === "yes" ? "positive" : "neutral";
  return "unknown";
}

function Chip({ label, value, level }: { label: string; value: string; level: SignalLevel }) {
  return (
    <span
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
}
