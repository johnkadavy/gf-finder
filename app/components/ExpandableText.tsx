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
          className="font-mono text-ui-sm uppercase tracking-snug text-text-label hover:text-text-secondary transition-colors"
        >
          more
        </button>
      )}
    </span>
  );
}
