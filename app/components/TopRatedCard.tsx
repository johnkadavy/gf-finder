"use client";

import Link from "next/link";
import { getGaugeColor } from "@/lib/score";

type TopRestaurant = {
  id: number;
  name: string;
  neighborhood: string | null;
  cuisine: string | null;
  score: number | null;
};

export function TopRatedCard({ r }: { r: TopRestaurant }) {
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
