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
          className="font-mono text-ui-sm uppercase tracking-label mt-2 transition-colors text-text-disabled hover:text-text-tertiary"
        >
          {expanded ? "Show less ↑" : "Read more ↓"}
        </button>
      )}
    </div>
  );
}
