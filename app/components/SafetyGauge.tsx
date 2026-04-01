"use client";

import { useEffect, useState } from "react";
import { getScoreLabel, getGaugeColor } from "@/lib/score";

const sizes = {
  sm: { ring: "w-24 h-24",  numSize: "text-3xl",  labelSize: "text-[5px]",  inset: "inset-[4px]"  },
  md: { ring: "w-40 h-40",  numSize: "text-5xl",  labelSize: "text-[7px]",  inset: "inset-[6px]"  },
  lg: { ring: "w-56 h-56",  numSize: "text-7xl",  labelSize: "text-[9px]",  inset: "inset-[8px]"  },
};

export function SafetyGauge({ score, size = "md" }: { score: number | null; size?: "sm" | "md" | "lg" }) {
  const { label } = getScoreLabel(score);
  const gaugeColor = getGaugeColor(score);
  const targetPct = score ?? 0;
  const s = sizes[size];
  const [currentPct, setCurrentPct] = useState(0);
  const [displayNumber, setDisplayNumber] = useState(0);

  useEffect(() => {
    setCurrentPct(0);
    setDisplayNumber(0);
    if (!score) return;

    const duration = 1200;
    let startTime: number | null = null;
    let raf: number;

    const animate = (ts: number) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrentPct(Math.round(eased * targetPct));
      setDisplayNumber(Math.round(eased * score));
      if (progress < 1) raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [score, targetPct]);

  return (
    <div className="flex flex-col items-center gap-2.5">
      {/* Gauge ring */}
      <div
        className={`relative ${s.ring} flex items-center justify-center`}
        style={{ filter: score ? `drop-shadow(0 0 6px ${gaugeColor}20)` : "none" }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: score
              ? `conic-gradient(from 180deg at 50% 50%, ${gaugeColor} 0%, ${gaugeColor} ${currentPct}%, oklch(0.2 0 0) ${currentPct}%)`
              : "oklch(0.2 0 0)",
          }}
        />
        <div
          className={`absolute ${s.inset} rounded-full flex flex-col items-center justify-center`}
          style={{ backgroundColor: "oklch(0.08 0 0)" }}
        >
          {score !== null ? (
            <>
              <span
                className={`${s.numSize} leading-none tabular-nums font-[family-name:var(--font-display)]`}
                style={{ color: gaugeColor }}
              >
                {displayNumber}
              </span>
              <span className={`font-mono ${s.labelSize} uppercase tracking-[0.2em] mt-1.5 text-[oklch(0.55_0_0)]`}>
                GF Score
              </span>
            </>
          ) : (
            <span className="font-mono text-xs text-[oklch(0.4_0_0)]">No data</span>
          )}
        </div>
      </div>

      {/* Descriptor */}
      <div
        className="px-4 py-1.5 border"
        style={{ borderColor: `${gaugeColor}40` }}
      >
        <span
          className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em]"
          style={{ color: gaugeColor }}
        >
          {label}
        </span>
      </div>

    </div>
  );
}
