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

const CHIPS: Chip[] = [
  { id: "dedicated_gf",  label: "Dedicated GF",  filter: (r) => r.isDedicatedGf },
  { id: "gf_fryer",      label: "GF Fryer",       filter: (r) => r.hasGfFryer },
  // TODO: Re-enable GF food category chips once pipeline Tasks P5-P7 are complete
  // { id: "gf_pizza",   label: "GF Pizza",       filter: (r) => r.isGfPizza },
  // { id: "gf_pasta",   label: "GF Pasta",       filter: (r) => r.isGfPasta },
  // { id: "gf_bakery",  label: "GF Bakery",      filter: (r) => r.isGfBakery },
];

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
      <div className="flex flex-col gap-1.5 mb-4">
        <span
          className="font-[family-name:var(--font-display)] leading-tight text-white group-hover:text-[#FF7444] transition-colors"
          style={{ fontSize: "clamp(1.05rem, 3vw, 1.35rem)", letterSpacing: "0.02em" }}
        >
          {r.name}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[oklch(0.48_0_0)] leading-snug">
          {[r.neighborhood, r.cuisine].filter(Boolean).join(" · ")}
        </span>
      </div>
      <div
        className="self-start px-2.5 py-1 border font-mono text-[10px] uppercase tracking-[0.15em] font-semibold"
        style={{ borderColor: `${color}50`, color }}
      >
        {r.score} GF Score
      </div>
    </Link>
  );
}

export function TopRatedSection({ restaurants, city }: { restaurants: TopRestaurant[]; city: string }) {
  const [activeChip, setActiveChip] = useState<string | null>(null);

  const activeFilter = CHIPS.find((c) => c.id === activeChip);
  const filtered = activeFilter
    ? restaurants.filter(activeFilter.filter).slice(0, 6)
    : restaurants.slice(0, 6);

  return (
    <section className="max-w-5xl mx-auto px-4 md:px-8 pt-10 md:pt-14 pb-10">
      <h2
        className="font-mono text-[11px] uppercase tracking-[0.25em] mb-5"
        style={{ color: "oklch(0.5 0 0)" }}
      >
        Top Rated in {city}
      </h2>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-6 scrollbar-none" style={{ scrollbarWidth: "none" }}>
        {CHIPS.map((chip) => {
          const isActive = activeChip === chip.id;
          const hasResults = restaurants.some(chip.filter);
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => setActiveChip(isActive ? null : chip.id)}
              disabled={!hasResults}
              className="shrink-0 px-3.5 py-1.5 border font-mono text-[10px] uppercase tracking-[0.15em] transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                borderColor: isActive ? "#FF7444" : "oklch(0.28 0 0)",
                backgroundColor: isActive ? "#FF744415" : "oklch(0.1 0 0)",
                color: isActive ? "#FF7444" : "oklch(0.55 0 0)",
              }}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Cards grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {filtered.map((r) => <RestaurantCard key={r.id} r={r} />)}
        </div>
      ) : (
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.38_0_0)] py-8 text-center">
          No results for this filter
        </p>
      )}
    </section>
  );
}
