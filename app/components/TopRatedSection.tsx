"use client";

import { useState } from "react";
import Link from "next/link";
import { getGaugeColor } from "@/lib/score";
import type { TopRestaurant } from "@/app/page";

type Chip = {
  id: string;
  label: string;
  filter: (r: TopRestaurant) => boolean;
};

const GF_CHIPS: Chip[] = [
  { id: "dedicated_gf",    label: "Dedicated GF",  filter: (r) => r.isDedicatedGf },
  { id: "gf_fryer",        label: "GF Fryer",       filter: (r) => r.hasGfFryer },
  { id: "gf_pizza",        label: "GF Pizza",       filter: (r) => r.gf_food_categories?.includes("gf_pizza") ?? false },
  { id: "gf_pasta",        label: "GF Pasta",       filter: (r) => r.gf_food_categories?.includes("gf_pasta") ?? false },
  { id: "gf_baked_goods",  label: "GF Baked Goods", filter: (r) => r.gf_food_categories?.includes("gf_baked_goods") ?? false },
  { id: "gf_fried_items",  label: "GF Fried",       filter: (r) => r.gf_food_categories?.includes("gf_fried_items") ?? false },
  { id: "gf_desserts",     label: "GF Desserts",    filter: (r) => r.gf_food_categories?.includes("gf_desserts") ?? false },
];

const PLACE_TYPE_CHIPS: Chip[] = [
  { id: "pt_bar",         label: "Bar",         filter: (r) => r.place_type?.includes("bar") ?? false },
  { id: "pt_cafe",        label: "Café",         filter: (r) => r.place_type?.includes("cafe") ?? false },
  { id: "pt_bakery",      label: "Bakery",       filter: (r) => r.place_type?.includes("bakery") ?? false },
  { id: "pt_fast_casual", label: "Fast Casual",  filter: (r) => r.place_type?.includes("fast_casual") ?? false },
  { id: "pt_fine_dining", label: "Fine Dining",  filter: (r) => r.place_type?.includes("fine_dining") ?? false },
  { id: "pt_brunch",      label: "Brunch Spot",  filter: (r) => r.place_type?.includes("brunch_spot") ?? false },
  { id: "pt_pizzeria",    label: "Pizzeria",      filter: (r) => r.place_type?.includes("pizzeria") ?? false },
];

const ALL_CHIPS = [...GF_CHIPS, ...PLACE_TYPE_CHIPS];

function RestaurantCard({ r }: { r: TopRestaurant }) {
  const color = getGaugeColor(r.score);
  return (
    <Link
      href={`/restaurant/${r.id}`}
      className="group flex flex-col justify-between p-4 md:p-5 border transition-colors duration-150"
      style={{ borderColor: "oklch(0.2 0 0)", backgroundColor: "oklch(0.1 0 0)" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = color)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "oklch(0.2 0 0)")}
    >
      {/* Name + score row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <span
          className="font-[family-name:var(--font-display)] leading-tight text-white group-hover:text-[#FF7444] transition-colors"
          style={{ fontSize: "clamp(1.05rem, 3vw, 1.35rem)", letterSpacing: "0.02em" }}
        >
          {r.name}
        </span>
        <div className="flex flex-col items-end shrink-0">
          <span
            className="font-[family-name:var(--font-display)] leading-none tabular-nums"
            style={{ fontSize: "clamp(1.5rem, 4vw, 1.9rem)", color }}
          >
            {r.score}
          </span>
          <span className="font-mono text-[8px] uppercase tracking-[0.12em] mt-0.5" style={{ color: `${color}bb` }}>
            GF Score
          </span>
        </div>
      </div>
      {/* Neighborhood / cuisine */}
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[oklch(0.65_0_0)] leading-snug">
        {[r.neighborhood, r.cuisine].filter(Boolean).join(" · ")}
      </span>
    </Link>
  );
}

export function TopRatedSection({ restaurants, city }: { restaurants: TopRestaurant[]; city: string }) {
  const [activeChip, setActiveChip] = useState<string | null>(null);

  const activeFilter = ALL_CHIPS.find((c) => c.id === activeChip);
  const filtered = activeFilter
    ? restaurants.filter(activeFilter.filter).slice(0, 6)
    : restaurants.slice(0, 6);

  return (
    <section className="max-w-5xl mx-auto px-4 md:px-8 pt-4 md:pt-10 pb-10">
      <h2
        className="font-mono text-[11px] uppercase tracking-[0.25em] mb-5"
        style={{ color: "oklch(0.65 0 0)" }}
      >
        Top Rated in {city}
      </h2>

      {/* Filter chips */}
      <div className="flex flex-col gap-3 mb-6">
        {([
          { chips: GF_CHIPS,         label: "GF Features" },
          { chips: PLACE_TYPE_CHIPS, label: "Place Type"  },
        ] as const).map(({ chips, label }, rowIdx) => {
          const visibleChips = chips.filter((chip) => restaurants.some(chip.filter));
          if (visibleChips.length === 0) return null;
          return (
            <div key={rowIdx}>
              <p className="font-mono text-[9px] uppercase tracking-[0.25em] mb-1.5" style={{ color: "oklch(0.52 0 0)" }}>
                {label}
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
                {visibleChips.map((chip) => {
                  const isActive = activeChip === chip.id;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => setActiveChip(isActive ? null : chip.id)}
                      className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 border font-mono text-[10px] uppercase tracking-[0.15em] transition-all duration-150"
                      style={{
                        borderColor: isActive ? "#FF7444" : "oklch(0.28 0 0)",
                        backgroundColor: isActive ? "#FF744430" : "oklch(0.1 0 0)",
                        color: isActive ? "#FF7444" : "oklch(0.68 0 0)",
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      {chip.label}
                      {isActive && <span className="text-[9px] opacity-70">×</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cards grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {filtered.map((r) => <RestaurantCard key={r.id} r={r} />)}
        </div>
      ) : (
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.58_0_0)] py-8 text-center">
          No results for this filter
        </p>
      )}
    </section>
  );
}
