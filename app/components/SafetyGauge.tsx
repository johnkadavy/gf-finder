"use client";

import { useEffect, useState } from "react";
import { getScoreLabel, getGaugeColor } from "@/lib/score";

export function SafetyGauge({ score }: { score: number | null }) {
  const { label } = getScoreLabel(score);
  const gaugeColor = getGaugeColor(score);
  const targetPct = score ?? 0;
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
    <div
      className="flex flex-col items-center justify-center p-6 border min-w-[180px]"
      style={{ backgroundColor: "oklch(0.1 0 0)", borderColor: "oklch(0.22 0 0)" }}
    >
      {/* Gauge ring */}
      <div
        className="relative w-36 h-36 flex items-center justify-center"
        style={{ filter: score ? `drop-shadow(0 0 12px ${gaugeColor}50)` : "none" }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: score
              ? `conic-gradient(from 180deg at 50% 50%, ${gaugeColor} 0%, ${gaugeColor} ${currentPct}%, oklch(0.22 0 0) ${currentPct}%)`
              : "oklch(0.22 0 0)",
          }}
        />
        <div
          className="absolute inset-[5px] rounded-full flex flex-col items-center justify-center"
          style={{ backgroundColor: "oklch(0.1 0 0)" }}
        >
          {score !== null ? (
            <>
              <span
                className="text-5xl leading-none tabular-nums font-[family-name:var(--font-display)] tracking-wide"
                style={{ color: gaugeColor }}
              >
                {displayNumber}
              </span>
              <span className="font-mono text-[8px] uppercase tracking-[0.25em] mt-1 text-[oklch(0.4_0_0)]">
                Score
              </span>
            </>
          ) : (
            <span className="font-mono text-xs text-[oklch(0.4_0_0)]">No data</span>
          )}
        </div>
      </div>

      {/* Label */}
      <div className="mt-4 border px-3 py-1" style={{ borderColor: `${gaugeColor}40` }}>
        <span
          className="font-mono text-[9px] uppercase tracking-[0.25em]"
          style={{ color: gaugeColor }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
