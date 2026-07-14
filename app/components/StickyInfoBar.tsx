"use client";

import { useEffect, useState } from "react";
import { getGaugeColor } from "@/lib/score";

export function StickyInfoBar({
  name,
  score,
  googleMapsUrl,
}: {
  name: string;
  score: number | null;
  googleMapsUrl: string | null;
}) {
  const [visible, setVisible] = useState(false);
  const color = getGaugeColor(score);

  useEffect(() => {
    const handler = () => setVisible(window.scrollY > 280);
    window.addEventListener("scroll", handler, { passive: true });
    handler(); // check on mount
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <div
      className="md:hidden fixed left-0 right-0 z-40 transition-transform duration-200 ease-out"
      style={{
        top: "64px",
        transform: visible ? "translateY(0)" : "translateY(-110%)",
        backgroundColor: "var(--surface-raised)",
        borderBottom: "1px solid var(--border-default)",
      }}
    >
      <div className="flex items-center justify-between gap-3 px-4 h-12">
        {/* Name */}
        <span
          className="font-[family-name:var(--font-display)] text-text-primary leading-none truncate flex-1 min-w-0"
          style={{ fontSize: "1.2rem", letterSpacing: "0.02em" }}
        >
          {name}
        </span>

        {/* Score badge */}
        {score !== null && (
          <div
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 border font-mono text-ui-md font-semibold uppercase tracking-snug"
            style={{ borderColor: `${color}50`, color, backgroundColor: `${color}0D` }}
          >
            <span>{score}</span>
            <span style={{ color: "var(--text-disabled)" }}>GF</span>
          </div>
        )}

        {/* Directions */}
        {googleMapsUrl && (
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 font-mono text-ui-sm uppercase tracking-label px-3 py-1.5 border transition-colors"
            style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent-foreground)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--accent)"; }}
          >
            Directions
          </a>
        )}
      </div>
    </div>
  );
}
