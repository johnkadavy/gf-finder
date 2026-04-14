"use client";
import { useState } from "react";

export function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <span>
      <span className={expanded ? "" : "line-clamp-1"}>{text}</span>
      {!expanded && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(true); }}
          className="font-mono text-[10px] uppercase tracking-[0.1em] text-[oklch(0.65_0_0)] hover:text-[oklch(0.85_0_0)] transition-colors"
        >
          more
        </button>
      )}
    </span>
  );
}
