"use client";

import { useState } from "react";
import type React from "react";

export function CollapsibleText({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
  const [expanded, setExpanded] = useState(false);
  const words = text.split(" ");
  const isLong = words.length > 60;
  const preview = isLong && !expanded ? words.slice(0, 60).join(" ") + "…" : text;

  return (
    <div>
      <p className={className} style={style}>{preview}</p>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="font-mono text-[10px] uppercase tracking-[0.15em] mt-2 transition-colors text-[oklch(0.48_0_0)] hover:text-[oklch(0.72_0_0)]"
        >
          {expanded ? "Show less ↑" : "Read more ↓"}
        </button>
      )}
    </div>
  );
}
