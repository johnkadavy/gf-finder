import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { supabase as publicSupabase } from "@/lib/supabase";
import { calculateScore, getGaugeColor, getScoreLabel, type ScoringDossier, type VerifiedData } from "@/lib/score";
import { normalizeCuisine } from "@/lib/cuisine";
import { AccountFilters } from "./AccountFilters";

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
    </main>
  );
}
